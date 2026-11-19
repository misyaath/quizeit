import { Bind, Catch, HttpException, Inject, Res, createParamDecorator } from '@nestjs/common'
import { ApiError } from '../openai.mjs'
import { json } from '../http.mjs'
import { ACCOUNTS } from '../backend-services.module.mjs'
import { requestUser } from '../request-user.mjs'

const publicPaths = new Set(['/api/account', '/api/account/signup', '/api/account/login', '/api/account/google', '/auth/google/callback'])

function localHosts(port) {
  return ['127.0.0.1:' + port, 'localhost:' + port]
}

const RequestContext = createParamDecorator((_, context) => {
  const req = context.switchToHttp().getRequest()
  const port = req.socket.localPort
  const host = req.headers.host
  return { req, host, port, hosts: localHosts(port), url: new URL(req.originalUrl, 'http://' + host) }
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
  constructor(accounts) { this.accounts = accounts }

  async canActivate(context) {
    const req = context.switchToHttp().getRequest()
    const { host, origin } = req.headers
    if (!localHosts(req.socket.localPort).includes(host) || (origin && origin !== 'http://' + host)) {
      throw new ApiError(403, 'Open this app directly on localhost.')
    }
    // Express also uses GET handlers for HEAD. Keep the API read methods explicit.
    if (req.method === 'HEAD') throw new ApiError(404, 'Page not found.')
    const path = req.path
    if (path.startsWith('/api/') || path.startsWith('/auth/')) {
      if (req.method !== 'GET' && origin !== 'http://' + host) throw new ApiError(403, 'Send this request from the quiz.')
      req.user = await this.accounts.getUser(req)
      if (!req.user && !publicPaths.has(path)) throw new ApiError(401, 'Sign in to continue.')
    }
    return true
  }
}

Inject(ACCOUNTS)(LocalRequestGuard, undefined, 0)

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
