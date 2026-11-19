import { randomUUID } from 'node:crypto'
import { Controller, Delete, Get, Inject, Post } from '@nestjs/common'
import { ApiError } from '../openai.mjs'
import { generateSet } from '../generate-set.mjs'
import { prepareGenerationAttachments } from '../generation-attachments.mjs'
import { maxAttachmentBytes } from '../../src/generation-attachments.js'
import { json, readBody, respondWithProgress } from '../http.mjs'
import { AI_INTEGRATIONS, APP_DATA, CATALOG } from '../backend-services.module.mjs'
import { currentUser } from '../request-user.mjs'
import { bindRoute } from './nest-http.mjs'
import { PLUGINS } from '../../apps/server/plugins/runtime.mjs'
import { selectedGenerator } from '../../apps/server/plugins/generation.mjs'

function cancelGeneration(job) {
  if (!job.cancellable || job.controller.signal.aborted) return
  job.message = 'Canceling generation…'
  job.controller.abort(new ApiError(409, 'Generation canceled. No set was saved.', 'generation_canceled'))
}

export class GenerationController {
  jobs = new Map()

  get generation() { return this.jobs.get(currentUser()._id) ?? null }

  constructor(integrations, { getCatalog }, { saveQuestionSet }, plugins) {
    this.integrations = integrations
    this.getCatalog = getCatalog
    this.saveQuestionSet = saveQuestionSet
    this.plugins = plugins
  }

  generationStatus() {
    const { generation } = this
    return generation && ({
      id: generation.id, startedAt: generation.startedAt, message: generation.message,
      cancellable: generation.cancellable && !generation.controller.signal.aborted,
    })
  }

  cancel({ req, host }, res) {
    const { id } = req.params
    if (!/^[a-f0-9-]{36}$/.test(id)) throw new ApiError(404, 'Page not found.')
    if (req.headers.origin !== 'http://' + host) throw new ApiError(403, 'Cancel generation from the local quiz.')
    const { generation } = this
    if (generation?.id !== id) return json(res, { generation: this.generationStatus() })
    if (!generation.cancellable) throw new ApiError(409, 'The set is already being saved.')
    cancelGeneration(generation)
    return json(res, { generation: this.generationStatus() })
  }

  status(_context, res) {
    return json(res, { generation: this.generationStatus() })
  }

  async generate({ req, host }, res) {
    if (req.headers.origin !== 'http://' + host) throw new ApiError(403, 'Generate questions from the local quiz.')
    const input = await readBody(req, Math.ceil(maxAttachmentBytes / 3) * 4 + 256_000)
    if (input.mode === 'exam' && currentUser().role !== 'admin') throw new ApiError(403, 'Only administrators can generate real exam questions.')
    const generator = selectedGenerator(this.plugins, input.modelId)
    if (generator === null) throw new ApiError(400, 'Choose an available question generator.')
    if (generator && (input.attachments?.length || !Array.isArray(input.types) || input.types.some(type => !generator.formats.includes(type)))) {
      throw new ApiError(400, 'Choose formats supported by this generator and remove any attachments.')
    }
    if (this.generation) throw new ApiError(409, 'A generation is already running. Check its activity or cancel it before starting another.', 'generation_active')
    const job = { id: randomUUID(), startedAt: Date.now(), message: 'Loading the question catalog…', controller: new AbortController(), cancellable: true }
    const userId = currentUser()._id
    this.jobs.set(userId, job)
    const cancelOnDisconnect = () => { if (!res.writableFinished) cancelGeneration(job) }
    res.once('close', cancelOnDisconnect)
    if (res.destroyed) cancelOnDisconnect()
    try {
      return await respondWithProgress(req, res, 201, async onProgress => {
        const report = message => {
          if (job.controller.signal.aborted) return
          job.message = message
          onProgress?.(message)
        }
        const signal = job.controller.signal
        const integrations = generator ? null : this.integrations()
        const platform = await integrations?.hosted.connection()
        if (input.attachments?.length) report('Preparing attached files…')
        const attachments = await prepareGenerationAttachments(input.attachments, { platform: Boolean(platform), signal })
        return generateSet(input, {
          catalog: await this.getCatalog(), saveQuestionSet: this.saveQuestionSet,
          ask: generator ? request => generator.generate({
            batch: request.batch, prompt: request.prompt, instructions: request.instructions,
            signal, onProgress: report,
          }) : request => integrations.ai.ask(request, platform), signal, attachments,
          beforeSave: () => { job.cancellable = false },
          onProgress: report,
        })
      })
    } finally {
      res.off('close', cancelOnDisconnect)
      if (this.jobs.get(userId) === job) this.jobs.delete(userId)
    }
  }
}

Controller('api/questions/generate')(GenerationController)
Inject(AI_INTEGRATIONS)(GenerationController, undefined, 0)
Inject(CATALOG)(GenerationController, undefined, 1)
Inject(APP_DATA)(GenerationController, undefined, 2)
Inject(PLUGINS)(GenerationController, undefined, 3)
bindRoute(GenerationController, 'cancel', Delete(':id'))
bindRoute(GenerationController, 'status', Get('status'))
bindRoute(GenerationController, 'generate', Post())
