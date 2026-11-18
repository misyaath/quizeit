import { ApiError, listModels } from '../openai.mjs'
import { maxFileSize, platformModel } from '../platform-tools.mjs'
import { json, readBody, respondWithProgress } from '../http.mjs'

export function registerOpenAiRoutes(router, { auth, hosted, ai }) {
  router.add('GET', auth.callbackPath, async ({ req, res, url, host, hosts }) => {
    if (host !== hosts[0]) throw new ApiError(400, 'Use the 127.0.0.1 callback.')
    const result = await auth.callback(url.searchParams, req.headers.cookie)
    res.writeHead(303, {
      Location: '/settings?chatgpt=' + result, 'Referrer-Policy': 'no-referrer',
      'Cache-Control': 'no-store', 'Set-Cookie': auth.clearCookie,
    })
    return res.end()
  })
  router.add('GET', '/api/openai/models', async ({ res }) => {
    const platform = await hosted.connection()
    return json(res, { models: platform ? [platformModel] : await ai.withPlan(listModels), platformAttachments: Boolean(platform) })
  })
  router.add('GET', '/api/openai/settings', async ({ res }) => json(res, await auth.status()))
  router.add('POST', '/api/openai/authorize', async ({ req, res, host, hosts, port }) => {
    if (host !== hosts[0] || req.headers.origin !== 'http://' + host) throw new ApiError(403, 'Start sign-in from Settings on 127.0.0.1.')
    const { different } = await readBody(req)
    const authorization = await auth.begin(port, different === true)
    res.setHeader('Set-Cookie', authorization.cookie)
    return json(res, { url: authorization.url })
  })
  router.add('DELETE', '/api/openai/settings', async ({ req, res, host }) => {
    if (req.headers.origin !== 'http://' + host) throw new ApiError(403, 'Disconnect from the Settings page.')
    return json(res, await auth.disconnect())
  })
  router.add('POST', '/api/openai/explain', async ({ req, res }) => {
    const input = await readBody(req)
    return await respondWithProgress(req, res, 200, onProgress => ai.explain(input, onProgress))
  })
  router.addFallback(path => path === '/api/openai/hosted' || path.startsWith('/api/openai/hosted/files'),
    async ({ req, res, host, url }) => {
      const path = url.pathname
      if (req.method === 'GET' && path === '/api/openai/hosted') return json(res, await hosted.status())
      if (req.headers.origin !== 'http://' + host) throw new ApiError(403, 'Manage hosted tools from the local quiz.')
      if (req.method === 'DELETE' && path === '/api/openai/hosted') return json(res, await hosted.disconnect())
      if (req.method === 'POST' && path === '/api/openai/hosted') return json(res, await hosted.configure(await readBody(req)))
      if (req.method === 'POST' && path === '/api/openai/hosted/files') {
        const encoded = req.headers['x-filename']
        if (typeof encoded !== 'string' || req.headers['content-type'] !== 'application/octet-stream') {
          throw new ApiError(400, 'Select a study file to upload.')
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
        return json(res, await hosted.upload(name, Buffer.concat(chunks)), 201)
      }
      const match = /^\/api\/openai\/hosted\/files\/(file-[\w-]+)$/.exec(path)
      if (req.method === 'DELETE' && match) return json(res, await hosted.remove(match[1]))
      throw new ApiError(404, 'Page not found.')
    })
}
