import { ApiError } from './openai.mjs'

export function json(res, data, status = 200) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' })
  res.end(JSON.stringify(data))
}

export async function respondWithProgress(req, res, status, action) {
  if (!req.headers.accept?.includes('application/x-ndjson')) return json(res, await action(), status)
  res.writeHead(status, { 'Content-Type': 'application/x-ndjson; charset=utf-8', 'Cache-Control': 'no-store' })
  res.flushHeaders()
  function write(event) {
    if (!res.destroyed && !res.writableEnded) res.write(JSON.stringify(event) + '\n')
  }
  try {
    const result = await action(message => write({ type: 'progress', message }))
    write({ type: 'result', result })
  } catch (error) {
    if (!(error instanceof ApiError)) console.error('Local AI request failed:', error.code ?? error.name)
    write({ type: 'error', error: error instanceof ApiError ? error.message : 'The local server could not complete the AI request.', code: error instanceof ApiError ? error.code : undefined })
  } finally {
    res.end()
  }
}

export async function readBody(req, limit = 256_000) {
  if (!req.headers['content-type']?.match(/^application\/json(?:\s*;|$)/i)) throw new ApiError(415, 'A JSON body is required.')
  let size = 0
  const chunks = []
  for await (const chunk of req) {
    size += chunk.length
    if (size <= limit) chunks.push(chunk)
  }
  if (size > limit) throw new ApiError(413, 'The request is too large.')
  try {
    const body = JSON.parse(Buffer.concat(chunks).toString('utf8'))
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error()
    return body
  } catch {
    throw new ApiError(400, 'Invalid JSON request.')
  }
}
