import { isCorrect } from './questions/index.js'
import { summarizeLanguages } from './activity-metrics.js'

export function dashboardAttempts(history, snapshots, sets) {
  const catalog = new Map(sets.map(set => [set.id, set]))
  const saved = new Map()
  return history.map(attempt => {
    const { snapshotIndex } = attempt
    if (!saved.has(snapshotIndex)) {
      try {
        saved.set(snapshotIndex, JSON.parse(snapshots[snapshotIndex]))
      } catch {
        saved.set(snapshotIndex, null)
      }
    }
    const snapshot = saved.get(snapshotIndex)
    const currentSet = catalog.get(attempt.setId)
    return {
      attempt, snapshot,
      providerId: snapshot?.providerId ?? currentSet?.providerId,
      examId: snapshot?.examId ?? currentSet?.examId,
      at: Date.parse(attempt.submittedAt),
      score: attempt.total > 0 ? 100 * attempt.correct / attempt.total : 0,
    }
  }).sort((a, b) => (b.at || 0) - (a.at || 0))
}

export function dashboardReport(entries) {
  let correct = 0
  let total = 0
  let passed = 0
  let visibleMs = 0
  let recordedTime = false
  const domains = new Map()
  const activities = []
  for (const { attempt, snapshot } of entries) {
    if (!attempt.pendingReview) {
      correct += attempt.correct
      total += attempt.total
    }
    if (attempt.passed) passed++
    for (const question of Object.values(attempt.activity?.questions ?? {})) {
      if (Number.isFinite(question.visibleMs)) {
        visibleMs += question.visibleMs
        recordedTime = true
      }
    }

    const runs = attempt.activity?.runs ?? []
    const graded = new Set(runs.filter(run => run.mode === 'submit').map(run => run.questionId))
    const previousGrades = Object.entries(attempt.codingResults ?? {}).flatMap(([id, result]) =>
      result.language && !graded.has(id) ? [{ language: result.language, mode: 'submit' }] : [])
    activities.push({ questions: attempt.activity?.questions, runs: [...runs, ...previousGrades] })

    if (attempt.pendingReview) continue
    for (const question of snapshot?.questions ?? []) {
      if (!question.domain) continue
      const { id, name } = question.domain
      const domain = domains.get(id) ?? { id, name, total: 0, correct: 0 }
      domain.total++
      if (isCorrect(question, attempt.answers?.[question.id], attempt.codingResults?.[question.id], attempt.videoGrades?.[question.id])) domain.correct++
      domains.set(id, domain)
    }
  }

  const focus = [...domains.values()]
    .filter(domain => domain.correct < domain.total)
    .sort((a, b) => a.correct / a.total - b.correct / b.total || (b.total - b.correct) - (a.total - a.correct))

  const languages = summarizeLanguages(activities)
    .sort(([, a], [, b]) => (b.editor?.activeMs ?? 0) - (a.editor?.activeMs ?? 0)
      || (b.exampleRuns ?? 0) + (b.customRuns ?? 0) + (b.gradingRuns ?? 0)
        - (a.exampleRuns ?? 0) - (a.customRuns ?? 0) - (a.gradingRuns ?? 0))
  return { correct, total, passed, visibleMs, recordedTime, focus, languages, domainCount: domains.size }
}
