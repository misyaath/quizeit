import { randomUUID } from 'node:crypto'
import { Controller, Delete, Get, Inject, Module, Post, Put } from '@nestjs/common'
import { json, readBody } from '../http.mjs'
import { APP_DATA } from '../backend-services.module.mjs'
import { bindRoute } from './nest-http.mjs'
import { ApiError } from '../openai.mjs'

class AuthoringController {
  constructor(data) { this.data = data }

  async list(_context, res) {
    return json(res, await this.data.editableSets())
  }

  async read({ req }, res) {
    return json(res, await this.data.editQuestionSet(req.params.id))
  }

  async save({ req }, res) {
    const input = await readBody(req, 16_000_000)
    const id = req.params.id
    const previous = id && (await this.data.editQuestionSet(id)).document
    if (typeof input.title !== 'string' || !input.title.trim() || input.title.length > 160
      || !Array.isArray(input.questions) || !input.questions.length || input.questions.length > Math.max(240, previous?.questions.length ?? 0)) {
      throw new ApiError(400, 'Enter a title and add at least one question.')
    }
    const existing = new Set(previous?.questions.map(question => question.id))
    const document = {
      ...previous,
      id: id || 'set-' + randomUUID(),
      title: input.title.trim(),
      limits: input.limits,
      difficulty: input.difficulty,
      questions: input.questions.map(question => {
        if (!question || typeof question !== 'object') throw new ApiError(400, 'Invalid question.')
        const { domain, type, prompt, answer, explanation, options, labels, caseStudy, exhibits, languages, tests, limits } = question
        return { id: existing.has(question.id) ? question.id : 'question-' + randomUUID(),
          domain, type, prompt, answer, explanation, options, labels, caseStudy, exhibits, languages, tests, limits }
      }),
    }
    const { saved } = await this.data.writeQuestionSet({
      id, revision: input.revision, document, sharing: input.sharing,
      proposal: { providerId: input.providerId, examId: input.examId, providerName: input.providerName, examName: input.examName },
    })
    return json(res, saved, id ? 200 : 201)
  }

  update(context, res) { return this.save(context, res) }

  async archive({ req }, res) {
    const { revision } = await readBody(req)
    await this.data.archiveQuestionSet(req.params.id, revision)
    return json(res, {})
  }
}

Controller('api/question-sets')(AuthoringController)
Inject(APP_DATA)(AuthoringController, undefined, 0)
bindRoute(AuthoringController, 'list', Get())
bindRoute(AuthoringController, 'read', Get(':id'))
bindRoute(AuthoringController, 'save', Post())
bindRoute(AuthoringController, 'update', Put(':id'))
bindRoute(AuthoringController, 'archive', Delete(':id'))

export class AuthoringModule {}
Module({ controllers: [AuthoringController] })(AuthoringModule)
