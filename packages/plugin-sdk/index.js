export const pluginApiVersion = 1

export const pluginIdPattern = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/

export function definePlugin(register) {
  if (typeof register !== 'function') throw new TypeError('A plugin must export a registration function.')
  return register
}

export class PluginError extends Error {
  constructor(status, message) {
    super(message)
    this.status = status
  }
}

export function download(filename, body, contentType = 'text/plain; charset=utf-8') {
  return { kind: 'download', filename, body, contentType }
}
