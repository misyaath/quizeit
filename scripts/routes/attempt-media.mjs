import { Controller, Delete, Get, Inject, Module, Post, Put } from '@nestjs/common'
import { APP_DATA, ATTEMPTS } from '../backend-services.module.mjs'
import { validUuid } from '../attempt-draft.mjs'
import { addFrame, addWebcamFrame, checkFrame, checkWebcamFrame, endCapture, recordPresence, requireExamCapture } from '../capture-state.mjs'
import { json, readBody } from '../http.mjs'
import { ApiError } from '../openai.mjs'
import { currentUser, requestUser } from '../request-user.mjs'
import { bindRoute } from './nest-http.mjs'
import { gradeVideoResponse } from '../../src/attempts.js'
import { pointsFor } from '../../packages/assessment/grading.js'
import { PLUGINS } from '../../apps/server/plugins/runtime.mjs'
import { resultSummary } from '../../packages/assessment/results.js'

function requireReviewer() {
  if (currentUser().role !== 'admin') throw new ApiError(403, 'Only administrators can review submitted media.')
}
const reviewable = attempt => Boolean(attempt.activity?.capture || Object.values(attempt.answers ?? {}).some(value => value?.mediaId))

class AttemptMediaController {
  constructor(data, attempts, plugins) {
    this.data = data
    this.attempts = attempts
    this.plugins = plugins
  }

  async draftFor(setId, draftId) {
    if (!validUuid(draftId)) throw new ApiError(400, 'Invalid attempt.')
    const draft = (await this.data.progress.read()).attempts[setId]
    if (draft?.draftId !== draftId || draft.submitted || !draft.setSnapshot) throw new ApiError(409, 'Open the active attempt first.')
    return draft
  }

  async video({ req }, res) {
    const { setId, draftId, questionId } = req.params
    const draft = await this.draftFor(setId, draftId)
    const question = draft.setSnapshot.questions.find(item => item.id === questionId && item.type === 'video')
    if (!question) throw new ApiError(404, 'Video question not found.')
    requireExamCapture(draft, questionId)
    const file = await this.data.media.upload(req, { kind: 'video', ownerId: req.user._id, setId, draftId, questionId }, question.videoSeconds)
    const answer = { mediaId: file.id, duration: file.duration }
    let replaced
    try {
      await this.attempts.updateDraft(setId, draftId, current => {
        requireExamCapture(current, questionId)
        replaced = current.answers[questionId]?.mediaId
        return { ...current, answers: { ...current.answers, [questionId]: answer } }
      })
    } catch (error) {
      await this.data.media.remove(file.id).catch(() => {})
      throw error
    }
    if (replaced) await this.data.media.remove(replaced).catch(() => {})
    return json(res, { answer }, 201)
  }

  async removeVideo({ req }, res) {
    const { setId, draftId, questionId, id } = req.params
    await this.attempts.updateDraft(setId, draftId, current => {
      requireExamCapture(current, questionId)
      if (current.answers[questionId]?.mediaId !== id || !validUuid(id)) throw new ApiError(404, 'Video answer not found.')
      const answers = { ...current.answers }
      delete answers[questionId]
      return { ...current, answers }
    })
    await this.data.media.remove(id).catch(() => {})
    return json(res, {})
  }

  async screenshot({ req, url }, res) {
    const { questionId } = req.params
    const sessionId = url.searchParams.get('session')
    const reason = url.searchParams.get('reason')
    if (!validUuid(sessionId) || !['start', 'open', 'interval', 'away', 'returned'].includes(reason)) throw new ApiError(400, 'Invalid screen sharing session.')
    const identity = { sessionId, reason, questionId, requestId: url.searchParams.get('request'), recording: url.searchParams.get('recording') === 'true',
      surface: url.searchParams.get('surface') === 'window' ? 'window' : 'tab' }
    return this.saveEvidence(req, res, identity, 'screenshot', 'screenshots', checkFrame, addFrame)
  }

  async webcam({ req, url }, res) {
    const { questionId } = req.params
    const sessionId = url.searchParams.get('session')
    if (!validUuid(sessionId)) throw new ApiError(400, 'Invalid screen sharing session.')
    const reason = url.searchParams.get('reason') ?? 'interval'
    if (!['interval', 'away', 'returned'].includes(reason)) throw new ApiError(400, 'Invalid webcam capture reason.')
    const identity = { sessionId, questionId, requestId: url.searchParams.get('request'), reason }
    return this.saveEvidence(req, res, identity, 'webcam', 'webcamPhotos', checkWebcamFrame, addWebcamFrame)
  }

  async saveEvidence(req, res, identity, kind, collection, check, add) {
    const { setId, draftId, questionId } = req.params
    if (identity.requestId && !validUuid(identity.requestId)) throw new ApiError(400, 'Invalid image upload.')
    const existingId = draft => identity.requestId && draft.activity?.capture?.[collection]?.find(frame =>
      frame.requestId === identity.requestId && frame.sessionId === identity.sessionId && frame.questionId === questionId)?.id
    const draft = await this.draftFor(setId, draftId)
    const previous = existingId(draft)
    if (previous) {
      req.resume()
      return json(res, { id: previous })
    }
    check(draft, identity)
    const file = await this.data.media.upload(req, { kind, ownerId: req.user._id, setId, draftId, questionId })
    let reused
    try {
      await this.attempts.updateDraft(setId, draftId, current => {
        reused = existingId(current)
        return reused ? current : add(current, identity, file.id)
      })
    } catch (error) {
      await this.data.media.remove(file.id).catch(() => {})
      throw error
    }
    if (reused) await this.data.media.remove(file.id).catch(() => {})
    return json(res, { id: reused || file.id }, reused ? 200 : 201)
  }

  async stop({ req }, res) {
    const { setId, draftId } = req.params
    const { sessionId } = await readBody(req)
    if (!validUuid(sessionId)) throw new ApiError(400, 'Invalid screen sharing session.')
    await this.attempts.updateDraft(setId, draftId, current => ({
      ...current, activity: endCapture(current.activity, sessionId),
    }))
    return json(res, {})
  }

  async presence({ req }, res) {
    const { setId, draftId } = req.params
    const { sessionId, type, source } = await readBody(req, 2000)
    if (!validUuid(sessionId) || !['away', 'returned'].includes(type) || !['visibility', 'focus'].includes(source)) {
      throw new ApiError(400, 'Invalid exam focus event.')
    }
    await this.attempts.updateDraft(setId, draftId, current => recordPresence(current, sessionId, type, source))
    return json(res, {})
  }

  async file({ req }, res) {
    if (!validUuid(req.params.id)) throw new ApiError(404, 'Media not found.')
    const file = await this.data.media.find(req.params.id)
    if (!file) throw new ApiError(404, 'Media not found.')
    const { ownerId, draftId, questionId, kind } = file.metadata
    if (ownerId !== req.user._id) {
      requireReviewer()
      const progress = await this.data.reviewProgress(await this.data.reviewAccount(ownerId))
      const attempt = progress.history.find(item => item.id === draftId)
      const capture = attempt?.activity?.capture
      const linked = kind === 'video' ? attempt?.answers[questionId]?.mediaId === file._id
        : (kind === 'webcam' ? capture?.webcamPhotos : capture?.screenshots)?.some(item => item.id === file._id)
      if (!linked) throw new ApiError(404, 'Submitted media not found.')
    }
    return this.data.media.send(req, res, file)
  }

  async reviews({ url }, res) {
    requireReviewer()
    const examMode = url.searchParams.get('mode') === 'exam'
    const entries = []
    for (const account of await this.data.reviewAccounts(examMode)) {
      const { history, snapshots } = await this.data.reviewProgress(account)
      for (const attempt of history) {
        const isExam = JSON.parse(snapshots[attempt.snapshotIndex])?.mode === 'exam'
        if (isExam !== examMode || (!isExam && !reviewable(attempt))) continue
        const { id, title, submittedAt, pendingReview } = attempt
        entries.push({ id, title, submittedAt, pendingReview, ownerId: account._id, learner: [account.firstName, account.lastName].join(' ') })
      }
    }
    entries.sort((a, b) => (b.submittedAt ?? '').localeCompare(a.submittedAt ?? ''))
    return json(res, { entries })
  }

  async readReview({ req }, res) {
    requireReviewer()
    const account = await this.data.reviewAccount(req.params.ownerId)
    const progress = await this.data.reviewProgress(account)
    const attempt = progress.history.find(item => item.id === req.params.attemptId)
    const set = attempt && JSON.parse(progress.snapshots[attempt.snapshotIndex])
    if (!set || (set.mode !== 'exam' && !reviewable(attempt))) throw new ApiError(404, 'Submitted attempt not found.')
    return json(res, { attempt, set })
  }

  async grade({ req }, res) {
    requireReviewer()
    const { correct, points } = await readBody(req)
    if (points === undefined && typeof correct !== 'boolean') throw new ApiError(400, 'Choose a grade.')
    const account = await this.data.reviewAccount(req.params.ownerId)
    let reviewed, mode
    await requestUser.run(account, () => this.data.progress.update(progress => {
      const entry = progress.history.find(item => item.id === req.params.attemptId)
      if (!entry) throw new ApiError(404, 'Submitted attempt not found.')
      const set = JSON.parse(progress.snapshots[entry.snapshotIndex])
      mode = set.mode ?? 'practice'
      const question = set.questions.find(item => item.id === req.params.questionId && item.type === 'video')
      if (!question || !entry.answers[question.id]?.mediaId) throw new ApiError(404, 'Submitted video answer not found.')
      const max = pointsFor(set, question)
      if (points !== undefined && (!Number.isInteger(points) || points < 0 || points > max)) {
        throw new ApiError(400, 'Enter points between 0 and ' + max + '.')
      }
      reviewed = gradeVideoResponse(entry, set, question.id, points ?? correct)
      return { ...progress, history: progress.history.map(item => item === entry ? reviewed : item) }
    }))
    void this.plugins.emit('attempt.graded', resultSummary(reviewed, mode))
    return json(res, { attempt: reviewed })
  }
}

Controller('api/attempt-media')(AttemptMediaController)
Inject(APP_DATA)(AttemptMediaController, undefined, 0)
Inject(ATTEMPTS)(AttemptMediaController, undefined, 1)
Inject(PLUGINS)(AttemptMediaController, undefined, 2)
bindRoute(AttemptMediaController, 'video', Post('video/:setId/:draftId/:questionId'))
bindRoute(AttemptMediaController, 'removeVideo', Delete('video/:setId/:draftId/:questionId/:id'))
bindRoute(AttemptMediaController, 'screenshot', Post('screenshot/:setId/:draftId/:questionId'))
bindRoute(AttemptMediaController, 'webcam', Post('webcam/:setId/:draftId/:questionId'))
bindRoute(AttemptMediaController, 'stop', Post('stop/:setId/:draftId'))
bindRoute(AttemptMediaController, 'presence', Post('presence/:setId/:draftId'))
bindRoute(AttemptMediaController, 'file', Get('files/:id'))
bindRoute(AttemptMediaController, 'reviews', Get('reviews'))
bindRoute(AttemptMediaController, 'readReview', Get('reviews/:ownerId/:attemptId'))
bindRoute(AttemptMediaController, 'grade', Put('reviews/:ownerId/:attemptId/:questionId'))

export class AttemptMediaModule {}
Module({ controllers: [AttemptMediaController] })(AttemptMediaModule)
