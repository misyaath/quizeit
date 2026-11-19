import { Module } from '@nestjs/common'
import { APP_FILTER, APP_GUARD } from '@nestjs/core'
import { BackendServicesModule } from '../../scripts/backend-services.module.mjs'
import { AccountModule } from '../../scripts/routes/account.mjs'
import { AttemptMediaModule } from '../../scripts/routes/attempt-media.mjs'
import { AuthoringModule } from '../../scripts/routes/authoring.mjs'
import { CodingModule } from '../../scripts/routes/coding.mjs'
import { FrontendModule } from '../../scripts/routes/frontend.mjs'
import { ApiExceptionFilter, LocalRequestGuard } from '../../scripts/routes/nest-http.mjs'
import { AiModule } from '../../scripts/routes/openai.mjs'
import { PracticeModule } from '../../scripts/routes/practice.mjs'
import { RealExamsModule } from '../../scripts/routes/real-exams.mjs'
import { PluginsModule } from './plugins/controller.mjs'

export class AppModule {
  static register(services) {
    return {
      module: AppModule,
      // The frontend fallback follows all API modules.
      imports: [BackendServicesModule.register(services), AccountModule, PracticeModule, AttemptMediaModule,
        AuthoringModule, RealExamsModule, CodingModule, AiModule, PluginsModule, FrontendModule],
      providers: [
        { provide: APP_GUARD, useClass: LocalRequestGuard },
        { provide: APP_FILTER, useClass: ApiExceptionFilter },
      ],
    }
  }
}

Module({})(AppModule)
