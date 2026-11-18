export const defaults = { cpuSeconds: 3, wallSeconds: 8, memoryMiB: 250, examMinutes: 0 }

export const limitFields = [
  { name: 'cpuSeconds', label: 'CPU time (seconds)', min: 1, max: 15 },
  { name: 'wallSeconds', label: 'Wall-clock time (seconds)', min: 1, max: 20 },
  { name: 'memoryMiB', label: 'Memory (MiB)', min: 32, max: 500 },
]
export const examField = { name: 'examMinutes', label: 'Exam timer (minutes, 0 = off)', min: 0, max: 600 }

export const emptyExecutionSettings = () => ({ defaults, languages: {}, sets: {} })

export function limitsFor(settings, setId, language) {
  return { ...settings.defaults, ...settings.languages[language], ...settings.sets[setId] }
}
