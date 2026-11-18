import { newAttempt } from '../src/attempts.js'
import { codingLanguages, codingSelection, maxCodeLength, maxRunOutput } from '../src/coding.js'
import { ApiError } from './openai.mjs'

export const validUuid = id => typeof id === 'string' && /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(id)

function cleanCode(question, value) {
  if (!codingSelection(question, value?.language)) return null
  const code = {}
  const files = {}
  for (const [id, source] of Object.entries(value.code ?? {})) {
    if (Object.hasOwn(codingLanguages, id) && typeof source === 'string') code[id] = source.slice(0, maxCodeLength)
  }
  for (const { id, files: definitions = [] } of question.languages) {
    const edited = definitions.filter(({ path }) => typeof value.files?.[id]?.[path] === 'string')
    if (edited.length) files[id] = Object.fromEntries(edited.map(({ path }) => [path, value.files[id][path].slice(0, maxCodeLength)]))
  }
  const result = { language: value.language, code, ...(Object.keys(files).length > 0 && { files }),
    ...(typeof value.stdin === 'string' && { stdin: value.stdin.slice(0, maxRunOutput) }),
  }
  const run = value.lastRun
  if (run?.language === value.language && Array.isArray(run.tests)) {
    const text = (input, limit = maxRunOutput) => typeof input === 'string' ? input.slice(0, limit) : ''
    const custom = run.mode === 'custom' && typeof result.stdin === 'string'
    const templates = custom ? [{ label: 'Custom input' }] : question.tests.filter(test => !test.hidden)
    result.lastRun = {
      language: value.language, runtime: text(run.runtime, 100),
      ...(custom && { mode: 'custom' }),
      ...(run.limits && {
        limits: Object.fromEntries(['cpuSeconds', 'wallSeconds', 'memoryKiB'].filter(key => Number.isFinite(run.limits[key])).map(key => [key, run.limits[key]])),
      }),
      cpuSeconds: Number.isFinite(run.cpuSeconds) ? run.cpuSeconds : undefined,
      peakMemoryKiB: Number.isFinite(run.peakMemoryKiB) ? run.peakMemoryKiB : undefined,
      tests: templates.flatMap(test => {
        const match = run.tests.find(item => item?.label === test.label)
        if (!match) return []
        return [{ label: test.label, expected: test.expected, passed: match.passed === true,
          status: text(match.status, 100), stdout: text(match.stdout), stderr: text(match.stderr),
          compileOutput: text(match.compileOutput), time: Number.isFinite(match.time) ? match.time : null,
          memory: Number.isFinite(match.memory) ? match.memory : null }]
      }),
    }
  }
  return result
}

export function workspaceAnswer(previous, language, snapshot) {
  return { ...previous, language, code: { ...previous?.code, [language]: snapshot.code },
    files: { ...previous?.files, [language]: snapshot.files } }
}

export function cleanDraft(set, draft) {
  if (!validUuid(draft?.draftId) || !Number.isInteger(draft.index) || !draft.answers || !Array.isArray(draft.flags)) {
    throw new ApiError(400, 'Invalid practice attempt.')
  }
  const answers = {}
  for (const question of set.questions) {
    const value = draft.answers[question.id]
    if (question.type === 'coding') {
      const response = cleanCode(question, value)
      if (response) answers[question.id] = response
    }
    if (question.type === 'text' && typeof value === 'string') answers[question.id] = value.slice(0, 4000)
    if (question.type === 'single' && question.options.includes(value)) answers[question.id] = value
    if (['match', 'multi', 'order'].includes(question.type) && Array.isArray(value)) {
      answers[question.id] = value.slice(0, question.options.length).map(option => question.options.includes(option) ? option : '')
    }
  }
  return {
    ...newAttempt(), draftId: draft.draftId, answers,
    index: Math.max(0, Math.min(draft.index, set.questions.length - 1)),
    flags: set.questions.filter(question => draft.flags.includes(question.id)).map(question => question.id),
  }
}
