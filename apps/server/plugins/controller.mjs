import { All, Controller, Get, Inject, Module, Put } from '@nestjs/common'
import { PluginError } from '../../../packages/plugin-sdk/index.js'
import { json, readBody } from '../../../scripts/http.mjs'
import { ApiError } from '../../../scripts/openai.mjs'
import { ACCOUNTS, APP_DATA } from '../../../scripts/backend-services.module.mjs'
import { bindRoute } from '../../../scripts/routes/nest-http.mjs'
import { PLUGINS } from './runtime.mjs'
import { pluginServices } from './services.mjs'

class PluginsController {
  constructor(plugins, data, accounts) {
    this.plugins = plugins
    this.services = pluginServices(data)
    this.accounts = accounts
  }

  catalog({ req }, res) {
    return json(res, this.plugins.catalog(req.user))
  }

  settingsPlugin(req) {
    if (req.user.role !== 'admin') throw new ApiError(403, 'Only administrators can manage plugin settings.')
    const plugin = this.plugins.get(req.params.pluginId)
    if (!plugin?.settings.size) throw new ApiError(404, 'Plugin settings are unavailable.')
    return plugin
  }

  async settings({ req }, res) {
    return json(res, await this.settingsPlugin(req).readSettings())
  }

  async saveSettings({ req }, res) {
    const plugin = this.settingsPlugin(req)
    const saved = await plugin.updateSettings(await readBody(req, 20_000))
    if (!saved) throw new ApiError(400, 'Enter valid values for the plugin settings.')
    return json(res, saved)
  }

  async action({ req, url }, res) {
    const plugin = this.plugins.get(req.params.pluginId)
    const action = plugin?.actions.get(req.method + ':' + req.params.actionId)
    if (!action) throw new ApiError(404, 'Plugin action is unavailable.')
    if (!this.plugins.can(req.user, action.permission)) throw new ApiError(403, 'You do not have access to this plugin action.')
    let result
    try {
      result = await action.handler({
        user: this.accounts.publicUser(req.user),
        query: url.searchParams,
        readJson: () => readBody(req),
        settings: await plugin.readSettings(),
        services: this.services,
      })
    } catch (error) {
      if (error instanceof PluginError && Number.isInteger(error.status) && error.status >= 400 && error.status < 500) {
        throw new ApiError(error.status, error.message)
      }
      throw error
    }
    if (result?.kind !== 'download') return json(res, result ?? {})
    const { filename, body, contentType } = result
    if (!/^[a-zA-Z0-9_.-]+$/.test(filename) || typeof body !== 'string'
      || !/^[a-zA-Z0-9/+.-]+(?:; charset=utf-8)?$/.test(contentType)) throw new Error('Invalid plugin download.')
    res.writeHead(200, { 'Content-Type': contentType, 'Content-Disposition': 'attachment; filename="' + filename + '"',
      'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'no-store' })
    return res.end(body)
  }
}

Controller('api/plugins')(PluginsController)
Inject(PLUGINS)(PluginsController, undefined, 0)
Inject(APP_DATA)(PluginsController, undefined, 1)
Inject(ACCOUNTS)(PluginsController, undefined, 2)
bindRoute(PluginsController, 'catalog', Get())
bindRoute(PluginsController, 'settings', Get(':pluginId/settings'))
bindRoute(PluginsController, 'saveSettings', Put(':pluginId/settings'))
bindRoute(PluginsController, 'action', All(':pluginId/:actionId'))

export class PluginsModule {}
Module({ controllers: [PluginsController] })(PluginsModule)
