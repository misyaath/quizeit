import { importBrowserAttempts } from '../import-attempts.mjs'
import { cleanDraft, validUuid } from '../attempt-draft.mjs'
import { addQuestionTime, newActivity } from '../attempt-activity.mjs'
import { ApiError } from '../openai.mjs'
import { json, readBody } from '../http.mjs'
import { codingLanguages, publicCodingCatalog } from '../../src/coding.js'
import { examField, limitFields, limitsFor } from '../../src/execution-settings.js'

export function registerPracticeRoutes(router, { getCatalog, getSets, progress, executionSettings, attempts }) {
  router.add('GET', '/api/catalog', async ({ res }) => json(res, publicCodingCatalog(await getCatalog())))
  router.add('GET', '/api/execution-settings', async ({ res }) => json(res, await executionSettings.read()))
  router.add('POST', '/api/execution-settings', async ({ req, res, host }) => {
    if (req.headers.origin !== 'http://' + host) throw new ApiError(403, 'Configure limits from the local quiz.')
    const { scope, id, values } = await readBody(req)
    if (!['defaults', 'sets', 'languages'].includes(scope)
      || (scope === 'languages' && !Object.hasOwn(codingLanguages, id))
      || (scope === 'sets' && !(await getSets()).some(item => item.id === id))) throw new ApiError(400, 'Select a valid limit scope.')
    const fields = scope === 'languages' ? limitFields : [...limitFields, examField]
    if (values !== null && (!fields.every(({ name, min, max }) =>
      Number.isInteger(values?.[name]) && values[name] >= min && values[name] <= max)
      || values.cpuSeconds > values.wallSeconds)) throw new ApiError(400, 'Enter limits within the displayed ranges. CPU time cannot exceed wall-clock time.')
    if (values === null && scope === 'defaults') throw new ApiError(400, 'Global defaults are required.')
    return json(res, await executionSettings.update(current => {
      const clean = values && Object.fromEntries(fields.map(({ name }) => [name, values[name]]))
      if (scope === 'defaults') return { ...current, defaults: clean }
      const overrides = { ...current[scope] }
      if (clean) overrides[id] = clean
      else delete overrides[id]
      return { ...current, [scope]: overrides }
    }))
  })
  router.add('POST', '/api/progress/time', async ({ req, res, host }) => {
    if (req.headers.origin !== 'http://' + host) throw new ApiError(403, 'Track attempt time from the local quiz.')
    const { setId, draftId, questionId, durationMs } = await readBody(req)
    if (!validUuid(draftId) || !Number.isInteger(durationMs) || durationMs < 1 || durationMs > 15_000
      || typeof questionId !== 'string' || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(questionId)) {
      throw new ApiError(400, 'Invalid question timing.')
    }
    const settings = await executionSettings.read()
    await attempts.updateDraft(setId, draftId, saved => ({
      ...saved, activity: addQuestionTime(saved.activity ?? newActivity(limitsFor(settings, setId).examMinutes), questionId, durationMs),
    }))
    return json(res, {})
  })
  router.add('GET', '/api/progress', async ({ res }) => json(res, await progress.read()))
  router.add('POST', '/api/progress', async ({ req, res }) => {
    const body = await readBody(req, 8_000_000)
    const saved = await attempts.changeAttempt(body)
    if (body.action === 'draft') {
      const { startedAt, examMinutes } = saved.attempts[body.setId].activity
      return json(res, { startedAt, examMinutes })
    }
    return json(res, saved)
  })
  router.add('POST', '/api/progress/import', async ({ req, res }) => {
    const previous = await readBody(req, 8_000_000)
    const sets = await getSets()
    return json(res, await progress.update(current => importBrowserAttempts(current, previous, sets, cleanDraft)))
  })
}
