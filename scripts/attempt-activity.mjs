export function newActivity(examMinutes, now = Date.now()) {
  return { startedAt: now, examMinutes, submissions: 0, questions: {}, runs: [] }
}

export function addQuestionTime(activity, questionId, durationMs) {
  const current = activity.questions[questionId] ?? {}
  return { ...activity, questions: { ...activity.questions,
    [questionId]: { ...current, visibleMs: (current.visibleMs ?? 0) + durationMs },
  } }
}

export function addRun(activity, entry) {
  const current = activity.questions[entry.questionId] ?? {}
  const counter = { custom: 'customRuns', examples: 'exampleRuns', submit: 'gradingRuns' }[entry.mode]
  const language = current.languages?.[entry.language] ?? {}
  return {
    ...activity,
    questions: { ...activity.questions, [entry.questionId]: {
      ...current, [counter]: (current[counter] ?? 0) + 1,
      languages: { ...current.languages, [entry.language]: { ...language, [counter]: (language[counter] ?? 0) + 1 } },
    } },
    runs: [...activity.runs, entry],
  }
}

export function includeWorkspaceStats(activity, metrics) {
  const questions = { ...activity.questions }
  for (const [id, metricsForQuestion] of Object.entries(metrics)) {
    const current = questions[id] ?? {}
    const languages = { ...current.languages }
    for (const [language, stats] of Object.entries(metricsForQuestion.languages)) {
      languages[language] = { ...languages[language], ...stats }
    }
    questions[id] = { ...current, editor: metricsForQuestion.editor, languages }
  }
  return { ...activity, questions }
}

export function elapsedActivity(activity, submittedAt) {
  if (!activity) return undefined
  const elapsedMs = Math.max(0, Date.parse(submittedAt) - activity.startedAt)
  return { ...activity, elapsedMs, timeLimitReached: activity.examMinutes > 0 && elapsedMs >= activity.examMinutes * 60_000 }
}
