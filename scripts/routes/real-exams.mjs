import { Controller, Get, Inject, Module, Post } from '@nestjs/common'
import { APP_DATA, REAL_EXAMS } from '../backend-services.module.mjs'
import { groupExamSources, requireExamAdmin } from '../real-exams.mjs'
import { json, readBody } from '../http.mjs'
import { bindRoute } from './nest-http.mjs'

class RealExamsController {
  constructor(exams, data) {
    this.exams = exams
    this.data = data
  }

  async list(_context, res) {
    requireExamAdmin()
    const [list, sources] = await Promise.all([this.exams.list(), this.data.examSources()])
    return json(res, { ...list, sources: groupExamSources(sources).map(({ id, title, questions }) => ({
      id, title, difficulty: questions.map(item => item.difficulty),
    })) })
  }

  async create({ req }, res) {
    requireExamAdmin()
    return json(res, await this.exams.create(await readBody(req), groupExamSources(await this.data.examSources())), 201)
  }

  async invite({ req }, res) {
    requireExamAdmin()
    return json(res, await this.exams.invite(req.params.id, await readBody(req), req.quizOrigin), 201)
  }

  async invitations({ req }, res) {
    requireExamAdmin()
    const list = await this.exams.listInvitations(req.params.id)
    return json(res, await Promise.all(list.map(async ({ _id, ...entry }) => {
      const { history } = entry.startedAt ? await this.data.reviewProgress({ _id, role: 'candidate' }) : { history: [] }
      return { ...entry, id: _id, resultId: history[0]?.id }
    })))
  }

  async inspect({ req }, res) {
    return json(res, await this.exams.inspect(req.params.token))
  }

  async claim({ req }, res) {
    return json(res, await this.exams.claim(req.params.token, await readBody(req, 10_000), req, res), 201)
  }
}

Controller('api')(RealExamsController)
Inject(REAL_EXAMS)(RealExamsController, undefined, 0)
Inject(APP_DATA)(RealExamsController, undefined, 1)
bindRoute(RealExamsController, 'list', Get('real-exams'))
bindRoute(RealExamsController, 'create', Post('real-exams'))
bindRoute(RealExamsController, 'invite', Post('real-exams/:id/invitations'))
bindRoute(RealExamsController, 'invitations', Get('real-exams/:id/invitations'))
bindRoute(RealExamsController, 'inspect', Get('exam-invites/:token'))
bindRoute(RealExamsController, 'claim', Post('exam-invites/:token'))

export class RealExamsModule {}
Module({ controllers: [RealExamsController] })(RealExamsModule)
