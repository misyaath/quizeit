import { createHash, randomUUID } from 'node:crypto'
import { recordSubmission } from '../src/attempts.js'
import { loadQuestionSets } from '../src/questions/load.js'
import { ApiError } from './openai.mjs'

function importId(setId, originalId) {
  return 'imported-' + createHash('sha256').update(JSON.stringify([setId, originalId])).digest('hex').slice(0, 32)
}

export function importBrowserAttempts(current, previous, sets, cleanDraft) {
  if (!previous.attempts || typeof previous.attempts !== 'object'
    || !Array.isArray(previous.history) || !Array.isArray(previous.snapshots)) {
    throw new ApiError(400, 'The previous browser data is invalid.')
  }
  let result = current
  const historyIds = new Set(current.history.map(entry => entry.id))
  const lastImported = new Map()
  const importedSets = new Map()

  function importSubmission(set, entry, sourceId) {
    const id = importId(set.id, sourceId)
    if (!historyIds.has(id)) {
      const attempt = cleanDraft(set, {
        index: 0, answers: entry.answers, flags: entry.flags, draftId: randomUUID(),
      })
      const date = typeof entry.submittedAt === 'string' && !Number.isNaN(Date.parse(entry.submittedAt))
        ? new Date(entry.submittedAt).toISOString()
        : null
      result = recordSubmission(result, set, attempt, id, date)
      historyIds.add(id)
    }
    lastImported.set(set.id, id)
  }

  for (const entry of previous.history) {
    if (typeof entry?.id !== 'string' || !Number.isInteger(entry.snapshotIndex)) {
      throw new ApiError(400, 'A previous result is missing its question snapshot.')
    }
    let set = importedSets.get(entry.snapshotIndex)
    if (!set) {
      try {
        const source = JSON.parse(previous.snapshots[entry.snapshotIndex])
        const document = { ...source, questions: source.questions.map(question => ({ ...question, domain: question.domain.id })) }
        ;[set] = loadQuestionSets([{ file: 'Saved attempt', document }])
        importedSets.set(entry.snapshotIndex, set)
      } catch {
        throw new ApiError(400, 'A previous question snapshot could not be read.')
      }
    }
    importSubmission(set, entry, entry.id)
  }

  const attempts = { ...current.attempts }
  for (const set of sets) {
    const old = Object.hasOwn(previous.attempts, set.id) && previous.attempts[set.id]
    if (!old || Object.hasOwn(attempts, set.id)) continue
    if (old.submitted) {
      if (!lastImported.has(set.id)) importSubmission(set, old, old.resultId ?? set.id)
      attempts[set.id] = { submitted: true, resultId: lastImported.get(set.id), answers: {}, flags: [], index: 0 }
    } else {
      attempts[set.id] = cleanDraft(set, { ...old, draftId: randomUUID() })
    }
  }

  return {
    ...result, attempts,
    history: result.history.slice().sort((a, b) => (a.submittedAt ?? '').localeCompare(b.submittedAt ?? '')),
  }
}
