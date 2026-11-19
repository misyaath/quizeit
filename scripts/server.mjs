import 'reflect-metadata'
import { resolve } from 'node:path'
import { NestFactory } from '@nestjs/core'
import { ExpressAdapter } from '@nestjs/platform-express'
import express from 'express'
import { connectMongo } from './mongo-store.mjs'
import { initializeAppData } from './app-data.mjs'
import { questionFolder } from './question-files.mjs'
import { createJudge0 } from './judge0.mjs'
import { createEditorWorkspaces } from './editor-workspaces.mjs'
import { createAccounts } from './accounts.mjs'
import { createRealExams } from './real-exams.mjs'
import { readEnvFile } from './env-file.mjs'
import { AppModule } from '../apps/server/app-module.mjs'
import { loadPlugins } from '../apps/server/plugins/runtime.mjs'

export async function startServer({
  port = Number(process.env.QUIZEIT_PORT || 5173), dataDir = resolve('local-data'), fetchResponse = fetch, questionsDir = questionFolder,
  runCode, editor = createEditorWorkspaces(dataDir), mongoUri, mongoDatabase, accountOptions, examOptions, pluginOptions,
} = {}) {
  if (!runCode) {
    const token = process.env.JUDGE0_TOKEN || (!process.env.JUDGE0_URL
      ? (await readEnvFile(resolve(dataDir, 'judge0.env'))).JUDGE0_TOKEN : undefined)
    runCode = createJudge0({ token })
  }

  const mongo = await connectMongo({ dataDir, mongoUri, mongoDatabase })
  let app
  try {
    const realExams = await createRealExams(mongo.db, { dataDir, ...examOptions })
    const data = await initializeAppData(mongo.db, dataDir, questionsDir, realExams)
    const plugins = await loadPlugins(mongo.db, pluginOptions)
    const accounts = await createAccounts(mongo.db, { ...accountOptions, roles: plugins.roles() })
    const httpApp = express()
    httpApp.disable('x-powered-by')
    httpApp.enable('case sensitive routing')
    httpApp.enable('strict routing')
    if (process.env.QUIZEIT_TRUST_PROXY === '1') httpApp.set('trust proxy', 'loopback')
    httpApp.use((req, _res, next) => {
      const candidate = /^\/api\/candidate\/(exam-[a-f0-9-]{36})(\/[^?]+)(\?.*)?$/.exec(req.url)
      if (candidate) {
        req.candidateSetId = candidate[1]
        req.url = '/api' + candidate[2] + (candidate[3] ?? '')
      }
      next()
    })
    app = await NestFactory.create(AppModule.register({ data, accounts, realExams, runCode, editor, fetchResponse, plugins }), new ExpressAdapter(httpApp), {
      abortOnError: false,
      // The controllers enforce different JSON limits and accept raw file uploads.
      bodyParser: false,
      logger: ['error', 'warn'],
    })
    const server = await app.listen(port, '127.0.0.1')
    server.once('close', () => { void mongo.close().catch(() => {}) })
    console.log('quizeit is running at http://127.0.0.1:' + server.address().port + '/')
    return server
  } catch (error) {
    await app?.close().catch(() => {})
    await mongo.close()
    throw error
  }
}
