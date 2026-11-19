export function newActivity(examMinutes, now = Date.now()) {
  return { startedAt: now, examMinutes, timerVersion: 1, paused: false, submissions: 0, questions: {}, runs: [] }
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
  const { clock, ...saved } = activity
  const activeMs = activeTime(activity)
  const examTime = activity.timerVersion ? activeMs : elapsedMs
  return { ...saved, elapsedMs, activeMs, timeLimitReached: activity.examMinutes > 0 && examTime >= activity.examMinutes * 60_000 }
}

export const activeTime = activity => Object.values(activity?.questions ?? {}).reduce((total, question) => total + (question.visibleMs ?? 0), 0)

export function updateClock(activity, { action, tabId, sequence, questionId, durationMs }, now = Date.now()) {
  const clock = activity.clock
  if (clock?.tabId === tabId && sequence <= clock.sequence) return activity
  if (action === 'start' || action === 'resume') {
    const paused = action === 'start' && Boolean(activity.paused)
    return { ...activity, timerVersion: 1, paused,
      clock: { tabId, sequence, questionId, lastAt: paused ? null : now },
    }
  }
  if (clock?.tabId !== tabId || clock.questionId !== questionId || sequence <= clock.sequence) return activity
  const duration = clock.lastAt == null ? 0 : Math.max(0, Math.min(durationMs, now - clock.lastAt, 10_000))
  const next = duration ? addQuestionTime(activity, questionId, duration) : activity
  return { ...next, timerVersion: 1, paused: action === 'pause' || Boolean(activity.paused),
    clock: { ...clock, sequence, lastAt: action === 'tick' && !activity.paused && clock.lastAt !== null ? now : null },
  }
}
