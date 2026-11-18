import { isCorrect } from './questions/index.js'
import { publicCodingSet } from './coding.js'

export const practicePassPercent = 70
export const newAttempt = () => ({ index: 0, answers: {}, flags: [], submitted: false })
export const emptyProgress = () => ({ attempts: {}, history: [], snapshots: [] })

export function recordSubmission(progress, set, attempt, id, submittedAt) {
  const { attempts, history, snapshots } = progress
  if (attempt.submitted && submittedAt !== null) return progress
  const { answers, flags, codingResults, activity } = attempt
  const snapshot = JSON.stringify(publicCodingSet(set))
  const existing = snapshots.indexOf(snapshot)
  const snapshotIndex = existing === -1 ? snapshots.length : existing
  const correct = set.questions.filter(question => isCorrect(question, answers[question.id], codingResults?.[question.id])).length
  const total = set.questions.length
  const entry = {
    id, setId: set.id, title: set.title, snapshotIndex, submittedAt,
    correct, total, passed: correct * 100 >= total * practicePassPercent, answers, flags,
    ...(codingResults && { codingResults }),
    ...(activity && { activity }),
  }
  return {
    attempts: { ...attempts, [set.id]: { ...attempt, submitted: true, resultId: id } },
    history: [...history, entry],
    snapshots: existing === -1 ? [...snapshots, snapshot] : snapshots,
  }
}

