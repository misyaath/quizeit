import React, { useEffect, useState } from 'react'
import { localApi } from './local-api.js'

const labels = { completed: 'Ready', in_progress: 'Indexing', failed: 'Indexing failed', cancelled: 'Indexing canceled', unavailable: 'Status unavailable' }

export default function HostedToolsSettings() {
  const [status, setStatus] = useState(null)
  const [apiKey, setApiKey] = useState('')
  const [file, setFile] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function update(action) {
    setBusy(true)
    setError('')
    try {
      setStatus(await action())
      return true
    } catch (error) {
      setError(error.message)
      return false
    } finally {
      setBusy(false)
    }
  }

  const refresh = () => update(() => localApi('openai/hosted'))
  useEffect(() => { void refresh() }, [])

  async function connect(event) {
    event.preventDefault()
    if (await update(() => localApi('openai/hosted', 'POST', { apiKey, enabled: true }))) setApiKey('')
  }

  async function upload(event) {
    event.preventDefault()
    const form = event.currentTarget
    if (await update(async () => {
      const response = await fetch('/api/openai/hosted/files', {
        method: 'POST', headers: { 'Content-Type': 'application/octet-stream', 'X-Filename': encodeURIComponent(file.name) }, body: file,
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error ?? 'The study file could not be uploaded.')
      return data
    })) {
      setFile(null)
      form.reset()
    }
  }

  return <section className="question-panel settings-panel" aria-labelledby="hosted-tools-heading">
    <h2 id="hosted-tools-heading">OpenAI hosted tools</h2>
    <p>Enable File Search, Code Interpreter, and dynamic tool search for question generation and AI explanations. Requests use GPT-6.2 Astra and your OpenAI Platform billing.</p>
    {status && <p role="status">{status.enabled ? 'Hosted tools enabled' : 'Hosted tools off'}</p>}
    {error && <p className="notice" role="alert">{error}</p>}
    <form className="settings-form" onSubmit={connect}>
      <label className="filter-label">{status?.configured ? 'Replace OpenAI API key' : 'OpenAI API key'}
        <input className="typed" type="password" value={apiKey} required disabled={busy} onChange={event => setApiKey(event.target.value)} autoComplete="off" />
      </label>
      <div className="ai-actions">
        <button className="button primary" disabled={busy || !apiKey.trim()}>Connect and enable hosted tools</button>
        {status?.configured && <button type="button" className="button secondary" disabled={busy}
          onClick={() => update(() => localApi('openai/hosted', 'POST', { enabled: !status.enabled }))}>
          {status.enabled ? 'Switch to ChatGPT OAuth' : 'Enable hosted tools'}
        </button>}
      </div>
    </form>
    {status?.configured && <>
      <div className="section-heading hosted-files-heading">
        <h3>Study files</h3>
        <button type="button" className="button secondary small" disabled={busy} onClick={refresh}>Refresh file status</button>
      </div>
      <p className="muted">Files are uploaded to your OpenAI project. File Search can use them once they’re indexed.</p>
      <form className="settings-form" onSubmit={upload}>
        <label className="filter-label">Choose a study file
          <input type="file" accept=".pdf,.txt,.md,.docx,.pptx,.json,.py" disabled={busy} onChange={event => setFile(event.target.files[0] ?? null)} />
        </label>
        <button className="button secondary" disabled={busy || !file}>Upload study file</button>
      </form>
      <ul className="hosted-file-list">
        {status.files.map(item => <li key={item.id}>
          <span>{item.filename} <small>{labels[item.status] ?? item.status}</small></span>
          <button type="button" className="button secondary small" disabled={busy} aria-label={'Remove ' + item.filename}
            onClick={() => update(() => localApi('openai/hosted/files/' + encodeURIComponent(item.id), 'DELETE'))}>Remove</button>
        </li>)}
      </ul>
      <button type="button" className="text-button" disabled={busy} onClick={() => update(() => localApi('openai/hosted', 'DELETE'))}>
        Remove saved API key
      </button>
    </>}
    <p><a href="https://platform.openai.com/api-keys" target="_blank" rel="noreferrer">OpenAI Platform API keys ↗</a></p>
  </section>
}
