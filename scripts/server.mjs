import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { parseEnv } from 'node:util'
import { emptyProgress } from '../src/attempts.js'
import { emptyExecutionSettings } from '../src/execution-settings.js'
import { readRoute } from '../src/routes.js'
import { jsonFile } from './local-store.mjs'
import { ApiError } from './openai.mjs'
import { json } from './http.mjs'
import { createChatGPTAuth } from './chatgpt-auth.mjs'
import { questionFolder, readCatalog } from './question-files.mjs'
import { createPlatformTools } from './platform-tools.mjs'
import { createJudge0 } from './judge0.mjs'
import { createEditorWorkspaces } from './editor-workspaces.mjs'
import { createAiService } from './ai-service.mjs'
import { createAttemptService } from './attempt-service.mjs'
import { createRouter } from './routes/router.mjs'
import { registerPracticeRoutes } from './routes/practice.mjs'
import { registerCodingRoutes } from './routes/coding.mjs'
import { registerGenerationRoutes } from './routes/generation.mjs'
import { registerOpenAiRoutes } from './routes/openai.mjs'

const assets = new Map([
  ['/', ['index.html', 'text/html; charset=utf-8']],
  ['/index.html', ['index.html', 'text/html; charset=utf-8']],
  ['/assets/main.js', ['assets/main.js', 'text/javascript; charset=utf-8']],
  ['/assets/main.css', ['assets/main.css', 'text/css; charset=utf-8']],
  ['/assets/main.js.map', ['assets/main.js.map', 'application/json']],
  ['/assets/main.css.map', ['assets/main.css.map', 'application/json']],
])
const bundleTypes = {
  js: 'text/javascript; charset=utf-8', css: 'text/css; charset=utf-8',
  map: 'application/json', ttf: 'font/ttf',
}
const bundlePath = /^\/assets\/[a-z0-9][.\w-]*\.(js|css|map|ttf)$/i

export async function startServer({
  port = 5173, dataDir = resolve('local-data'), fetchResponse = fetch, questionsDir = questionFolder,
  runCode, editor = createEditorWorkspaces(dataDir),
} = {}) {
  if (!runCode) {
    const localSettings = !process.env.JUDGE0_URL && await readFile(resolve(dataDir, 'judge0.env'), 'utf8').catch(error => {
      if (error.code !== 'ENOENT') throw error
      return ''
    })
    const token = process.env.JUDGE0_TOKEN || (localSettings ? parseEnv(localSettings).JUDGE0_TOKEN : undefined)
    runCode = createJudge0({ token })
  }
  const progress = jsonFile(resolve(dataDir, 'attempts.json'), emptyProgress)
  const executionSettings = jsonFile(resolve(dataDir, 'execution-settings.json'), emptyExecutionSettings)
  const bankExplanations = jsonFile(resolve(dataDir, 'bank-explanations.json'), () => ({}))
  const auth = createChatGPTAuth(dataDir, fetchResponse)
  const hosted = createPlatformTools(dataDir, fetchResponse)
  const getCatalog = async () => {
    try {
      return await readCatalog(questionsDir)
    } catch (error) {
      throw new ApiError(422, 'Question catalog: ' + error.message)
    }
  }
  const getSets = async () => (await getCatalog()).sets

  const attempts = createAttemptService({ progress, executionSettings, getSets, runCode, editor })
  const ai = createAiService({ auth, hosted, fetchResponse, progress, bankExplanations, getCatalog, getSets })
  const router = createRouter()
  registerPracticeRoutes(router, { getCatalog, getSets, progress, executionSettings, attempts })
  registerCodingRoutes(router, { runCode, editor, executionSettings, attempts })
  registerGenerationRoutes(router, { hosted, ai, getCatalog, questionsDir })
  registerOpenAiRoutes(router, { auth, hosted, ai })

  const server = createServer(async (req, res) => {
    try {
      const hosts = ['127.0.0.1:' + server.address().port, 'localhost:' + server.address().port]
      const host = req.headers.host
      if (!hosts.includes(host) || (req.headers.origin && req.headers.origin !== 'http://' + host)) {
        throw new ApiError(403, 'Open this app directly on localhost.')
      }
      const url = new URL(req.url, 'http://' + host)
      const path = url.pathname
      const handle = router.match(req.method, path)
      if (handle) return await handle({ req, res, url, host, hosts, port: server.address().port })
      const bundle = bundlePath.exec(path)
      const asset = req.method === 'GET' && (assets.get(path) || (bundle && [path.slice(1), bundleTypes[bundle[1]]])
        || (readRoute(url).screen !== 'not-found' && assets.get('/')))
      if (!asset) throw new ApiError(404, 'Page not found.')
      const [file, contentType] = asset
      const body = await readFile(resolve('dist', file))
      res.writeHead(200, { 'Content-Type': contentType, 'Cache-Control': 'no-cache', 'X-Content-Type-Options': 'nosniff' })
      res.end(body)
    } catch (error) {
      if (error instanceof ApiError) return json(res, { error: error.message, code: error.code }, error.status)
      if (error.code === 'ENOENT') return json(res, { error: 'Run npm run build before starting the server.' }, 404)
      console.error('Local server request failed:', error.code ?? error.name)
      return json(res, { error: 'The local server could not complete the request. Check the terminal and local-data folder.' }, 500)
    }
  })
  await new Promise((done, reject) => {
    server.once('error', reject)
    server.listen(port, '127.0.0.1', done)
  })
  console.log('quizeit is running at http://127.0.0.1:' + server.address().port + '/')
  return server
}
