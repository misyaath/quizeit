import { Controller, Delete, Get, Inject, Module, Post } from '@nestjs/common'
import { callbackPath } from '../chatgpt-auth.mjs'
import { ApiError, listModels } from '../openai.mjs'
import { maxFileSize, platformModel } from '../platform-tools.mjs'
import { json, readBody, respondWithProgress } from '../http.mjs'
import { AI_INTEGRATIONS } from '../backend-services.module.mjs'
import { GenerationController } from './generation.mjs'
import { bindRoute } from './nest-http.mjs'

function requireHostedOrigin(req, host) {
  if (req.headers.origin !== 'http://' + host) throw new ApiError(403, 'Manage hosted tools from the local quiz.')
}

class OpenAiController {
  constructor(integrations) { this.integrations = integrations }

  get auth() { return this.integrations().auth }
  get hosted() { return this.integrations().hosted }
  get ai() { return this.integrations().ai }

  async callback({ req, url, host, hosts }, res) {
    if (host !== hosts[0]) throw new ApiError(400, 'Use the 127.0.0.1 callback.')
    const result = await this.auth.callback(url.searchParams, req.headers.cookie)
    res.writeHead(303, {
      Location: '/settings?chatgpt=' + result, 'Referrer-Policy': 'no-referrer',
      'Cache-Control': 'no-store', 'Set-Cookie': this.auth.clearCookie,
    })
    return res.end()
  }

  async models(_context, res) {
    const platform = await this.hosted.connection()
    return json(res, { models: platform ? [platformModel] : await this.ai.withPlan(listModels), platformAttachments: Boolean(platform) })
  }

  async settings(_context, res) {
    return json(res, await this.auth.status())
  }

  async authorize({ req, host, hosts, port }, res) {
    if (host !== hosts[0] || req.headers.origin !== 'http://' + host) throw new ApiError(403, 'Start sign-in from Settings on 127.0.0.1.')
    const { different } = await readBody(req)
    const authorization = await this.auth.begin(port, different === true)
    res.setHeader('Set-Cookie', authorization.cookie)
    return json(res, { url: authorization.url })
  }

  async disconnect({ req, host }, res) {
    if (req.headers.origin !== 'http://' + host) throw new ApiError(403, 'Disconnect from the Settings page.')
    return json(res, await this.auth.disconnect())
  }

  async explain({ req }, res) {
    const input = await readBody(req)
    return respondWithProgress(req, res, 200, onProgress => this.ai.explain(input, onProgress))
  }

  async hostedStatus(_context, res) {
    return json(res, await this.hosted.status())
  }

  async configureHosted({ req, host }, res) {
    requireHostedOrigin(req, host)
    return json(res, await this.hosted.configure(await readBody(req)))
  }

  async disconnectHosted({ req, host }, res) {
    requireHostedOrigin(req, host)
    return json(res, await this.hosted.disconnect())
  }

  async uploadHostedFile({ req, host }, res) {
    requireHostedOrigin(req, host)
    const encoded = req.headers['x-filename']
    if (typeof encoded !== 'string' || req.headers['content-type'] !== 'application/octet-stream') {
      throw new ApiError(400, 'Select a supported study file to upload.')
    }
    let name
    try { name = decodeURIComponent(encoded) } catch { throw new ApiError(400, 'Invalid study filename.') }
    const chunks = []
    let size = 0
    for await (const chunk of req) {
      size += chunk.length
      if (size <= maxFileSize) chunks.push(chunk)
    }
    if (size > maxFileSize) throw new ApiError(413, 'Choose a study file up to 15 MB.')
    return json(res, await this.hosted.upload(name, Buffer.concat(chunks)), 201)
  }

  async removeHostedFile({ req, host }, res) {
    requireHostedOrigin(req, host)
    const { id } = req.params
    if (!/^file-[\w-]+$/.test(id)) throw new ApiError(404, 'Page not found.')
    return json(res, await this.hosted.remove(id))
  }
}

Controller()(OpenAiController)
Inject(AI_INTEGRATIONS)(OpenAiController, undefined, 0)
bindRoute(OpenAiController, 'callback', Get(callbackPath))
bindRoute(OpenAiController, 'models', Get('api/openai/models'))
bindRoute(OpenAiController, 'settings', Get('api/openai/settings'))
bindRoute(OpenAiController, 'authorize', Post('api/openai/authorize'))
bindRoute(OpenAiController, 'disconnect', Delete('api/openai/settings'))
bindRoute(OpenAiController, 'explain', Post('api/openai/explain'))
bindRoute(OpenAiController, 'hostedStatus', Get('api/openai/hosted'))
bindRoute(OpenAiController, 'configureHosted', Post('api/openai/hosted'))
bindRoute(OpenAiController, 'disconnectHosted', Delete('api/openai/hosted'))
bindRoute(OpenAiController, 'uploadHostedFile', Post('api/openai/hosted/files'))
bindRoute(OpenAiController, 'removeHostedFile', Delete('api/openai/hosted/files/:id'))

export class AiModule {}
Module({ controllers: [OpenAiController, GenerationController] })(AiModule)
