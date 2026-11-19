import { newAttempt, recordSubmission } from '../src/attempts.js'
import { hasResponse } from '../src/questions/index.js'
import { codingLanguages, codingSelection, projectFiles } from '../src/coding.js'
import { limitsFor } from '../src/execution-settings.js'
import { elapsedActivity, includeWorkspaceStats, addRun, newActivity } from './attempt-activity.mjs'
import { cleanDraft, validUuid, workspaceAnswer } from './attempt-draft.mjs'
import { editorCounters } from './editor-workspaces.mjs'
import { finishCapture, requireExamCapture } from './capture-state.mjs'
import { currentUser } from './request-user.mjs'
import { ApiError } from './openai.mjs'

export function createAttemptService({ progress, executionSettings, getSets, runCode, editor }) {
  const pendingGrades = new Set()
  const canAttemptExam = setId => currentUser()?.role === 'candidate' && currentUser().setId === setId

  async function updateDraft(setId, draftId, change) {
    return progress.update(current => {
      const draft = current.attempts[setId]
      if (draft?.draftId !== draftId || draft.submitted) throw new ApiError(409, 'This attempt changed. Reload the quiz.')
      if (draft.setSnapshot?.mode === 'exam' && !canAttemptExam(setId)) throw new ApiError(404, 'Exam invitation required.')
      return { ...current, attempts: { ...current.attempts, [setId]: change(draft) } }
    })
  }

  const currentSet = async setId => (await getSets()).find(item => item.id === setId)

  async function activeSet(setId, saved) {
    return (!saved?.submitted && saved?.setSnapshot) || currentSet(setId)
  }

  async function selectCoding(body) {
    const saved = (await progress.read()).attempts[body.setId]
    const set = await activeSet(body.setId, saved)
    const question = set?.questions.find(item => item.id === body.questionId && item.type === 'coding')
    if (!question) throw new ApiError(404, 'Coding question not found.')
    if (set.mode === 'exam') {
      if (!canAttemptExam(set.id)) throw new ApiError(404, 'Exam invitation required.')
      if (saved?.draftId !== body.draftId || saved.submitted) throw new ApiError(409, 'Open the active exam first.')
      requireExamCapture(saved, question.id)
    }
    const selection = codingSelection(question, body.language)
    if (!selection) throw new ApiError(400, 'Choose a supported language.')
    return { set, question, selection }
  }

  async function savedDraft(set, draftId, index, settings) {
    if (!validUuid(draftId)) throw new ApiError(400, 'Invalid practice attempt.')
    return (await progress.update(current => {
      const existing = current.attempts[set.id]
      if (existing && (existing.submitted || (existing.draftId && existing.draftId !== draftId))) {
        throw new ApiError(409, 'This attempt changed. Reload the quiz.')
      }
      if (existing?.draftId === draftId && existing.activity && existing.setSnapshot) return current
      const activity = existing?.activity ?? newActivity(limitsFor(settings, set).examMinutes)
      return { ...current, attempts: { ...current.attempts, [set.id]: { ...newAttempt(), index, ...existing, draftId, activity, setSnapshot: existing?.setSnapshot ?? set } } }
    })).attempts[set.id]
  }

  async function prepareAnswer(set, question, draft) {
    const existing = draft.answers[question.id]
    const selected = existing?.language ?? question.languages[0].id
    const stats = Object.fromEntries(editorCounters.map(key => [key, 0]))
    let answer = existing
    const languages = {}
    for (const id of Object.keys(codingLanguages)) {
      const language = codingSelection(question, id)
      const snapshot = await editor.readWorkspace({
        setId: set.id, questionId: question.id, draftId: draft.draftId, language: language.id,
      }, language, { flush: language.id === selected })
      if (!snapshot) continue
      languages[id] = { editor: snapshot.stats }
      for (const counter of editorCounters) stats[counter] += snapshot.stats[counter]
      if (snapshot.edited || typeof existing?.code?.[language.id] === 'string' || existing?.files?.[language.id]) {
        answer = workspaceAnswer(answer, language.id, snapshot)
      }
    }
    if (answer) draft.answers[question.id] = { ...answer, language: selected }
    return Object.keys(languages).length ? { editor: stats, languages } : null
  }

  async function changeAttempt(body) {
    const { action, setId, draft, previousResultId } = body
    if (!['draft', 'restart', 'submit'].includes(action)) throw new ApiError(400, 'Unknown practice action.')
    if (currentUser()?.role === 'candidate' && (!canAttemptExam(setId) || action === 'restart')) {
      throw new ApiError(403, 'This invitation is for one exam attempt.')
    }
    const previous = await progress.read()
    if (action === 'submit' && validUuid(draft?.draftId) && previous.history.some(entry => entry.id === draft.draftId && entry.setId === setId)) return previous
    const latest = await currentSet(setId)
    const set = (action !== 'restart' && !previous.attempts[setId]?.submitted && previous.attempts[setId]?.setSnapshot) || latest
    if (!set) throw new ApiError(404, 'This practice set is no longer available.')
    if (set.mode === 'exam' && !canAttemptExam(setId)) throw new ApiError(404, 'Exam invitation required.')
    const next = cleanDraft(set, draft)
    function alreadySubmitted(current) {
      return action === 'submit' && current.history.some(entry => entry.id === next.draftId && entry.setId === setId)
    }
    function checkAttempt(current) {
      const saved = current.attempts[setId]
      if (action === 'restart') {
        if (!saved?.submitted || saved.resultId !== previousResultId) throw new ApiError(409, 'This attempt changed in another tab. Reload the page.')
      } else if (saved?.submitted || (saved?.draftId && saved.draftId !== next.draftId)) {
        throw new ApiError(409, 'This attempt changed in another tab. Reload the page.')
      }
    }
    const settings = await executionSettings.read()
    const now = Date.now()
    const submittedAt = new Date(now).toISOString()
    const workspaceMetrics = {}

    function keepVideoAnswers(saved) {
      for (const question of set.questions.filter(item => item.type === 'video')) {
        const answer = saved?.answers[question.id]
        if (answer?.mediaId) next.answers[question.id] = answer
        else delete next.answers[question.id]
      }
    }

    function enforceCapture(saved) {
      if (set.mode !== 'exam' || action === 'restart') return
      const draft = saved ?? { setSnapshot: set }
      if (action === 'submit') requireExamCapture(draft)
      for (const question of set.questions) {
        if ((question.type !== 'video'
          && JSON.stringify(next.answers[question.id]) !== JSON.stringify(saved?.answers[question.id]))
          || next.flags.includes(question.id) !== Boolean(saved?.flags.includes(question.id))) {
          requireExamCapture(draft, question.id)
        }
      }
    }

    function saveAttempt(current) {
      const saved = current.attempts[setId]
      if (alreadySubmitted(current) || (action === 'restart' && saved?.draftId === next.draftId && !saved.submitted)) return current
      checkAttempt(current)
      if (action === 'draft') enforceCapture(saved)
      if (action !== 'restart') keepVideoAnswers(saved)
      const examMinutes = latest ? limitsFor(settings, latest).examMinutes : saved?.activity?.examMinutes ?? limitsFor(settings, set).examMinutes
      const activity = action === 'restart' || !saved?.activity ? newActivity(examMinutes, now)
        : { ...saved.activity, examMinutes }
      next.activity = action === 'submit' ? elapsedActivity(finishCapture(includeWorkspaceStats(activity, workspaceMetrics), now), submittedAt) : activity
      if (action === 'submit') return recordSubmission(current, set, next, next.draftId, submittedAt)
      next.setSnapshot = action === 'restart' ? set : saved?.setSnapshot ?? set
      return { ...current, attempts: { ...current.attempts, [setId]: next } }
    }
    if (action !== 'submit') return progress.update(saveAttempt)

    checkAttempt(previous)
    enforceCapture(previous.attempts[setId])
    keepVideoAnswers(previous.attempts[setId])
    // Grading calls the runner outside the store's serialized writes.
    const gradeKey = currentUser()._id + ':' + setId
    if (pendingGrades.has(gradeKey)) throw new ApiError(409, 'This practice set is already being graded.')
    pendingGrades.add(gradeKey)
    try {
      await savedDraft(set, next.draftId, next.index, settings)
      await updateDraft(setId, next.draftId, saved => ({
        ...saved, answers: { ...next.answers, ...Object.fromEntries(set.questions.filter(question => question.type === 'video'
          && saved.answers[question.id]?.mediaId).map(question => [question.id, saved.answers[question.id]])) }, flags: next.flags, index: next.index,
        activity: { ...saved.activity, submissions: saved.activity.submissions + 1 },
      }))
      for (const question of set.questions.filter(item => item.type === 'coding')) {
        const stats = currentUser().legacyOwner ? await prepareAnswer(set, question, next) : null
        if (stats) workspaceMetrics[question.id] = stats
        const answer = next.answers[question.id]
        if (!hasResponse(answer)) continue
        const language = codingSelection(question, answer.language)
        next.codingResults ??= {}
        const began = new Date().toISOString()
        try {
          const result = await runCode(question, answer.language, answer.code?.[answer.language] ?? language.starter, false,
            { files: projectFiles(language, answer), limits: limitsFor(settings, set, answer.language, question) })
          next.codingResults[question.id] = result
          await recordRun(setId, next.draftId, question.id, answer.language, 'submit', began, result)
        } catch (error) {
          await recordRun(setId, next.draftId, question.id, answer.language, 'submit', began)
          throw error
        }
      }
      return await progress.update(saveAttempt)
    } finally {
      pendingGrades.delete(gradeKey)
    }
  }

  async function recordRun(setId, draftId, questionId, language, mode, startedAt, result, stdin, snapshot) {
    return updateDraft(setId, draftId, saved => {
      const activity = addRun(saved.activity, {
        questionId, language, mode, startedAt, finishedAt: new Date().toISOString(),
        status: result ? (result.passed ? 'passed' : 'failed') : 'error',
        passed: result?.tests.filter(test => test.passed).length ?? 0,
        failed: result?.tests.filter(test => !test.passed).length ?? 0,
        cpuSeconds: result?.cpuSeconds, peakMemoryKiB: result?.peakMemoryKiB, limits: result?.limits,
      })
      if (!result || !snapshot) return { ...saved, activity }
      const current = saved.answers[questionId]
      const answer = workspaceAnswer(current, language, snapshot)
      if (current?.language && current.language !== language) answer.language = current.language
      else {
        answer.lastRun = result
        if (stdin !== undefined) answer.stdin = stdin
      }
      return { ...saved, activity, answers: { ...saved.answers, [questionId]: answer } }
    })
  }

  return { currentSet, updateDraft, selectCoding, savedDraft, changeAttempt, recordRun }
}
