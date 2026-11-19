import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { pluginManifests } from './config.mjs'
import { createPluginRegistry } from './registry.mjs'
import { questionGenerators, validGenerator } from './generation.mjs'

export const PLUGINS = Symbol('PLUGINS')

export async function loadPlugins(db, options) {
  const registry = createPluginRegistry(db)
  registry.definePoint(questionGenerators, validGenerator)
  for (const manifest of await pluginManifests(options)) {
    const entry = await import(pathToFileURL(resolve(manifest.directory, 'server.mjs')).href)
    if (typeof entry.default !== 'function') throw new Error('Plugin "' + manifest.id + '" must export a registration function.')
    await entry.default(registry.register(manifest))
  }
  registry.seal()
  return registry
}
