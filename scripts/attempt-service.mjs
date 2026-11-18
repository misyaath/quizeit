import { newAttempt, recordSubmission } from '../src/attempts.js'
import { hasResponse } from '../src/questions/index.js'
import { codingLanguages, codingSelection, projectFiles } from '../src/coding.js'
import { limitsFor } from '../src/execution-settings.js'
import { elapsedActivity, includeWorkspaceStats, addRun, newActivity } from './attempt-activity.mjs'
import { cleanDraft, validUuid, workspaceAnswer } from './attempt-draft.mjs'
import { editorCounters } from './editor-workspaces.mjs'
import { ApiError } from './openai.mjs'

export function createAttemptService({ progress, executionSettings, getSets, runCode, editor }) {
  const pendingGrades = new Set()

  async function updateDraft(setId, draftId, change) {
    return progress.update(current => {
      const draft = current.attempts[setId]
      if (draft?.draftId !== draftId || draft.submitted) throw new ApiError(409, 'This attempt changed. Reload the quiz.')
      return { ...current, attempts: { ...current.attempts, [setId]: change(draft) } }
    })
  }

  async function selectCoding(body) {
    const set = (await getSets()).find(item => item.id === body.setId)
    const question = set?.questions.find(item => item.id === body.questionId && item.type === 'coding')
    if (!question) throw new ApiError(404, 'Coding question not found.')
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
      if (existing?.draftId === draftId && existing.activity) return current
      const activity = existing?.activity ?? newActivity(limitsFor(settings, set.id).examMinutes)
      return { ...current, attempts: { ...current.attempts, [set.id]: { ...newAttempt(), index, ...existing, draftId, activity } } }
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
    const set = (await getSets()).find(set => set.id === setId)
    if (!set) throw new ApiError(404, 'This practice set is no longer available.')
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

    function saveAttempt(current) {
      const saved = current.attempts[setId]
      if (alreadySubmitted(current) || (action === 'restart' && saved?.draftId === next.draftId && !saved.submitted)) return current
      checkAttempt(current)
      const activity = action === 'restart' ? newActivity(limitsFor(settings, setId).examMinutes, now)
        : saved?.activity ?? newActivity(limitsFor(settings, setId).examMinutes, now)
      next.activity = action === 'submit' ? elapsedActivity(includeWorkspaceStats(activity, workspaceMetrics), submittedAt) : activity
      if (action === 'submit') return recordSubmission(current, set, next, next.draftId, submittedAt)
      return { ...current, attempts: { ...current.attempts, [setId]: next } }
    }
    if (action !== 'submit') return progress.update(saveAttempt)

    const previous = await progress.read()
    if (alreadySubmitted(previous)) return previous
    checkAttempt(previous)
    // Grading calls the runner outside the store's serialized writes.
    if (pendingGrades.has(setId)) throw new ApiError(409, 'This practice set is already being graded.')
    pendingGrades.add(setId)
    try {
      await savedDraft(set, next.draftId, next.index, settings)
      await updateDraft(setId, next.draftId, saved => ({
        ...saved, answers: next.answers, flags: next.flags, index: next.index,
        activity: { ...saved.activity, submissions: saved.activity.submissions + 1 },
      }))
      for (const question of set.questions.filter(item => item.type === 'coding')) {
        const stats = await prepareAnswer(set, question, next)
        if (stats) workspaceMetrics[question.id] = stats
        const answer = next.answers[question.id]
        if (!hasResponse(answer)) continue
        const language = codingSelection(question, answer.language)
        next.codingResults ??= {}
        const began = new Date().toISOString()
        try {
          const result = await runCode(question, answer.language, answer.code?.[answer.language] ?? language.starter, false,
            { files: projectFiles(language, answer), limits: limitsFor(settings, setId, answer.language) })
          next.codingResults[question.id] = result
          await recordRun(setId, next.draftId, question.id, answer.language, 'submit', began, result)
        } catch (error) {
          await recordRun(setId, next.draftId, question.id, answer.language, 'submit', began)
          throw error
        }
      }
      return await progress.update(saveAttempt)
    } finally {
      pendingGrades.delete(setId)
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

  return { updateDraft, selectCoding, savedDraft, changeAttempt, recordRun }
}
