import { Global, Module } from '@nestjs/common'
import { createAiService } from './ai-service.mjs'
import { createAttemptService } from './attempt-service.mjs'
import { createChatGPTAuth } from './chatgpt-auth.mjs'
import { ApiError } from './openai.mjs'
import { currentUser } from './request-user.mjs'
import { createPlatformTools } from './platform-tools.mjs'
import { PLUGINS } from '../apps/server/plugins/runtime.mjs'

export const ACCOUNTS = Symbol('ACCOUNTS')
export const APP_DATA = Symbol('APP_DATA')
export const CATALOG = Symbol('CATALOG')
export const CODING = Symbol('CODING')
export const ATTEMPTS = Symbol('ATTEMPTS')
export const AI_INTEGRATIONS = Symbol('AI_INTEGRATIONS')
export const REAL_EXAMS = Symbol('REAL_EXAMS')

function createCatalog(data, realExams) {
  async function getCatalog() {
    const user = currentUser()
    if (user?.role === 'candidate') return { categories: [], sets: [await realExams.assignedSet(user)] }
    try {
      return await data.readCatalog()
    } catch (error) {
      console.error('Could not read the MongoDB question catalog:', error.code ?? error.name)
      throw new ApiError(503, 'Could not load the question catalog. Check the MongoDB connection.')
    }
  }
  return { getCatalog, getSets: async () => (await getCatalog()).sets }
}

export class BackendServicesModule {
  static register({ data, accounts, realExams, runCode, editor, fetchResponse, plugins }) {
    return {
      module: BackendServicesModule,
      providers: [
        { provide: APP_DATA, useValue: data },
        { provide: ACCOUNTS, useValue: accounts },
        { provide: CODING, useValue: { runCode, editor } },
        { provide: REAL_EXAMS, useValue: realExams },
        { provide: PLUGINS, useValue: plugins },
        { provide: CATALOG, useFactory: createCatalog, inject: [APP_DATA, REAL_EXAMS] },
        {
          provide: ATTEMPTS,
          inject: [APP_DATA, CATALOG, CODING, PLUGINS],
          useFactory: ({ progress, executionSettings }, { getSets }, coding, extensions) =>
            createAttemptService({ progress, executionSettings, getSets, ...coding, publish: extensions.emit }),
        },
        {
          provide: AI_INTEGRATIONS,
          inject: [APP_DATA, CATALOG],
          useFactory: ({ chatgptAuth, platformTools, progress, bankExplanations }, catalog) => {
            const accounts = new Map()
            return () => {
              const id = currentUser()._id
              if (!accounts.has(id)) {
                const auth = createChatGPTAuth(chatgptAuth, fetchResponse)
                const hosted = createPlatformTools(platformTools, fetchResponse)
                const ai = createAiService({ auth, hosted, fetchResponse, progress, bankExplanations, ...catalog })
                accounts.set(id, { auth, hosted, ai })
              }
              return accounts.get(id)
            }
          },
        },
      ],
      exports: [ACCOUNTS, APP_DATA, CATALOG, CODING, ATTEMPTS, AI_INTEGRATIONS, REAL_EXAMS, PLUGINS],
    }
  }
}

Module({})(BackendServicesModule)
Global()(BackendServicesModule)
