import 'reflect-metadata'
import { resolve } from 'node:path'
import { Module } from '@nestjs/common'
import { APP_FILTER, APP_GUARD, NestFactory } from '@nestjs/core'
import { ExpressAdapter } from '@nestjs/platform-express'
import express from 'express'
import { connectMongo } from './mongo-store.mjs'
import { initializeAppData } from './app-data.mjs'
import { questionFolder } from './question-files.mjs'
import { createJudge0 } from './judge0.mjs'
import { createEditorWorkspaces } from './editor-workspaces.mjs'
import { BackendServicesModule } from './backend-services.module.mjs'
import { createAccounts } from './accounts.mjs'
import { AccountModule } from './routes/account.mjs'
import { AuthoringModule } from './routes/authoring.mjs'
import { RealExamsModule } from './routes/real-exams.mjs'
import { createRealExams } from './real-exams.mjs'
import { AttemptMediaModule } from './routes/attempt-media.mjs'
import { PracticeModule } from './routes/practice.mjs'
import { CodingModule } from './routes/coding.mjs'
import { AiModule } from './routes/openai.mjs'
import { FrontendModule } from './routes/frontend.mjs'
import { ApiExceptionFilter, LocalRequestGuard } from './routes/nest-http.mjs'
import { readEnvFile } from './env-file.mjs'

class AppModule {
  static register(services) {
    return {
      module: AppModule,
      // Mount the frontend fallback after the API controllers.
      imports: [BackendServicesModule.register(services), AccountModule, PracticeModule, AttemptMediaModule, AuthoringModule, RealExamsModule, CodingModule, AiModule, FrontendModule],
      providers: [
        { provide: APP_GUARD, useClass: LocalRequestGuard },
        { provide: APP_FILTER, useClass: ApiExceptionFilter },
      ],
    }
  }
}

Module({})(AppModule)

export async function startServer({
  port = Number(process.env.QUIZEIT_PORT || 5173), dataDir = resolve('local-data'), fetchResponse = fetch, questionsDir = questionFolder,
  runCode, editor = createEditorWorkspaces(dataDir), mongoUri, mongoDatabase, accountOptions, examOptions,
} = {}) {
  if (!runCode) {
    const token = process.env.JUDGE0_TOKEN || (!process.env.JUDGE0_URL
      ? (await readEnvFile(resolve(dataDir, 'judge0.env'))).JUDGE0_TOKEN : undefined)
    runCode = createJudge0({ token })
  }

  const mongo = await connectMongo({ dataDir, mongoUri, mongoDatabase })
  let app
  try {
    const realExams = await createRealExams(mongo.db, examOptions)
    const data = await initializeAppData(mongo.db, dataDir, questionsDir, realExams)
    const accounts = await createAccounts(mongo.db, accountOptions)
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
    app = await NestFactory.create(AppModule.register({ data, accounts, realExams, runCode, editor, fetchResponse }), new ExpressAdapter(httpApp), {
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
