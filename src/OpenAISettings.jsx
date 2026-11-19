import React, { useEffect, useState } from 'react'
import HostedToolsSettings from './HostedToolsSettings.jsx'
import { localApi } from './local-api.js'

const outcomes = {
  connected: 'Connected. You can now explain questions using your ChatGPT plan.',
  denied: 'ChatGPT sign-in was canceled.',
  permission: 'ChatGPT plan permission was not granted. Continue with ChatGPT and approve plan usage.',
  invalid: 'This sign-in link expired or could not be verified. Start again from Settings.',
  failed: 'ChatGPT sign-in did not complete. Try again from Settings.',
}

export default function OpenAISettings({ onImport, outcome }) {
  const [connection, setConnection] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState(Object.hasOwn(outcomes, outcome) ? outcomes[outcome] : '')
  const [importMessage, setImportMessage] = useState('')
  const [importing, setImporting] = useState(false)

  async function load() {
    setError('')
    try {
      setConnection(await localApi('openai/settings'))
    } catch (error) {
      setError(error.message)
    }
  }

  useEffect(() => { void load() }, [])

  async function connect(different = false) {
    setBusy(true)
    setError('')
    setNotice('')
    try {
      const { url } = await localApi('openai/authorize', 'POST', { different })
      window.location.assign(url)
    } catch (error) {
      setError(error.message)
      setBusy(false)
    }
  }

  async function disconnect() {
    setBusy(true)
    setError('')
    setNotice('')
    try {
      const result = await localApi('openai/settings', 'DELETE')
      setConnection(result)
      setNotice(result.revoked ? 'Disconnected.' : 'Disconnected locally. Open ChatGPT Settings to verify access was removed.')
    } catch (error) {
      setError(error.message)
    } finally {
      setBusy(false)
    }
  }

  async function importPrevious() {
    setImporting(true)
    try {
      const recent = JSON.parse(localStorage.getItem('ai-200-practice-v2'))
      const legacy = recent ? null : JSON.parse(localStorage.getItem('ai-200-practice-v1'))
      if (!recent && !legacy) {
        setImportMessage('No attempts from the browser-storage version were found.')
        return
      }
      const progress = await localApi('progress/import', 'POST', recent ?? { attempts: legacy, history: [], snapshots: [] })
      onImport(progress)
      setImportMessage('Previous attempts imported into your account.')
    } catch (error) {
      setImportMessage(error.message)
    } finally {
      setImporting(false)
    }
  }

  const loopbackUrl = 'http://127.0.0.1:' + window.location.port + '/settings'
  return <>
    <header className="bank-heading"><h1>Settings</h1></header>
    <section className="question-panel settings-panel" aria-labelledby="openai-heading">
      <h2 id="openai-heading">ChatGPT explanations</h2>
      <p>Sign in with an eligible ChatGPT plan to explain questions inside the quiz. OpenAI will ask you to approve plan usage and return you here.</p>
      {error && <p className="notice" role="alert">{error}</p>}
      {notice && <p role="status">{notice}</p>}
      {!connection
        ? error ? <button className="button secondary" onClick={load}>Retry</button> : <p role="status">Loading settings…</p>
        : <>
          <p className={connection.connected ? 'result-correct connection-badge' : 'format connection-badge'}>{connection.connected ? 'Using ChatGPT plan' : 'Disconnected'}{connection.email ? ' · ' + connection.email : ''}</p>
          <div className="ai-actions">
            {window.location.hostname === '127.0.0.1'
              ? <>
                  <button data-oai-siwc-button="" className="button primary" disabled={busy} onClick={() => connect()}>Continue with ChatGPT</button>
                  {connection.email && <button data-oai-siwc-button="" className="button secondary" disabled={busy} onClick={() => connect(true)}>Use a different account</button>}
                </>
              : <a href={loopbackUrl} className="button primary">Open 127.0.0.1 for ChatGPT sign-in</a>}
            {connection.connected && <button className="button secondary" disabled={busy} onClick={disconnect}>Disconnect</button>}
          </div>
        </>}
      <p><a href="https://chatgpt.com/settings/usage" target="_blank" rel="noreferrer">Manage ChatGPT usage ↗</a></p>
    </section>
    <HostedToolsSettings />
    {onImport && <section className="question-panel settings-panel" aria-labelledby="attempt-storage">
      <h2 id="attempt-storage">Attempt storage</h2>
      <p>Drafts and results are stored in MongoDB. If you used an older version in this browser, you can import that history.</p>
      <div className="ai-actions">
        <button className="button secondary" disabled={importing} onClick={importPrevious}>Import previous browser attempts</button>
        <span role="status">{importMessage}</span>
      </div>
    </section>}
  </>
}
