import { ApiError } from './openai.mjs'
import { attachmentIssue, attachmentMime, maxAttachmentCount, maxAttachmentText } from '../src/generation-attachments.js'

const validBase64 = /^[A-Za-z0-9+/]*={0,2}$/

async function pdfText(bytes, name, limit, signal) {
  const { getDocument } = await import('pdfjs-dist/legacy/build/pdf.mjs')
  signal?.throwIfAborted()
  const task = getDocument({ data: Uint8Array.from(bytes), isEvalSupported: false, useWorkerFetch: false, stopAtErrors: true, verbosity: 0 })
  let destroyed
  const stop = () => { destroyed ??= task.destroy().catch(() => {}) }
  signal?.addEventListener('abort', stop, { once: true })
  try {
    const document = await task.promise
    if (document.numPages > 100) throw new ApiError(413, name + ' has more than 100 pages. Attach a smaller PDF for the ChatGPT connection.')
    let text = ''
    for (let number = 1; number <= document.numPages; number++) {
      signal?.throwIfAborted()
      const page = await document.getPage(number)
      const content = await page.getTextContent()
      text += content.items.map(item => 'str' in item ? item.str + (item.hasEOL ? '\n' : ' ') : '').join('') + '\n'
      page.cleanup()
      if (text.length > limit) throw tooMuchText()
    }
    return text
  } catch (error) {
    signal?.throwIfAborted()
    if (error instanceof ApiError) throw error
    throw new ApiError(422, 'Could not read ' + name + '. Use an unlocked PDF or attach its text.')
  } finally {
    signal?.removeEventListener('abort', stop)
    stop()
    await destroyed
  }
}

function tooMuchText() {
  return new ApiError(413, 'The ChatGPT connection can use up to 60,000 attachment characters. Attach smaller excerpts.')
}

export async function prepareGenerationAttachments(input, { platform, signal }) {
  if (input === undefined) return { names: [], text: '', fileInputs: [] }
  if (!Array.isArray(input) || input.length > maxAttachmentCount) throw new ApiError(400, 'Attach up to 3 files.')
  const files = input.map(file => {
    const name = file?.name
    if (typeof name !== 'string' || !name.trim() || name.length > 200 || /[\u0000-\u001f\u007f/\\]/.test(name)
      || typeof file.base64 !== 'string' || file.base64.length % 4 || !validBase64.test(file.base64)) throw new ApiError(400, 'Invalid attachment.')
    const bytes = Buffer.from(file.base64, 'base64')
    return { name, bytes, size: bytes.length, mime: attachmentMime(name, platform) }
  })
  const issue = attachmentIssue(files, platform)
  if (issue) throw new ApiError(400, issue)
  const names = [...new Set(files.map(file => file.name))]
  if (platform) {
    const fileInputs = files.map(({ name, bytes, mime }) => ({
      type: 'input_file', filename: name, file_data: 'data:' + mime + ';base64,' + bytes.toString('base64'),
    }))
    return { names, text: '', fileInputs }
  }
  const blocks = []
  let remaining = maxAttachmentText
  for (const { name, bytes, mime } of files) {
    signal?.throwIfAborted()
    let text
    if (mime === 'application/pdf') text = await pdfText(bytes, name, remaining, signal)
    else {
      try { text = new TextDecoder('utf-8', { fatal: true }).decode(bytes) }
      catch { throw new ApiError(422, name + ' must be encoded as UTF-8.') }
    }
    text = text.trim()
    if (!text || text.includes('\0')) throw new ApiError(422, name + ' has no readable text. Use a text export or the Platform connection for a scanned PDF.')
    remaining -= text.length
    if (remaining < 0) throw tooMuchText()
    blocks.push('Attached study material (' + name + '):\n' + text)
  }
  return { names, text: blocks.join('\n\n'), fileInputs: [] }
}
