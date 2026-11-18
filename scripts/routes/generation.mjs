import { randomUUID } from 'node:crypto'
import { ApiError } from '../openai.mjs'
import { generateSet } from '../generate-set.mjs'
import { prepareGenerationAttachments } from '../generation-attachments.mjs'
import { maxAttachmentBytes } from '../../src/generation-attachments.js'
import { json, readBody, respondWithProgress } from '../http.mjs'

export function registerGenerationRoutes(router, { hosted, ai, getCatalog, questionsDir }) {
  let generation = null
  const generationStatus = () => generation && ({
    id: generation.id, startedAt: generation.startedAt, message: generation.message,
    cancellable: generation.cancellable && !generation.controller.signal.aborted,
  })

  function cancelGeneration(job) {
    if (!job.cancellable || job.controller.signal.aborted) return
    job.message = 'Canceling generation…'
    job.controller.abort(new ApiError(409, 'Generation canceled. No set was saved.', 'generation_canceled'))
  }

  router.addPattern('DELETE', /^\/api\/questions\/generate\/([a-f0-9-]{36})$/, async ({ req, res, host }, match) => {
    if (req.headers.origin !== 'http://' + host) throw new ApiError(403, 'Cancel generation from the local quiz.')
    if (generation?.id !== match[1]) return json(res, { generation: generationStatus() })
    if (!generation.cancellable) throw new ApiError(409, 'The set is already being saved.')
    cancelGeneration(generation)
    return json(res, { generation: generationStatus() })
  })

  router.add('GET', '/api/questions/generate/status', async ({ res }) => {
    return json(res, { generation: generationStatus() })
  })
  router.add('POST', '/api/questions/generate', async ({ req, res, host }) => {
    if (req.headers.origin !== 'http://' + host) throw new ApiError(403, 'Generate questions from the local quiz.')
    const input = await readBody(req, Math.ceil(maxAttachmentBytes / 3) * 4 + 256_000)
    if (generation) throw new ApiError(409, 'A generation is already running. Check its activity or cancel it before starting another.', 'generation_active')
    const job = { id: randomUUID(), startedAt: Date.now(), message: 'Loading the question catalog…', controller: new AbortController(), cancellable: true }
    generation = job
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
        const platform = await hosted.connection()
        if (input.attachments?.length) report('Preparing attached files…')
        const attachments = await prepareGenerationAttachments(input.attachments, { platform: Boolean(platform), signal })
        return generateSet(input, {
          catalog: await getCatalog(), folder: questionsDir, ask: request => ai.ask(request, platform), signal, attachments,
          beforeSave: () => { job.cancellable = false },
          onProgress: report,
        })
      })
    } finally {
      res.off('close', cancelOnDisconnect)
      if (generation === job) generation = null
    }
  })
}
