import { pluginIdPattern } from '../../../packages/plugin-sdk/index.js'
import { mongoStore } from '../../../scripts/mongo-store.mjs'

const reservedActions = new Set(['settings'])
const roleLabels = { learner: 'Learner', admin: 'Administrator' }
const methods = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE']
const identifier = value => typeof value === 'string' && value.length <= 64 && pluginIdPattern.test(value)
const label = value => typeof value === 'string' && value.trim() && value.length <= 100

export function validSetting(field, value) {
  if (field.type === 'boolean') return typeof value === 'boolean'
  if (field.type === 'text') return typeof value === 'string' && value.length <= (field.maxLength ?? 500)
  return field.type === 'integer' && Number.isSafeInteger(value) && value >= (field.min ?? 0) && value <= (field.max ?? 1000)
}

function add(map, id, value) {
  if (map.has(id)) throw new Error('Duplicate plugin registration "' + id + '".')
  map.set(id, value)
}

export function createPluginRegistry(db) {
  const plugins = new Map()
  const permissions = new Map()
  const roles = new Map()
  const points = new Map()
  const contributions = new Map()
  const events = new Set(['attempt.submitted', 'attempt.graded'])
  let sealed = false

  function can(user, permission) {
    if (!user || user.role === 'candidate' || !permissions.has(permission)) return false
    return user.role === 'admin' || permissions.get(permission) === 'signed-in'
      || roles.get(user.role)?.permissions.includes(permission) === true
  }

  function namespace(prefix, name) {
    if (!identifier(name)) throw new Error('Invalid registration name "' + name + '" for "' + prefix + '".')
    return prefix + '.' + name
  }

  function definePoint(name, validate) {
    if (sealed || typeof validate !== 'function') throw new Error('Invalid extension point "' + name + '".')
    add(points, name, validate)
    return name
  }

  function register(manifest) {
    if (sealed) throw new Error('Plugin registration is closed.')
    const { id } = manifest
    const pages = new Map()
    const actions = new Map()
    const settings = new Map()
    const stores = new Map()
    const storeFor = (name, initialValue) => {
      const key = namespace(id, name)
      if (!stores.has(key)) {
        const store = mongoStore(db, 'plugin:' + key)
        let ready
        const initialize = () => ready ??= store.initialize(initialValue).catch(error => {
          ready = undefined
          throw error
        })
        stores.set(key, Object.freeze({
          read: async () => { await initialize(); return store.read() },
          update: async change => { await initialize(); return store.update(change) },
        }))
      }
      return stores.get(key)
    }
    const settingDefaults = () => Object.fromEntries([...settings.values()].map(field => [field.id, field.default]))
    const settingStore = () => storeFor('settings', settingDefaults)
    const plugin = { manifest, pages, actions, settings,
      async readSettings() {
        if (!settings.size) return {}
        const values = await settingStore().read()
        return Object.fromEntries([...settings.values()].map(field => {
          const value = values[field.id]
          return [field.id, validSetting(field, value) ? value : field.default]
        }))
      },
      async updateSettings(values) {
        if (Object.keys(values).length !== settings.size
          || [...settings.values()].some(field => !Object.hasOwn(values, field.id) || !validSetting(field, values[field.id]))) return null
        return settingStore().update(() => values)
      },
    }
    add(plugins, id, plugin)

    function duringRegistration() {
      if (sealed) throw new Error('Plugin registration is closed.')
    }

    return Object.freeze({
      permission(name, { access = 'assigned' } = {}) {
        duringRegistration()
        const key = namespace(id, name)
        if (!['assigned', 'signed-in'].includes(access)) throw new Error('Invalid permission access for "' + key + '".')
        add(permissions, key, access)
        return key
      },
      role(name, { label: title, permissions: grants }) {
        duringRegistration()
        const key = namespace(id, name)
        if (!label(title) || !Array.isArray(grants) || grants.some(grant => typeof grant !== 'string')) {
          throw new Error('Invalid role "' + key + '".')
        }
        add(roles, key, { label: title, permissions: [...grants] })
        return key
      },
      page(page) {
        duringRegistration()
        const key = namespace(id, page.id)
        if (!manifest.browser || !label(page.title) || page.id === 'settings') throw new Error('Invalid plugin page "' + key + '".')
        add(pages, page.id, { id: page.id, title: page.title, permission: page.permission })
      },
      action(action) {
        duringRegistration()
        const key = namespace(id, action.id)
        if (!methods.includes(action.method) || typeof action.handler !== 'function' || reservedActions.has(action.id)) {
          throw new Error('Invalid plugin action "' + key + '".')
        }
        add(actions, action.method + ':' + action.id, { ...action })
      },
      setting(field) {
        duringRegistration()
        const key = namespace(id, field.id)
        if (field.id === 'settings' || !label(field.label) || !validSetting(field, field.default)) throw new Error('Invalid plugin setting "' + key + '".')
        const { id: fieldId, label: title, type, default: defaultValue, min, max, maxLength } = field
        add(settings, fieldId, { id: fieldId, label: title, type, default: defaultValue, min, max, maxLength })
      },
      store(name, initialValue) {
        if (name === 'settings' || typeof initialValue !== 'function') throw new Error('Invalid plugin store "' + name + '".')
        return storeFor(name, initialValue)
      },
      definePoint(name, validate) {
        return definePoint(namespace(id, name), validate)
      },
      contribute(point, name, value) {
        duringRegistration()
        const key = namespace(id, name)
        if (!contributions.has(point)) contributions.set(point, new Map())
        add(contributions.get(point), key, { id: key, value, pluginId: id })
      },
      contributions: point => listContributions(point),
      defineEvent(name) {
        duringRegistration()
        const key = namespace(id, name)
        if (events.has(key)) throw new Error('Duplicate event "' + key + '".')
        events.add(key)
        return key
      },
      on(name, handler) {
        duringRegistration()
        if (typeof handler !== 'function') throw new Error('Invalid event handler for "' + name + '".')
        if (!listeners.has(name)) listeners.set(name, [])
        listeners.get(name).push({ id, handler })
      },
      emit(name, payload) {
        if (!name.startsWith(id + '.')) throw new Error('Plugins can emit only their own events.')
        return emit(name, payload)
      },
    })
  }

  const listeners = new Map()

  function listContributions(point) {
    return [...contributions.get(point)?.values() ?? []]
  }

  async function emit(name, payload) {
    if (!sealed || !events.has(name)) throw new Error('Unknown or unavailable event "' + name + '".')
    for (const { id, handler } of listeners.get(name) ?? []) {
      try { await handler(structuredClone(payload)) }
      catch (error) { console.error('Plugin event handler failed:', id, name, error?.name ?? 'Error') }
    }
  }

  function seal() {
    for (const [key, role] of roles) {
      if (role.permissions.some(grant => !permissions.has(grant))) throw new Error('Unknown permission in role "' + key + '".')
    }
    for (const [id, plugin] of plugins) {
      for (const item of [...plugin.pages.values(), ...plugin.actions.values()]) {
        if (!permissions.has(item.permission)) throw new Error('Unknown permission in plugin "' + id + '".')
      }
    }
    for (const [point, items] of contributions) {
      const validate = points.get(point)
      if (!validate) throw new Error('Unknown extension point "' + point + '".')
      for (const item of items.values()) if (!validate(item.value)) throw new Error('Invalid contribution "' + item.id + '" to "' + point + '".')
    }
    for (const name of listeners.keys()) if (!events.has(name)) throw new Error('Unknown event "' + name + '".')
    sealed = true
  }

  return { register, seal, definePoint, emit, listContributions, can,
    get: id => plugins.get(id),
    roles: () => ({ ...roleLabels, ...Object.fromEntries([...roles].map(([id, role]) => [id, role.label])) }),
    catalog(user) {
      return [...plugins.values()].flatMap(plugin => {
        const { id, name, version } = plugin.manifest
        const pages = [...plugin.pages.values()].filter(page => can(user, page.permission))
          .map(({ id, title }) => ({ id, title }))
        const settings = user.role === 'admin' ? [...plugin.settings.values()] : []
        return pages.length || settings.length ? [{ id, name, version, pages, settings }] : []
      })
    },
  }
}
