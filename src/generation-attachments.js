export const maxAttachmentCount = 3
export const maxAttachmentBytes = 10 * 1024 * 1024
export const maxAttachmentText = 60_000

const textFiles = {
  '.txt': 'text/plain',
  '.md': 'text/markdown',
  '.csv': 'text/csv',
  '.json': 'application/json',
  '.yaml': 'application/yaml',
  '.yml': 'application/yaml',
}
const commonFiles = { ...textFiles, '.pdf': 'application/pdf' }
const platformFiles = {
  ...commonFiles,
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
}

export const attachmentExtensions = platform => Object.keys(platform ? platformFiles : commonFiles)
export const attachmentExtension = name => name.slice(name.lastIndexOf('.') < 0 ? name.length : name.lastIndexOf('.')).toLowerCase()

export function attachmentMime(name, platform) {
  const types = platform ? platformFiles : commonFiles
  const extension = attachmentExtension(name)
  return Object.hasOwn(types, extension) ? types[extension] : undefined
}

export function attachmentIssue(files, platform) {
  if (files.length > maxAttachmentCount) return 'Attach up to 3 files.'
  if (files.some(({ name }) => !attachmentMime(name, platform))) {
    return platform ? 'Choose a supported attachment type.' : 'Choose PDF, TXT, Markdown, CSV, JSON, or YAML for the ChatGPT connection.'
  }
  if (files.some(file => !file.size)) return 'Remove any empty attachments.'
  if (files.reduce((total, file) => total + file.size, 0) > maxAttachmentBytes) return 'Attachments must total 10 MiB or less.'
  return ''
}
