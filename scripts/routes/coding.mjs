import { validUuid } from '../attempt-draft.mjs'
import { ApiError } from '../openai.mjs'
import { json, readBody } from '../http.mjs'
import { codingOptions, maxCodeLength, maxRunOutput, projectFiles } from '../../src/coding.js'
import { limitsFor } from '../../src/execution-settings.js'

export function registerCodingRoutes(router, { runCode, editor, executionSettings, attempts }) {
  router.add('GET', '/api/code/languages', async ({ res }) => {
    const languages = await runCode.listLanguages?.().catch(() => null)
    return json(res, { languages: languages ?? codingOptions(), verified: Boolean(languages) })
  })
  router.add('POST', '/api/editor/workspace', async ({ req, res, url, host }) => {
    if (req.headers.origin !== 'http://' + host) throw new ApiError(403, 'Open VS Code from the local quiz.')
    const identity = await readBody(req)
    const { set, question, selection } = await attempts.selectCoding(identity)
    const settings = await executionSettings.read()
    const draft = await attempts.savedDraft(set, identity.draftId, set.questions.indexOf(question), settings)
    const { editorUrl, cookie } = await editor.openWorkspace(identity, selection, draft.answers[question.id], url.hostname)
    res.setHeader('Set-Cookie', cookie)
    return json(res, { editorUrl, limits: limitsFor(settings, set.id, selection.id),
      startedAt: draft.activity.startedAt, examMinutes: draft.activity.examMinutes })
  })
  router.add('POST', '/api/editor/workspace/status', async ({ req, res, host }) => {
    if (req.headers.origin !== 'http://' + host) throw new ApiError(403, 'Read workspace status from the local quiz.')
    const identity = await readBody(req)
    if (!validUuid(identity.draftId)) throw new ApiError(400, 'Invalid practice attempt.')
    const { selection } = await attempts.selectCoding(identity)
    const value = await editor.readWorkspace(identity, selection)
    return json(res, value ?? {})
  })
  router.add('POST', '/api/code/run', async ({ req, res, host }) => {
    if (req.headers.origin !== 'http://' + host) throw new ApiError(403, 'Run code from the local quiz.')
    const body = await readBody(req, 500_000)
    const { setId, questionId, language, draftId, stdin } = body
    const { set, question, selection } = await attempts.selectCoding(body)
    const settings = await executionSettings.read()
    if (stdin !== undefined && (typeof stdin !== 'string' || stdin.length > maxRunOutput)) throw new ApiError(400, 'Invalid custom input.')
    const limits = limitsFor(settings, setId, language)
    if (draftId !== undefined) {
      await attempts.savedDraft(set, draftId, set.questions.indexOf(question), settings)
      const startedAt = new Date().toISOString()
      const mode = stdin === undefined ? 'examples' : 'custom'
      let result, snapshot
      try {
        snapshot = await editor.readWorkspace(body, selection, { requireEditor: true })
        if (!snapshot.code.trim() && !Object.keys(snapshot.files).length) throw new ApiError(400, 'Enter some code in VS Code before running.')
        result = await runCode(question, language, snapshot.code, true, { files: snapshot.files, stdin, limits })
      } finally {
        await attempts.recordRun(setId, draftId, questionId, language, mode, startedAt, result, stdin, snapshot)
      }
      return json(res, { ...result, code: snapshot.code, files: snapshot.files, stats: snapshot.stats })
    }
    const { code, files } = body
    if (typeof code !== 'string' || (!code.trim() && !selection.files?.length) || code.length > maxCodeLength) {
      throw new ApiError(400, 'Enter a solution within the code size limit.')
    }
    if (files !== undefined && (typeof files !== 'object' || !files || Array.isArray(files)
      || !Object.entries(files).every(([name, source]) => selection.files?.some(file => file.path === name)
        && typeof source === 'string' && source.length <= maxCodeLength))) throw new ApiError(400, 'Invalid project files.')
    return json(res, await runCode(question, language, code, true, { files: projectFiles(selection, { files: { [language]: files } }), stdin, limits }))
  })
}
