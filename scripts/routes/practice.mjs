import { Controller, Get, Inject, Module, Post } from '@nestjs/common'
import { requireExamCapture } from '../capture-state.mjs'
import { importBrowserAttempts } from '../import-attempts.mjs'
import { cleanDraft, validUuid } from '../attempt-draft.mjs'
import { activeTime, newActivity, updateClock } from '../attempt-activity.mjs'
import { ApiError } from '../openai.mjs'
import { json, readBody } from '../http.mjs'
import { codingLanguages, practiceProgress, practiceSet, publicCodingSet } from '../../src/coding.js'
import { examField, limitFields, limitsFor } from '../../src/execution-settings.js'
import { APP_DATA, ATTEMPTS, CATALOG } from '../backend-services.module.mjs'
import { currentUser } from '../request-user.mjs'
import { bindRoute } from './nest-http.mjs'

class PracticeController {
  constructor({ progress, executionSettings }, catalog, attempts) {
    this.progress = progress
    this.executionSettings = executionSettings
    this.catalog = catalog
    this.attempts = attempts
  }

  async readCatalog(_context, res) {
    const user = currentUser()
    if (user.role === 'candidate' && (await this.progress.read()).attempts[user.setId]?.submitted) {
      return json(res, { categories: [], sets: [] })
    }
    const catalog = await this.catalog.getCatalog()
    return json(res, { ...catalog, sets: catalog.sets.map(practiceSet) })
  }

  async readExecutionSettings(_context, res) {
    return json(res, await this.executionSettings.read())
  }

  async saveExecutionSettings({ req, host }, res) {
    if (req.headers.origin !== 'http://' + host) throw new ApiError(403, 'Configure limits from the local quiz.')
    if (currentUser().role !== 'admin') throw new ApiError(403, 'Only an administrator can change shared defaults.')
    const { scope, id, values } = await readBody(req)
    if (!['defaults', 'sets', 'languages'].includes(scope)
      || (scope === 'languages' && !Object.hasOwn(codingLanguages, id))
      || (scope === 'sets' && !(await this.catalog.getSets()).some(item => item.id === id))) throw new ApiError(400, 'Select a valid limit scope.')
    const fields = scope === 'languages' ? limitFields : [...limitFields, examField]
    if (values !== null && (!fields.every(({ name, min, max }) =>
      Number.isInteger(values?.[name]) && values[name] >= min && values[name] <= max)
      || values.cpuSeconds > values.wallSeconds)) throw new ApiError(400, 'Enter limits within the displayed ranges. CPU time cannot exceed wall-clock time.')
    if (values === null && scope === 'defaults') throw new ApiError(400, 'Global defaults are required.')
    return json(res, await this.executionSettings.update(current => {
      const clean = values && Object.fromEntries(fields.map(({ name }) => [name, values[name]]))
      if (scope === 'defaults') return { ...current, defaults: clean }
      const overrides = { ...current[scope] }
      if (clean) overrides[id] = clean
      else delete overrides[id]
      return { ...current, [scope]: overrides }
    }))
  }

  async recordQuestionTime({ req }, res) {
    if (req.headers.origin !== req.quizOrigin) throw new ApiError(403, 'Track attempt time from Quizeit.')
    const input = await readBody(req)
    const { setId, draftId, questionId, durationMs, tabId, action, sequence } = input
    if (!validUuid(draftId) || !validUuid(tabId) || !Number.isSafeInteger(sequence) || sequence < 1
      || !['start', 'tick', 'stop', 'pause', 'resume'].includes(action)
      || !Number.isInteger(durationMs) || durationMs < 0 || durationMs > 15_000
      || typeof setId !== 'string' || typeof questionId !== 'string') {
      throw new ApiError(400, 'Invalid question timing.')
    }
    const latest = await this.attempts.currentSet(setId)
    const attempt = (await this.progress.read()).attempts[setId]
    const set = attempt?.setSnapshot ?? latest
    const question = set?.questions.find(item => item.id === questionId)
    if (!question) throw new ApiError(404, 'Question not found in this attempt.')
    const examMinutes = limitsFor(await this.executionSettings.read(), latest ?? set).examMinutes
    const timedQuestion = latest?.questions.find(item => item.id === questionId) ?? question
    const saved = await this.attempts.updateDraft(setId, draftId, draft => {
      if (!['stop', 'pause'].includes(action)) requireExamCapture(draft, questionId)
      return { ...draft, activity: updateClock(draft.activity
        ? { ...draft.activity, examMinutes: latest ? examMinutes : draft.activity.examMinutes }
        : newActivity(examMinutes), input),
      }
    })
    const { activity } = saved.attempts[setId]
    return json(res, {
      paused: Boolean(activity.paused), active: activity.clock?.tabId === tabId && activity.clock.lastAt != null,
      totalMs: activeTime(activity), questionMs: activity.questions[questionId]?.visibleMs ?? 0,
      examMinutes: activity.examMinutes, questionMinutes: timedQuestion.limits?.questionMinutes ?? 0,
    })
  }

  async bankAnswer({ req }, res) {
    const sets = await this.catalog.getSets()
    const set = sets.find(item => item.questions.some(question => question.id === req.params.id))
    if (!set) throw new ApiError(404, 'Question not found.')
    const active = (await this.progress.read()).attempts
    if (Object.values(active).some(draft => !draft.submitted && draft.setSnapshot?.questions.some(q => q.id === req.params.id))
      || (active[set.id] && !active[set.id].submitted && !active[set.id].setSnapshot)) {
      throw new ApiError(409, 'Submit the active attempt before viewing this answer.')
    }
    return json(res, publicCodingSet(set).questions.find(question => question.id === req.params.id))
  }

  async readProgress(_context, res) {
    return json(res, this.visibleProgress(await this.progress.read()))
  }

  visibleProgress(progress) {
    const user = currentUser()
    if (user.role === 'candidate') {
      const attempt = progress.attempts[user.setId]
      const visibleAttempt = attempt?.submitted ? { submitted: true } : attempt
      return practiceProgress({ attempts: visibleAttempt ? { [user.setId]: visibleAttempt } : {}, history: [], snapshots: [] })
    }
    const snapshots = progress.snapshots.map(snapshot => JSON.parse(snapshot)?.mode === 'exam' ? null : snapshot)
    const history = progress.history.filter(entry => snapshots[entry.snapshotIndex] !== null)
    const examResults = new Set(progress.history.filter(entry => snapshots[entry.snapshotIndex] === null).map(entry => entry.id))
    const attempts = Object.fromEntries(Object.entries(progress.attempts).filter(([, draft]) =>
      draft.setSnapshot?.mode !== 'exam' && !examResults.has(draft.resultId)))
    return practiceProgress({ ...progress, attempts, history, snapshots })
  }

  async changeAttempt({ req }, res) {
    const body = await readBody(req, 8_000_000)
    const saved = await this.attempts.changeAttempt(body)
    if (body.action === 'draft') {
      const { activity, setSnapshot } = saved.attempts[body.setId]
      const { clock, ...timing } = activity
      return json(res, { ...timing, ...(body.includeSet && setSnapshot && { practiceSet: practiceSet(setSnapshot) }) })
    }
    return json(res, this.visibleProgress(saved))
  }

  async importProgress({ req }, res) {
    if (!currentUser().legacyOwner) throw new ApiError(403, 'Only the owner can import the previous browser history.')
    const previous = await readBody(req, 8_000_000)
    const sets = await this.catalog.getSets()
    return json(res, practiceProgress(await this.progress.update(current => importBrowserAttempts(current, previous, sets, cleanDraft))))
  }
}

Controller('api')(PracticeController)
Inject(APP_DATA)(PracticeController, undefined, 0)
Inject(CATALOG)(PracticeController, undefined, 1)
Inject(ATTEMPTS)(PracticeController, undefined, 2)
bindRoute(PracticeController, 'readCatalog', Get('catalog'))
bindRoute(PracticeController, 'bankAnswer', Get('bank/:id/answer'))
bindRoute(PracticeController, 'readExecutionSettings', Get('execution-settings'))
bindRoute(PracticeController, 'saveExecutionSettings', Post('execution-settings'))
bindRoute(PracticeController, 'recordQuestionTime', Post('progress/time'))
bindRoute(PracticeController, 'readProgress', Get('progress'))
bindRoute(PracticeController, 'changeAttempt', Post('progress'))
bindRoute(PracticeController, 'importProgress', Post('progress/import'))

export class PracticeModule {}
Module({ controllers: [PracticeController] })(PracticeModule)
