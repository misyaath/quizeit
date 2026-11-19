export function resultSummary(entry, mode) {
  return {
    id: entry.id,
    setId: entry.setId,
    title: entry.title,
    mode,
    submittedAt: entry.submittedAt,
    pointsEarned: entry.pointsEarned ?? entry.correct,
    pointsPossible: entry.pointsPossible ?? entry.total,
    passed: entry.passed,
    pendingReview: entry.pendingReview ?? 0,
  }
}
