import { apiUrl } from './local-api.js'

export async function uploadExamEvidence(path, params, image, label, signal) {
  params.set('request', crypto.randomUUID())
  const endpoint = apiUrl(path + '?' + params)
  for (let attempt = 0; attempt < 2; attempt++) {
    const timeout = AbortSignal.timeout(7000)
    let response
    try {
      response = await fetch(endpoint, { method: 'POST', body: image,
        signal: signal ? AbortSignal.any([signal, timeout]) : timeout })
    } catch (error) {
      if (signal?.aborted) throw error
      if (attempt === 0) continue
      throw new Error('Quizeit could not upload the ' + label + '. Check your connection to the app and share your exam again.')
    }
    if (response.ok) return
    if (response.status >= 500 && attempt === 0) continue
    const problem = await response.json().catch(() => null)
    const error = new Error(problem?.error ?? 'Could not save the ' + label + '.')
    error.status = response.status
    throw error
  }
}
