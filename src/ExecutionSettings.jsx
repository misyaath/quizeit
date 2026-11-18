import React, { useEffect, useState } from 'react'
import { codingLanguages } from './coding.js'
import { defaults, examField, limitFields } from './execution-settings.js'
import { localApi } from './local-api.js'

export default function ExecutionSettings({ sets }) {
  const [settings, setSettings] = useState(null)
  const [target, setTarget] = useState('defaults')
  const [form, setForm] = useState(defaults)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [scope, id] = target.split('/')
  const fields = scope === 'languages' ? limitFields : [...limitFields, examField]

  async function load() {
    setError('')
    try {
      const saved = await localApi('execution-settings')
      setSettings(saved)
      setForm(saved.defaults)
    } catch (error) { setError(error.message) }
  }

  useEffect(() => { void load() }, [])

  function changeScope(value) {
    const [scope, id] = value.split('/')
    setTarget(value)
    setForm({ ...settings.defaults, ...(scope !== 'defaults' && settings[scope][id]) })
    setMessage('')
    setError('')
  }

  async function save(values) {
    setBusy(true)
    setMessage('')
    setError('')
    try {
      const updated = await localApi('execution-settings', 'POST', { scope, id, values })
      setSettings(updated)
      if (!values) setForm(updated.defaults)
      setMessage('Execution settings saved.')
    } catch (error) { setError(error.message) }
    finally { setBusy(false) }
  }

  return <section className="question-panel settings-panel" aria-labelledby="execution-settings-heading">
    <h2 id="execution-settings-heading">Judge0 execution limits and exam timer</h2>
    <p>Limits apply to each test. Practice set overrides take precedence over language overrides. The exam timer starts when you open a new attempt.</p>
    {error && <p role="alert" className="notice">{error}</p>}
    {!settings && <button className="button small secondary" onClick={load}>Load settings</button>}
    {settings && <form className="execution-settings-form" onSubmit={event => {
      event.preventDefault()
      void save(Object.fromEntries(fields.map(({ name }) => [name, Number(form[name])])))
    }}>
      <label>Apply to <select value={target} disabled={busy} onChange={event => changeScope(event.target.value)}>
        <option value="defaults">Global defaults</option>
        <optgroup label="Languages">{Object.entries(codingLanguages).map(([id, item]) => <option key={id} value={'languages/' + id}>{item.label}</option>)}</optgroup>
        <optgroup label="Practice sets">{sets.map(item => <option key={item.id} value={'sets/' + item.id}>{item.title}</option>)}</optgroup>
      </select></label>
      <div className="execution-limit-fields">
        {fields.map(({ name, label, min, max }) => <label key={name}>{label}
          <input type="number" min={min} max={max} required disabled={busy} value={form[name]}
            onChange={event => setForm(previous => ({ ...previous, [name]: event.target.value }))} />
        </label>)}
      </div>
      <div className="ai-actions">
        <button className="button small primary" disabled={busy}>Save execution limits</button>
        {scope !== 'defaults' && settings[scope][id] &&
          <button className="button small secondary" type="button" disabled={busy} onClick={() => save(null)}>Remove override</button>}
        <span role="status">{message}</span>
      </div>
    </form>}
  </section>
}
