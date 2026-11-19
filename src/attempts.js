import { isCorrect } from './questions/index.js'
import { publicCodingSet } from './coding.js'

export const practicePassPercent = 70
export const newAttempt = () => ({ index: 0, answers: {}, flags: [], submitted: false })
export const emptyProgress = () => ({ attempts: {}, history: [], snapshots: [] })

function grading(set, answers, codingResults, videoGrades) {
  const correct = set.questions.filter(question =>
    isCorrect(question, answers[question.id], codingResults?.[question.id], videoGrades?.[question.id])).length
  const pendingReview = set.questions.filter(question => question.type === 'video' && answers[question.id]?.mediaId && !videoGrades?.[question.id]).length
  const total = set.questions.length
  return { correct, total, passed: pendingReview ? null : correct * 100 >= total * practicePassPercent,
    ...(pendingReview || videoGrades ? { pendingReview } : {}),
  }
}

export function gradeVideoResponse(entry, set, questionId, correct) {
  const videoGrades = { ...entry.videoGrades, [questionId]: { correct } }
  return { ...entry, videoGrades, ...grading(set, entry.answers, entry.codingResults, videoGrades) }
}

export function recordSubmission(progress, set, attempt, id, submittedAt) {
  const { attempts, history, snapshots } = progress
  if (attempt.submitted && submittedAt !== null) return progress
  const { answers, flags, codingResults, activity } = attempt
  const snapshot = JSON.stringify(publicCodingSet(set))
  const existing = snapshots.indexOf(snapshot)
  const snapshotIndex = existing === -1 ? snapshots.length : existing
  const entry = {
    id, setId: set.id, title: set.title, snapshotIndex, submittedAt,
    ...grading(set, answers, codingResults), answers, flags,
    ...(codingResults && { codingResults }),
    ...(activity && { activity }),
  }
  return {
    attempts: { ...attempts, [set.id]: { ...attempt, submitted: true, resultId: id } },
    history: [...history, entry],
    snapshots: existing === -1 ? [...snapshots, snapshot] : snapshots,
  }
}

