export function apiUrl(path) {
  const candidate = typeof window !== 'undefined' && /^\/candidate\/(exam-[a-f0-9-]{36})\/?$/.exec(window.location.pathname)
  return candidate ? '/api/candidate/' + candidate[1] + '/' + path : '/api/' + path
}

export async function localApi(path, method = 'GET', data) {
  const response = await fetch(apiUrl(path), {
    method,
    headers: data === undefined ? undefined : { 'Content-Type': 'application/json' },
    body: data === undefined ? undefined : JSON.stringify(data),
  })
  const result = await response.json().catch(() => null)
  if (!response.ok || !result) throw new Error(result?.error ?? 'Could not reach the local app server.')
  return result
}

export async function localAiApi(path, data, onProgress) {
  const response = await fetch('/api/' + path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/x-ndjson' },
    body: JSON.stringify(data),
  })
  if (!response.headers.get('content-type')?.includes('application/x-ndjson')) {
    const result = await response.json().catch(() => null)
    if (!response.ok || !result) {
      const error = new Error(result?.error ?? 'Could not reach the local app server.')
      error.code = result?.code
      throw error
    }
    return result
  }

  const decoder = new TextDecoder()
  let pending = ''
  for await (const chunk of response.body) {
    pending += decoder.decode(chunk, { stream: true })
    let end
    while ((end = pending.indexOf('\n')) !== -1) {
      const event = JSON.parse(pending.slice(0, end))
      pending = pending.slice(end + 1)
      if (event.type === 'progress') onProgress(event.message)
      if (event.type === 'error') {
        const error = new Error(event.error)
        error.code = event.code
        throw error
      }
      if (event.type === 'result') return event.result
    }
  }
  throw new Error('The AI connection closed before a final response arrived. Check the quiz or attempt history before retrying.')
}
