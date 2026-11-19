import React, { useEffect, useState } from 'react'
import pages from 'quizeit:plugin-pages'
import { apiUrl, localApi } from '../../../src/local-api.js'

export default function PluginArea({ plugin, pageId, loading }) {
  if (loading) return <p role="status">Loading plugins…</p>
  if (pageId === 'settings' && plugin?.settings.length) return <PluginSettings key={plugin.id} plugin={plugin} />
  const page = plugin?.pages.find(item => item.id === pageId)
  const Page = page && pages[plugin.id]?.[pageId]
  if (!Page) return <p className="notice" role="alert">This plugin page is unavailable.</p>
  const path = action => 'plugins/' + plugin.id + '/' + encodeURIComponent(action)
  return <Page key={plugin.id + '/' + pageId}
    action={(name, method, data) => localApi(path(name), method, data)}
    actionUrl={name => apiUrl(path(name))} />
}

function PluginSettings({ plugin }) {
  const [values, setValues] = useState(null)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [saving, setSaving] = useState(false)
  const path = 'plugins/' + plugin.id + '/settings'

  useEffect(() => {
    let active = true
    localApi(path).then(result => { if (active) setValues(result) })
      .catch(failure => { if (active) setError(failure.message) })
    return () => { active = false }
  }, [path])

  async function save(event) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const input = Object.fromEntries(plugin.settings.map(field => {
      const value = form.get(field.id)
      return [field.id, field.type === 'boolean' ? value !== null : field.type === 'integer' ? Number(value) : value]
    }))
    setSaving(true)
    setError('')
    setMessage('')
    try {
      setValues(await localApi(path, 'PUT', input))
      setMessage('Settings saved.')
    } catch (failure) { setError(failure.message) }
    finally { setSaving(false) }
  }

  return <>
    <h1>{plugin.name} settings</h1>
    {error && <p className="notice" role="alert">{error}</p>}
    {message && <p className="notice" role="status">{message}</p>}
    {values && <form className="question-panel author-form dashboard-section" onSubmit={save}>
      {plugin.settings.map(field => field.type === 'boolean'
        ? <label key={field.id}><input type="checkbox" name={field.id} defaultChecked={values[field.id]} disabled={saving} /> {field.label}</label>
        : <label className="editor-field" key={field.id}>{field.label}
          {field.type === 'integer'
            ? <input type="number" name={field.id} defaultValue={values[field.id]} min={field.min ?? 0} max={field.max ?? 1000} disabled={saving} required />
            : <input type="text" name={field.id} defaultValue={values[field.id]} maxLength={field.maxLength ?? 500} disabled={saving} />}
        </label>)}
      <div><button className="button primary" disabled={saving}>Save settings</button></div>
    </form>}
  </>
}
