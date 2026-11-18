const api = 'https://api.openai.com/v1'

export class ApiError extends Error {
  constructor(status, message, code) {
    super(message)
    this.status = status
    this.code = code
  }
}

function inferenceError(status, code) {
  if (code === 'subscription_sharing_usage_unavailable' || code === 'subscription_sharing_user_unavailable' || status === 503) {
    return new ApiError(503, 'ChatGPT plan usage is temporarily unavailable. Try again later.')
  }
  if (status === 401 || code === 'subscription_sharing_invalid_user') return new ApiError(401, 'Your ChatGPT session needs to be renewed. Reconnect in Settings.')
  if (code === 'subscription_sharing_user_not_eligible' || [403, 404].includes(status)) {
    return new ApiError(403, 'This ChatGPT account or workspace cannot use plan explanations. Check your plan and app access in ChatGPT Settings.')
  }
  if (code === 'subscription_sharing_unsupported_capability') return new ApiError(400, 'This ChatGPT connection does not support one of the requested tools or settings. Try another available model.')
  if (status === 400) return new ApiError(400, 'ChatGPT rejected these request settings. Try Model default effort or another available model.')
  if (status === 429 || code === 'subscription_sharing_usage_limit_exceeded') {
    return new ApiError(429, 'You reached a ChatGPT usage limit. Check ChatGPT Settings → Usage.')
  }
  return new ApiError(502, 'OpenAI could not complete the explanation. Try again.')
}

async function send(fetchResponse, path, options, timeoutMs = 90_000) {
  const deadline = AbortSignal.timeout(timeoutMs)
  const signal = options.signal ? AbortSignal.any([options.signal, deadline]) : deadline
  signal.throwIfAborted()
  const response = await fetchResponse(api + path, { ...options, signal })
  if (!response.ok) {
    const data = await response.json().catch(() => ({}))
    throw inferenceError(response.status, data.error?.code ?? data.code)
  }
  return response
}

function reportActivity(event, onProgress) {
  if (['response.web_search_call.in_progress', 'response.web_search_call.searching'].includes(event.type)) {
    onProgress?.('Searching the web…')
  } else if (event.type.startsWith('response.file_search_call.') && !event.type.endsWith('.completed')) {
    onProgress?.('Searching your study files…')
  } else if ((event.type.startsWith('response.code_interpreter_call.') && !event.type.endsWith('.completed'))
    || event.type.startsWith('response.code_interpreter_call_code.')) {
    onProgress?.('Using Code Interpreter…')
  } else if (event.type === 'response.output_item.added' && event.item?.type === 'tool_search_call') {
    onProgress?.('Finding the right tool…')
  } else if (event.type === 'response.web_search_call.completed') {
    onProgress?.('Reviewing web results…')
  } else if (event.type === 'response.output_item.added' && event.item?.type === 'reasoning') {
    onProgress?.('Thinking…')
  } else if (event.type === 'response.output_text.delta') {
    onProgress?.('Writing the response…')
  }
}

async function terminalResponse(body, onProgress) {
  let buffer = ''
  const decoder = new TextDecoder()
  const completedItems = new Map()
  const textParts = new Map()
  for await (const chunk of body) {
    buffer += decoder.decode(chunk, { stream: true })
    let separator
    while ((separator = /\r?\n\r?\n/.exec(buffer))) {
      const frame = buffer.slice(0, separator.index)
      buffer = buffer.slice(separator.index + separator[0].length)
      const data = frame.split(/\r?\n/).filter(line => line.startsWith('data:'))
        .map(line => line.slice(5).replace(/^ /, '')).join('\n')
      if (!data || data === '[DONE]') continue
      const event = JSON.parse(data)
      reportActivity(event, onProgress)
      if (event.type === 'response.output_item.done' && event.item && Number.isInteger(event.output_index)) {
        completedItems.set(event.output_index, event.item)
      }
      if (event.type === 'response.output_text.delta' || event.type === 'response.output_text.done') {
        const key = `${event.output_index ?? 0}:${event.content_index ?? 0}`
        if (event.type === 'response.output_text.done' && typeof event.text === 'string') textParts.set(key, event.text)
        else if (typeof event.delta === 'string') textParts.set(key, (textParts.get(key) ?? '') + event.delta)
      }
      if (event.type === 'response.completed' || event.type === 'response.incomplete') {
        const output = Array.from(event.response.output ?? [])
        for (const [index, item] of completedItems) if (!output[index]) output[index] = item
        const streamedText = [...textParts.entries()].sort(([a], [b]) => a.localeCompare(b, undefined, { numeric: true }))
          .map(([, text]) => text).join('\n\n')
        return { ...event, response: { ...event.response, output: output.filter(Boolean) }, streamedText }
      }
      if (event.type === 'response.failed' || event.type === 'error') {
        throw inferenceError(undefined, event.response?.error?.code ?? event.code)
      }
    }
  }
  throw new ApiError(502, 'OpenAI closed the stream before completing the explanation. Try again.')
}

const effortValues = ['none', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max']

function modelEfforts(item) {
  const advertised = item.supported_reasoning_efforts ?? item.supported_reasoning_levels
  if (Array.isArray(advertised)) {
    const reported = advertised.map(value => typeof value === 'string' ? value : value?.reasoning_effort ?? value?.effort)
    return effortValues.filter(value => reported.includes(value))
  }
  if (/^gpt-6(?:\.2)?-(astra|sol|luna)(?:-|$)|^gpt-6\.1-sol(?:-|$)/.test(item.slug)) {
    return ['low', 'medium', 'high', 'xhigh', 'max']
  }
  return []
}

export async function listModels({ accessToken, signal, fetchResponse = fetch }) {
  try {
    const catalog = await send(fetchResponse, '/models', { headers: { Authorization: 'Bearer ' + accessToken }, signal })
    const { models } = await catalog.json()
    return (models ?? []).filter(item => item?.visibility === 'list' && typeof item.slug === 'string')
      .map(item => ({
        id: item.slug,
        name: typeof item.display_name === 'string' ? item.display_name : item.slug,
        efforts: modelEfforts(item),
      }))
  } catch (error) {
    signal?.throwIfAborted()
    if (error instanceof ApiError) throw error
    throw new ApiError(502, 'Could not load the ChatGPT model list. Try again.')
  }
}

function collectSources(output, sources) {
  const candidates = output.flatMap(item => {
    if (item.type === 'web_search_call') return item.action?.sources ?? []
    if (item.type === 'message') return (item.content ?? []).flatMap(part => (part.annotations ?? []).filter(entry => entry.type === 'url_citation'))
    return []
  })
  for (const candidate of candidates) {
    try {
      const url = new URL(candidate.url)
      if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password) continue
      const title = typeof candidate.title === 'string' && candidate.title.trim() ? candidate.title.trim().slice(0, 160) : url.hostname
      if (sources.has(url.href) && title === url.hostname) continue
      if (sources.size < 30 || sources.has(url.href)) sources.set(url.href, { url: url.href, title })
    } catch {
      continue
    }
  }
}

export async function requestExplanation({ accessToken, prompt, instructions, modelId, effort, tools, runTool, onProgress, platformModel, timeoutMs, signal, fileInputs, fetchResponse = fetch }) {
  const headers = { Authorization: 'Bearer ' + accessToken }
  try {
    signal?.throwIfAborted()
    const available = platformModel ? [platformModel] : await listModels({ accessToken, fetchResponse, signal })
    const selected = modelId === undefined ? available[0] : available.find(item => item.id === modelId)
    if (!selected) throw new ApiError(400, 'Choose a model available to this ChatGPT account.')
    if (effort && !selected.efforts.includes(effort)) throw new ApiError(400, 'Choose a reasoning effort supported by this model.')
    const model = selected.id
    const content = fileInputs?.length ? [{ type: 'input_text', text: prompt }, ...fileInputs] : prompt
    const input = [...(instructions ? [{ role: 'developer', content: instructions }] : []), { role: 'user', content }]
    const sources = new Map()
    const files = new Set()
    let callsLeft = 8
    let finalizing = false

    let activity
    const report = message => {
      if (message !== activity) onProgress?.(message)
      activity = message
    }
    for (let round = 0; round <= 4; round++) {
      if (!finalizing) report(round === 0 ? 'Sending request to OpenAI…' : 'Thinking…')
      const stream = await send(fetchResponse, '/responses', {
        method: 'POST', signal,
        headers: { ...headers, 'Content-Type': 'application/json', Accept: 'text/event-stream' },
        body: JSON.stringify({
          model, store: false, stream: true, input,
          ...(effort ? { reasoning: { effort } } : {}),
          ...(platformModel && { parallel_tool_calls: false }),
          ...(tools ? { tools, tool_choice: finalizing ? 'none' : 'auto', include: ['web_search_call.action.sources', 'reasoning.encrypted_content'] } : {}),
        }),
      }, timeoutMs)
      const { type, response, streamedText } = await terminalResponse(stream.body, report)
      signal?.throwIfAborted()
      const output = response.output ?? []
      const incomplete = type === 'response.incomplete'
      if (tools) collectSources(output, sources)
      for (const item of output) {
        if (item.type !== 'message') continue
        for (const part of item.content ?? []) {
          for (const citation of part.annotations ?? []) {
            if (citation.type === 'file_citation' && typeof citation.filename === 'string') files.add(citation.filename)
          }
        }
      }
      const calls = output.filter(item => item.type === 'function_call')
      if (!incomplete && calls.length) {
        if (!runTool || round === 4 || calls.length > callsLeft || calls.some(call => typeof call.call_id !== 'string' || !call.call_id)) {
          throw new ApiError(502, 'ChatGPT exceeded the quiz lookup limit. Try a narrower prompt.')
        }
        report('Looking up questions in your bank…')
        callsLeft -= calls.length
        input.push(...output)
        for (const call of calls) {
          input.push({ type: 'function_call_output', call_id: call.call_id, output: JSON.stringify(await runTool(call)) })
        }
        continue
      }
      const parts = output.filter(item => item.type === 'message' && item.phase !== 'commentary').flatMap(item => item.content ?? [])
      const answer = parts.filter(part => part.type === 'output_text').map(part => part.text).filter(Boolean).join('\n\n').trim()
      const refusal = parts.filter(part => part.type === 'refusal').map(part => part.refusal).filter(Boolean).join('\n\n').trim()
      const text = answer || refusal || (!output.some(item => item.type === 'message' && item.phase === 'commentary') ? streamedText.trim() : '')
      if (!text && !incomplete && !finalizing && round < 4 && tools
        && output.some(item => ['tool_search_output', 'web_search_call', 'file_search_call', 'code_interpreter_call'].includes(item.type))) {
        finalizing = true
        report('Finishing the answer from tool results…')
        input.push(...output, { role: 'developer', content: 'Use the completed tool results and return the final answer requested by the earlier instructions.' })
        continue
      }
      if (!text) {
        const reason = response.incomplete_details?.reason
        if (reason === 'max_output_tokens') throw new ApiError(502, 'The model reached its output limit before writing an answer. Try fewer questions or a lower reasoning effort.', 'model_output_limit')
        if (reason === 'content_filter') throw new ApiError(502, 'OpenAI’s content filter stopped this response. Try rephrasing the request.')
        const outputTypes = [...new Set(output.map(item => item.type))].filter(value => typeof value === 'string' && /^[a-z_]{1,50}$/.test(value))
        const details = outputTypes.length ? ' Returned: ' + outputTypes.slice(0, 6).join(', ') + '.' : ''
        throw new ApiError(502, 'OpenAI finished without a final answer.' + details + ' Try fewer questions or switch models.', 'model_no_answer')
      }
      return { text, refused: Boolean(refusal && !answer), model: response.model ?? model, incomplete, source: platformModel ? 'openai-platform' : 'chatgpt', ...(files.size && { files: [...files] }), ...(tools && { sources: [...sources.values()] }) }
    }
  } catch (error) {
    signal?.throwIfAborted()
    if (error instanceof ApiError) throw error
    if (error.name === 'TimeoutError' || error.name === 'AbortError') throw new ApiError(504, 'OpenAI did not finish within the request time limit.', 'model_timeout')
    throw new ApiError(502, 'Could not finish the request to OpenAI. Try again.')
  }
}
