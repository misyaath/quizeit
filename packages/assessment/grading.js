export const defaultExamGrading = { passPercent: 70, marks: { written: 1, coding: 1, video: 1 } }

export const examGrading = set => set?.grading ?? defaultExamGrading

export function pointsFor(set, question) {
  const category = question.type === 'coding' || question.type === 'video' ? question.type : 'written'
  return examGrading(set).marks[category]
}

export function earnedPoints(set, question, correct, videoGrade) {
  if (question.type === 'video' && Number.isInteger(videoGrade?.points)) return videoGrade.points
  return correct ? pointsFor(set, question) : 0
}
