import { isCorrect } from './questions/index.js'
import { publicCodingSet } from './coding.js'
import { defaultExamGrading, earnedPoints, examGrading, pointsFor } from '../packages/assessment/grading.js'

export const practicePassPercent = defaultExamGrading.passPercent
export const newAttempt = () => ({ index: 0, answers: {}, flags: [], submitted: false })
export const emptyProgress = () => ({ attempts: {}, history: [], snapshots: [] })

function grading(set, answers, codingResults, videoGrades) {
  let correct = 0
  let pointsEarned = 0
  let pointsPossible = 0
  for (const question of set.questions) {
    const grade = videoGrades?.[question.id]
    const passed = isCorrect(question, answers[question.id], codingResults?.[question.id], grade)
    correct += Number(passed)
    pointsEarned += earnedPoints(set, question, passed, grade)
    pointsPossible += pointsFor(set, question)
  }
  const pendingReview = set.questions.filter(question => question.type === 'video' && answers[question.id]?.mediaId && !videoGrades?.[question.id]).length
  const total = set.questions.length
  const passPercent = examGrading(set).passPercent
  return { correct, total, passed: pendingReview ? null : pointsEarned * 100 >= pointsPossible * passPercent,
    ...(set.mode === 'exam' && { pointsEarned, pointsPossible, passPercent }),
    ...(pendingReview || videoGrades ? { pendingReview } : {}),
  }
}

export function gradeVideoResponse(entry, set, questionId, grade) {
  const question = set.questions.find(item => item.id === questionId)
  const max = pointsFor(set, question)
  const points = typeof grade === 'boolean' ? (grade ? max : 0) : grade
  const videoGrades = { ...entry.videoGrades, [questionId]: { correct: points === max, points } }
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

