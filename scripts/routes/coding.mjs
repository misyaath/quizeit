import { Controller, Get, Inject, Module, Post } from '@nestjs/common'
import { validUuid } from '../attempt-draft.mjs'
import { ApiError } from '../openai.mjs'
import { json, readBody } from '../http.mjs'
import { codingOptions, maxCodeLength, maxRunOutput, projectFiles } from '../../src/coding.js'
import { limitsFor } from '../../src/execution-settings.js'
import { APP_DATA, ATTEMPTS, CODING } from '../backend-services.module.mjs'
import { currentUser } from '../request-user.mjs'
import { bindRoute } from './nest-http.mjs'

class CodingController {
  constructor({ runCode, editor }, { executionSettings }, attempts) {
    this.runCode = runCode
    this.editor = editor
    this.executionSettings = executionSettings
    this.attempts = attempts
  }

  async readLanguages(_context, res) {
    const languages = await this.runCode.listLanguages?.().catch(() => null)
    return json(res, { languages: languages ?? codingOptions(), verified: Boolean(languages) })
  }

  async openWorkspace({ req, url, host }, res) {
    if (req.headers.origin !== 'http://' + host) throw new ApiError(403, 'Open VS Code from the local quiz.')
    if (!currentUser().legacyOwner) throw new ApiError(403, 'Use the in-app editor for this account.')
    const identity = await readBody(req)
    const { set, question, selection } = await this.attempts.selectCoding(identity)
    const settings = await this.executionSettings.read()
    const draft = await this.attempts.savedDraft(set, identity.draftId, set.questions.indexOf(question), settings)
    const { editorUrl, cookie } = await this.editor.openWorkspace(identity, selection, draft.answers[question.id], url.hostname)
    res.setHeader('Set-Cookie', cookie)
    return json(res, { editorUrl, limits: limitsFor(settings, set, selection.id, question),
      startedAt: draft.activity.startedAt, examMinutes: draft.activity.examMinutes })
  }

  async readWorkspace({ req, host }, res) {
    if (req.headers.origin !== 'http://' + host) throw new ApiError(403, 'Read workspace status from the local quiz.')
    if (!currentUser().legacyOwner) throw new ApiError(403, 'Use the in-app editor for this account.')
    const identity = await readBody(req)
    if (!validUuid(identity.draftId)) throw new ApiError(400, 'Invalid practice attempt.')
    const { selection } = await this.attempts.selectCoding(identity)
    const value = await this.editor.readWorkspace(identity, selection)
    return json(res, value ?? {})
  }

  async run({ req, host }, res) {
    if (req.headers.origin !== 'http://' + host) throw new ApiError(403, 'Run code from the local quiz.')
    const { runCode, editor, executionSettings, attempts } = this
    const body = await readBody(req, 500_000)
    const { setId, questionId, language, draftId, stdin } = body
    const { set, question, selection } = await attempts.selectCoding(body)
    const settings = await executionSettings.read()
    if (stdin !== undefined && (typeof stdin !== 'string' || stdin.length > maxRunOutput)) throw new ApiError(400, 'Invalid custom input.')
    const limits = limitsFor(settings, set, language, question)
    if (draftId !== undefined && currentUser().legacyOwner) {
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
    const sourceFiles = projectFiles(selection, { files: { [language]: files } })
    if (draftId === undefined) return json(res, await runCode(question, language, code, true, { files: sourceFiles, stdin, limits }))
    await attempts.savedDraft(set, draftId, set.questions.indexOf(question), settings)
    const startedAt = new Date().toISOString()
    const mode = stdin === undefined ? 'examples' : 'custom'
    let result
    try {
      result = await runCode(question, language, code, true, { files: sourceFiles, stdin, limits })
    } finally {
      await attempts.recordRun(setId, draftId, questionId, language, mode, startedAt, result, stdin, { code, files: sourceFiles })
    }
    return json(res, { ...result, code, files: sourceFiles })
  }
}

Controller('api')(CodingController)
Inject(CODING)(CodingController, undefined, 0)
Inject(APP_DATA)(CodingController, undefined, 1)
Inject(ATTEMPTS)(CodingController, undefined, 2)
bindRoute(CodingController, 'readLanguages', Get('code/languages'))
bindRoute(CodingController, 'openWorkspace', Post('editor/workspace'))
bindRoute(CodingController, 'readWorkspace', Post('editor/workspace/status'))
bindRoute(CodingController, 'run', Post('code/run'))

export class CodingModule {}
Module({ controllers: [CodingController] })(CodingModule)
