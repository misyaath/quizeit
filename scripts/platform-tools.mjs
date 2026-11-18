import { extname, resolve } from 'node:path'
import { ApiError } from './openai.mjs'
import { jsonFile } from './local-store.mjs'
import { quizTools } from './quiz-tools.mjs'

export const platformModel = { id: 'gpt-6.2-astra', name: 'GPT-6.2 Astra · Hosted tools', efforts: ['low', 'medium', 'high', 'xhigh', 'max'] }
export const allowedFiles = ['.pdf', '.txt', '.md', '.docx', '.pptx', '.json', '.py']
export const maxFileSize = 15 * 1024 * 1024

export function platformTools(storeId) {
  const [web, bank] = quizTools
  return [
    web,
    { ...bank, tools: bank.tools.map(tool => ({ ...tool, defer_loading: true })) },
    { type: 'tool_search' },
    { type: 'code_interpreter', container: { type: 'auto' } },
    ...(storeId ? [{ type: 'file_search', vector_store_ids: [storeId], max_num_results: 6 }] : []),
  ]
}

export function createPlatformTools(dataDir, fetchResponse) {
  const file = jsonFile(resolve(dataDir, 'openai-platform.json'), () => ({ apiKey: '', enabled: false, storeId: null, files: [] }))

  async function call(key, path, { method = 'GET', data, form, notFoundOk, signal } = {}) {
    let response
    try {
      response = await fetchResponse('https://api.openai.com/v1/' + path, {
        method,
        headers: { Authorization: 'Bearer ' + key, ...(data && { 'Content-Type': 'application/json' }) },
        body: form ?? (data && JSON.stringify(data)),
        signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(60_000)]) : AbortSignal.timeout(60_000),
      })
    } catch {
      signal?.throwIfAborted()
      throw new ApiError(502, 'Could not reach OpenAI Platform. Try again.')
    }
    const result = await response.json().catch(() => ({}))
    if (response.ok || (notFoundOk && response.status === 404)) return result
    if ([401, 403].includes(response.status)) throw new ApiError(400, 'OpenAI rejected this API key or its project permissions.')
    if (response.status === 429) throw new ApiError(429, 'OpenAI Platform rate limit or quota reached. Check API billing.')
    if (response.status === 404) throw new ApiError(400, 'This OpenAI project cannot access the selected model or stored files.')
    throw new ApiError(response.status === 400 ? 400 : 502, 'OpenAI Platform could not complete the hosted tool request.')
  }

  async function indexStatus(saved, signal) {
    if (!saved.storeId || !saved.files.length) return []
    return Promise.all(saved.files.map(async item => {
      try {
        const result = await call(saved.apiKey, `vector_stores/${saved.storeId}/files/${item.id}`, { signal })
        return { ...item, status: result.status ?? 'in_progress' }
      } catch {
        signal?.throwIfAborted()
        return { ...item, status: 'unavailable' }
      }
    }))
  }

  async function describe(saved) {
    return { configured: Boolean(saved.apiKey), enabled: saved.enabled, files: await indexStatus(saved) }
  }

  async function configure(input) {
    const saved = await file.update(async current => {
      const apiKey = typeof input.apiKey === 'string' ? input.apiKey.trim() : ''
      if (apiKey) {
        if (!/^sk-[\w-]{6,250}$/.test(apiKey)) throw new ApiError(400, 'Enter an OpenAI Platform API key.')
        await call(apiKey, 'models/' + platformModel.id)
        if (current.storeId) await call(apiKey, 'vector_stores/' + current.storeId)
      }
      if (typeof input.enabled !== 'boolean' && !apiKey) throw new ApiError(400, 'Choose whether to enable hosted tools.')
      const enabled = input.enabled ?? current.enabled
      const key = apiKey || current.apiKey
      if (enabled && !key) throw new ApiError(400, 'Connect an OpenAI Platform API key first.')
      return { ...current, enabled, apiKey: key }
    })
    return describe(saved)
  }

  async function upload(name, bytes) {
    const filename = name.replace(/[\\/\x00-\x1f\x7f]/g, '_').trim().slice(0, 180)
    if (!allowedFiles.includes(extname(filename).toLowerCase()) || !bytes.length || bytes.length > maxFileSize) {
      throw new ApiError(400, 'Choose a supported study file up to 15 MB.')
    }

    // Persist an empty store before uploading so a failed file can be retried in that same store.
    await file.update(async current => {
      if (!current.apiKey) throw new ApiError(409, 'Connect an OpenAI Platform API key first.')
      if (current.storeId) return current
      const store = await call(current.apiKey, 'vector_stores', { method: 'POST', data: { name: 'quizeit — study files' } })
      if (!/^vs_[\w-]+$/.test(store.id ?? '')) throw new ApiError(502, 'OpenAI did not return a valid search store.')
      return { ...current, storeId: store.id }
    })
    const saved = await file.update(async current => {
      if (current.files.length >= 25) throw new ApiError(400, 'Remove a study file before adding more than 25.')
      const form = new FormData()
      form.set('purpose', 'assistants')
      form.set('file', new Blob([bytes]), filename)
      const uploaded = await call(current.apiKey, 'files', { method: 'POST', form })
      if (!/^file-[\w-]+$/.test(uploaded.id ?? '')) throw new ApiError(502, 'OpenAI did not return a valid file ID.')
      try {
        await call(current.apiKey, `vector_stores/${current.storeId}/files`, { method: 'POST', data: { file_id: uploaded.id } })
      } catch (error) {
        await call(current.apiKey, 'files/' + uploaded.id, { method: 'DELETE', notFoundOk: true }).catch(() => {})
        throw error
      }
      return { ...current, files: [...current.files, { id: uploaded.id, filename }] }
    })
    return describe(saved)
  }

  async function remove(id) {
    const saved = await file.update(async current => {
      if (!current.files.some(item => item.id === id)) throw new ApiError(404, 'Study file not found.')
      await call(current.apiKey, 'files/' + id, { method: 'DELETE', notFoundOk: true })
      return { ...current, files: current.files.filter(item => item.id !== id) }
    })
    return describe(saved)
  }

  return {
    configure, upload, remove,
    disconnect: async () => describe(await file.update(current => {
      if (current.files.length) throw new ApiError(409, 'Remove the uploaded study files first so they can be deleted from OpenAI.')
      return { ...current, apiKey: '', enabled: false, storeId: null }
    })),
    status: async () => describe(await file.read()),
    connection: async () => {
      const saved = await file.read()
      return saved.enabled ? { apiKey: saved.apiKey, storeId: saved.storeId, files: saved.files } : null
    },
    tools: async (saved, signal) => platformTools((await indexStatus(saved, signal)).some(item => item.status === 'completed') ? saved.storeId : null),
  }
}
