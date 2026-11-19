import { Bind, Catch, HttpException, Inject, Res, createParamDecorator } from '@nestjs/common'
import { ApiError } from '../openai.mjs'
import { json } from '../http.mjs'
import { ACCOUNTS, REAL_EXAMS } from '../backend-services.module.mjs'
import { requestUser } from '../request-user.mjs'

const publicPaths = new Set(['/api/account', '/api/account/signup', '/api/account/login', '/api/account/google', '/auth/google/callback'])
const inviteApi = /^\/api\/exam-invites\/[A-Za-z0-9_-]{43}$/
const publicPage = /^(?:\/exam-invite\/[A-Za-z0-9_-]{43}|\/candidate\/exam-[a-f0-9-]{36}|\/assets\/main\.(?:js|css))\/?$/
const candidatePaths = {
  GET: /^\/api\/(?:catalog|progress|code\/languages|attempt-media\/files\/[a-f0-9-]{36})$/,
  POST: /^\/api\/(?:progress(?:\/time)?|code\/run|attempt-media\/(?:video|screenshot|webcam|stop)\/[a-z0-9/-]+)$/,
  DELETE: /^\/api\/attempt-media\/video\/[a-z0-9/-]+$/,
}

function localHosts(port) {
  return ['127.0.0.1:' + port, 'localhost:' + port]
}

const RequestContext = createParamDecorator((_, context) => {
  const req = context.switchToHttp().getRequest()
  const port = req.socket.localPort
  const host = req.headers.host
  return { req, host, port, hosts: localHosts(port), url: new URL(req.originalUrl, req.quizOrigin) }
})

// Apply Nest's decorators in JavaScript so both Node entry points can load controllers directly.
export function bindRoute(controller, method, decorator) {
  const { prototype } = controller
  const descriptor = Object.getOwnPropertyDescriptor(prototype, method)
  const handler = descriptor.value
  descriptor.value = function (context, response) {
    return requestUser.run(context.req.user, () => handler.call(this, context, response))
  }
  Object.defineProperty(prototype, method, descriptor)
  decorator(prototype, method, descriptor)
  Bind(RequestContext(), Res())(prototype, method, descriptor)
}

export class LocalRequestGuard {
  constructor(accounts, realExams) {
    this.accounts = accounts
    this.realExams = realExams
  }

  async canActivate(context) {
    const req = context.switchToHttp().getRequest()
    const { host, origin } = req.headers
    const local = localHosts(req.socket.localPort).includes(host) && !req.secure
    const publicOrigin = this.realExams.publicOrigin
    if (!local && (!publicOrigin || host !== publicOrigin.host)) throw new ApiError(403, 'Open Quizeit on its configured address.')
    req.quizOrigin = local ? 'http://' + host : publicOrigin.origin
    if (origin && origin !== req.quizOrigin) throw new ApiError(403, 'Send this request from Quizeit.')
    // Express also uses GET handlers for HEAD. Keep the API read methods explicit.
    if (req.method === 'HEAD') throw new ApiError(404, 'Page not found.')
    const path = req.path
    if (req.candidateSetId) {
      if (!candidatePaths[req.method]?.test(path)) throw new ApiError(404, 'Page not found.')
      if (req.method !== 'GET' && origin !== req.quizOrigin) throw new ApiError(403, 'Send this request from Quizeit.')
      req.user = await this.realExams.getCandidate(req, req.candidateSetId)
      if (!req.user) throw new ApiError(401, 'This exam session is unavailable. Ask the administrator for a new invitation.')
      return true
    }
    if (inviteApi.test(path) && ['GET', 'POST'].includes(req.method)) {
      if (req.method === 'POST' && origin !== req.quizOrigin) throw new ApiError(403, 'Open your invitation in Quizeit.')
      return true
    }
    if (!local) {
      if (req.method === 'GET' && publicPage.test(path)) return true
      throw new ApiError(404, 'Page not found.')
    }
    if (path.startsWith('/api/') || path.startsWith('/auth/')) {
      if (req.method !== 'GET' && origin !== req.quizOrigin) throw new ApiError(403, 'Send this request from the quiz.')
      req.user = await this.accounts.getUser(req)
      if (!req.user && !publicPaths.has(path)) throw new ApiError(401, 'Sign in to continue.')
    }
    return true
  }
}

Inject(ACCOUNTS)(LocalRequestGuard, undefined, 0)
Inject(REAL_EXAMS)(LocalRequestGuard, undefined, 1)

export class ApiExceptionFilter {
  catch(error, context) {
    const res = context.switchToHttp().getResponse()
    if (res.headersSent || res.destroyed) {
      if (!res.writableEnded && !res.destroyed) res.end()
      return
    }
    if (error instanceof ApiError) return json(res, { error: error.message, code: error.code }, error.status)
    if (error instanceof HttpException) return json(res, { error: error.message }, error.getStatus())
    console.error('Local server request failed:', error.code ?? error.name)
    return json(res, { error: 'The local server could not complete the request. Check the terminal for details.' }, 500)
  }
}

Catch()(ApiExceptionFilter)
