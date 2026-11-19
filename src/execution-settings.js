export const defaults = { cpuSeconds: 3, wallSeconds: 8, memoryMiB: 250, examMinutes: 0 }

export const limitFields = [
  { name: 'cpuSeconds', label: 'CPU time (seconds)', min: 1, max: 15 },
  { name: 'wallSeconds', label: 'Wall-clock time (seconds)', min: 1, max: 20 },
  { name: 'memoryMiB', label: 'Memory (MiB)', min: 32, max: 500 },
]
export const examField = { name: 'examMinutes', label: 'Exam timer (minutes, 0 = off)', min: 0, max: 600 }

export const emptyExecutionSettings = () => ({ defaults, languages: {}, sets: {} })

export function limitsFor(settings, set, language, question) {
  const setId = typeof set === 'string' ? set : set.id
  const limits = { ...settings.defaults, ...settings.languages[language], ...settings.sets[setId],
    ...set.limits, ...question?.limits }
  return { ...limits, cpuSeconds: Math.min(limits.cpuSeconds, limits.wallSeconds) }
}

export const questionTimeField = { name: 'questionMinutes', label: 'Time per question (minutes)', min: 0, max: 600 }
export const setLimitFields = [...limitFields, examField, questionTimeField]
export const questionLimitFields = [...limitFields, questionTimeField]

export function validLimitOverrides(value, fields) {
  return value === undefined || (value && typeof value === 'object' && !Array.isArray(value)
    && Object.entries(value).every(([name, number]) => fields.some(field =>
      field.name === name && Number.isInteger(number) && number >= field.min && number <= field.max))
    && !(value.cpuSeconds > value.wallSeconds))
}
