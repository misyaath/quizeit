import { Controller, Get, Inject, Module, Post, Put } from '@nestjs/common'
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

  async details({ req }, res) {
    requireExamAdmin()
    return json(res, await this.exams.details(req.params.id))
  }

  async grading({ req }, res) {
    requireExamAdmin()
    return json(res, await this.exams.updateGrading(req.params.id, await readBody(req)))
  }

  async invite({ req }, res) {
    requireExamAdmin()
    return json(res, await this.exams.invite(req.params.id, await readBody(req), req.quizOrigin), 201)
  }

  async sendInvitations(examId, res) {
    requireExamAdmin()
    const { entries, ...catalog } = await this.exams.listInvitations(examId)
    const list = await Promise.all(entries.map(async ({ _id, ...entry }) => {
      const { history } = entry.startedAt ? await this.data.reviewProgress({ _id, role: 'candidate' }) : { history: [] }
      return { ...entry, id: _id, resultId: history[0]?.id }
    }))
    return json(res, examId ? list : { ...catalog, entries: list })
  }

  invitations(_context, res) { return this.sendInvitations(undefined, res) }
  examInvitations({ req }, res) { return this.sendInvitations(req.params.id, res) }

  async copyLink({ req }, res) {
    requireExamAdmin()
    return json(res, await this.exams.invitationLink(req.params.id, req.quizOrigin))
  }

  async replaceLink({ req }, res) {
    requireExamAdmin()
    return json(res, await this.exams.invitationLink(req.params.id, req.quizOrigin, true))
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
bindRoute(RealExamsController, 'details', Get('real-exams/:id'))
bindRoute(RealExamsController, 'grading', Put('real-exams/:id/grading'))
bindRoute(RealExamsController, 'invite', Post('real-exams/:id/invitations'))
bindRoute(RealExamsController, 'examInvitations', Get('real-exams/:id/invitations'))
bindRoute(RealExamsController, 'invitations', Get('exam-invitations'))
bindRoute(RealExamsController, 'copyLink', Get('exam-invitations/:id/link'))
bindRoute(RealExamsController, 'replaceLink', Post('exam-invitations/:id/link'))
bindRoute(RealExamsController, 'inspect', Get('exam-invites/:token'))
bindRoute(RealExamsController, 'claim', Post('exam-invites/:token'))

export class RealExamsModule {}
Module({ controllers: [RealExamsController] })(RealExamsModule)
