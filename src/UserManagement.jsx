import React, { useEffect, useState } from 'react'
import { localApi } from './local-api.js'

const roles = { admin: 'Administrator', learner: 'Learner' }
const initialForm = { firstName: '', lastName: '', email: '', role: 'learner', password: '' }

export default function UserManagement({ user, onAccountUpdated }) {
  const [directory, setDirectory] = useState(null)
  const [query, setQuery] = useState('')
  const [form, setForm] = useState(null)
  const [confirm, setConfirm] = useState(null)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  async function load() {
    try { setDirectory(await localApi('users')) }
    catch (failure) { setError(failure.message) }
  }

  useEffect(() => { void load() }, [])

  function edit(account) {
    setForm(account ? { ...account, originalEmail: account.email, allowBlankLastName: account.googleLinked && !account.lastName, password: '' } : { ...initialForm })
    setConfirm(null)
    setError('')
    setMessage('')
  }

  async function save(event) {
    event.preventDefault()
    setBusy(true)
    setError('')
    setMessage('')
    const { id, firstName, lastName, email, role, password } = form
    try {
      const result = await localApi(id ? 'users/' + id : 'users', id ? 'PUT' : 'POST', { firstName, lastName, email, role, password })
      if (result.signInAgain) {
        window.location.assign('/login')
        return
      }
      if (result.user.id === user.id) onAccountUpdated(result.user)
      setForm(null)
      setMessage(id ? 'User updated.' : 'User created.')
      await load()
    } catch (failure) { setError(failure.message) }
    finally { setBusy(false) }
  }

  async function changeStatus(account, activate) {
    setBusy(true)
    setError('')
    setMessage('')
    try {
      await localApi('users/' + account.id + (activate ? '/restore' : ''), activate ? 'POST' : 'DELETE')
      setConfirm(null)
      setMessage(activate ? 'User restored.' : 'User deactivated.')
      await load()
    } catch (failure) { setError(failure.message) }
    finally { setBusy(false) }
  }

  const users = directory?.users.filter(account =>
    [account.firstName, account.lastName, account.email, roles[account.role], account.owner ? 'owner' : '',
      account.active ? 'active' : 'deactivated'].join(' ').toLowerCase().includes(query.trim().toLowerCase()),
  )

  return <section aria-labelledby="users-heading">
    <header className="section-heading">
      <div><h1 id="users-heading">Users</h1><p>Manage accounts, roles, and access to quizeit.</p></div>
      <button className="button primary" disabled={!directory || busy} onClick={() => edit()}>New user</button>
    </header>
    {error && <p className="notice" role="alert">{error}</p>}
    {message && <p className="notice" role="status">{message}</p>}
    {!directory && (error ? <button className="button secondary" onClick={load}>Retry</button> : <p role="status">Loading users…</p>)}

    {form && <form className="question-panel author-form" onSubmit={save}>
      <h2>{form.id ? 'Edit user' : 'Create user'}</h2>
      <div className="author-pair">
        <label className="editor-field">First name<input required maxLength={80} value={form.firstName}
          onChange={event => setForm({ ...form, firstName: event.target.value })} /></label>
        <label className="editor-field">Last name<input required={!form.allowBlankLastName} maxLength={80} value={form.lastName}
          onChange={event => setForm({ ...form, lastName: event.target.value })} /></label>
      </div>
      <label className="editor-field">Email<input type="email" required maxLength={254} value={form.email}
        onChange={event => setForm({ ...form, email: event.target.value })} /></label>
      {form.googleLinked && form.email.trim().toLowerCase() !== form.originalEmail && <p className="muted">Changing this email unlinks Google sign-in.</p>}
      <label className="editor-field">Role<select value={form.role} disabled={Boolean(form.owner)} onChange={event => setForm({ ...form, role: event.target.value })}>
        {directory.assignableRoles.map(role => <option value={role} key={role}>{roles[role]}</option>)}
      </select></label>
      <label className="editor-field">{form.id ? 'New password (optional)' : 'Password'}<input type="password"
        required={!form.id} minLength={12} maxLength={256} autoComplete="new-password" value={form.password}
        onChange={event => setForm({ ...form, password: event.target.value })} /></label>
      <div className="ai-actions">
        <button className="button primary" disabled={busy}>{form.id ? 'Save user' : 'Create user'}</button>
        <button className="button secondary" type="button" disabled={busy} onClick={() => setForm(null)}>Cancel</button>
      </div>
    </form>}

    {confirm && <section className="notice" aria-labelledby="user-removal">
      <h2 id="user-removal">Deactivate {confirm.firstName} {confirm.lastName}?</h2>
      <p>This signs the user out and blocks access. Their question sets and attempt history stay available if you restore the account.</p>
      <div className="ai-actions">
        <button className="button primary" disabled={busy} onClick={() => changeStatus(confirm, false)}>Confirm deactivation</button>
        <button className="button secondary" disabled={busy} onClick={() => setConfirm(null)}>Cancel</button>
      </div>
    </section>}

    {directory && <section className="dashboard-section">
      <label className="filter-label user-search">Search users<input type="search" value={query} onChange={event => setQuery(event.target.value)} /></label>
      <div className="activity-table">
        <table className="users-table" aria-label="User accounts">
          <thead><tr><th scope="col">Name</th><th scope="col">Email</th><th scope="col">Role</th><th scope="col">Status</th><th scope="col">Actions</th></tr></thead>
          <tbody>{users.map(account => <tr key={account.id}>
            <th scope="row">{account.firstName} {account.lastName}</th>
            <td>{account.email}</td>
            <td>{roles[account.role]}{account.owner ? ' · Owner' : ''}</td>
            <td>{account.active ? 'Active' : 'Deactivated'}</td>
            <td><div className="ai-actions">
              {account.editable && <button className="button small secondary" disabled={busy} onClick={() => edit(account)}>Edit</button>}
              {account.editable && !account.owner && account.id !== user.id && (account.active
                ? <button className="button small secondary" disabled={busy} onClick={() => { setForm(null); setConfirm(account) }}>Deactivate</button>
                : <button className="button small secondary" disabled={busy} onClick={() => changeStatus(account, true)}>Restore</button>)}
            </div></td>
          </tr>)}</tbody>
        </table>
      </div>
      {!users.length && <p className="notice">No users match your search.</p>}
    </section>}
  </section>
}
