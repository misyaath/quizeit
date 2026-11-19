import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { readEnvFile } from '../../../scripts/env-file.mjs'
import { pluginApiVersion, pluginIdPattern } from '../../../packages/plugin-sdk/index.js'

export async function pluginManifests({ root = resolve('.'), configFile } = {}) {
  const env = configFile || process.env.QUIZEIT_PLUGIN_CONFIG ? {} : await readEnvFile(resolve(root, '.env'))
  const path = resolve(root, configFile || process.env.QUIZEIT_PLUGIN_CONFIG || env.QUIZEIT_PLUGIN_CONFIG || 'plugins.config.json')
  const config = JSON.parse(await readFile(path, 'utf8'))
  if (!Array.isArray(config?.enabled) || config.enabled.some(id => typeof id !== 'string' || id.length > 64 || !pluginIdPattern.test(id))
    || new Set(config.enabled).size !== config.enabled.length) {
    throw new Error('Plugin configuration must list unique plugin IDs in "enabled".')
  }
  return Promise.all(config.enabled.map(async id => {
    const directory = resolve(root, 'plugins', id)
    const manifest = JSON.parse(await readFile(resolve(directory, 'plugin.json'), 'utf8'))
    if (manifest?.id !== id || manifest.apiVersion !== pluginApiVersion || typeof manifest.name !== 'string'
      || !manifest.name.trim() || typeof manifest.version !== 'string' || !manifest.version.trim()
      || (manifest.browser !== undefined && typeof manifest.browser !== 'boolean')) {
      throw new Error('Invalid or incompatible manifest for plugin "' + id + '".')
    }
    return { id, name: manifest.name, version: manifest.version, directory, browser: manifest.browser === true }
  }))
}
