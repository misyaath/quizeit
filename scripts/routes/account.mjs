import { Controller, Delete, Get, Inject, Module, Post, Put } from '@nestjs/common'
import { json, readBody } from '../http.mjs'
import { ACCOUNTS } from '../backend-services.module.mjs'
import { bindRoute } from './nest-http.mjs'

const googleCallback = '/auth/google/callback'

class AccountController {
  constructor(accounts) { this.accounts = accounts }

  status({ req }, res) {
    return json(res, { user: req.user ? this.accounts.publicUser(req.user) : null, googleEnabled: this.accounts.googleEnabled })
  }

  async signup({ req }, res) {
    return json(res, { user: await this.accounts.register(req, res, await readBody(req, 10_000)) }, 201)
  }

  async login({ req }, res) {
    return json(res, { user: await this.accounts.login(req, res, await readBody(req, 10_000)) })
  }

  async logout({ req }, res) {
    await this.accounts.logout(req, res)
    return json(res, {})
  }

  async listUsers({ req }, res) {
    return json(res, await this.accounts.listUsers(req.user))
  }

  async createUser({ req }, res) {
    return json(res, { user: await this.accounts.createUser(req.user, await readBody(req, 10_000)) }, 201)
  }

  async editUser({ req }, res) {
    const input = await readBody(req, 10_000)
    return json(res, await this.accounts.changeUser(req.user, req.params.id, {
      firstName: input.firstName, lastName: input.lastName, email: input.email, role: input.role, password: input.password,
    }))
  }

  async deactivateUser({ req }, res) {
    return json(res, await this.accounts.changeUser(req.user, req.params.id, { active: false }))
  }

  async restoreUser({ req }, res) {
    return json(res, await this.accounts.changeUser(req.user, req.params.id, { active: true }))
  }

  async google({ req, url }, res) {
    const destination = await this.accounts.beginGoogle(req, res, new URL(googleCallback, url).href, req.user)
    return json(res, { url: destination })
  }

  async callback({ req, url }, res) {
    const status = await this.accounts.finishGoogle(req, res, url, req.user)
    res.writeHead(303, { Location: (req.user ? '/settings' : '/login') + '?google=' + status, 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' })
    res.end()
  }
}

Controller()(AccountController)
Inject(ACCOUNTS)(AccountController, undefined, 0)
bindRoute(AccountController, 'status', Get('api/account'))
bindRoute(AccountController, 'signup', Post('api/account/signup'))
bindRoute(AccountController, 'login', Post('api/account/login'))
bindRoute(AccountController, 'logout', Delete('api/account'))
bindRoute(AccountController, 'listUsers', Get('api/users'))
bindRoute(AccountController, 'createUser', Post('api/users'))
bindRoute(AccountController, 'editUser', Put('api/users/:id'))
bindRoute(AccountController, 'deactivateUser', Delete('api/users/:id'))
bindRoute(AccountController, 'restoreUser', Post('api/users/:id/restore'))
bindRoute(AccountController, 'google', Post('api/account/google'))
bindRoute(AccountController, 'callback', Get(googleCallback))

export class AccountModule {}
Module({ controllers: [AccountController] })(AccountModule)
