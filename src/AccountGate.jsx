import React, { useEffect, useState } from 'react'
import App from './App.jsx'
import { localApi } from './local-api.js'

const outcomes = {
  email: 'An account already uses this email. Sign in with your password, then connect Google from Settings.',
  canceled: 'Google sign-in was canceled.',
  failed: 'Google sign-in could not be completed. Try again.',
}

export default function AccountGate() {
  const [account, setAccount] = useState(null)
  const [signup, setSignup] = useState(window.location.pathname === '/signup')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(() => outcomes[new URLSearchParams(window.location.search).get('google')] ?? '')
  const onAuthPath = () => ['/login', '/signup'].includes(window.location.pathname)
  function accept(next) {
    if (next.user && onAuthPath()) window.history.replaceState(null, '', error ? '/settings' : '/')
    if (next.user && new URLSearchParams(window.location.search).has('google')) {
      const url = new URL(window.location.href)
      url.searchParams.delete('google')
      window.history.replaceState(null, '', url)
    }
    setAccount(next)
  }
  async function load() {
    try { accept(await localApi('account')) }
    catch (failure) { setError(failure.message) }
  }
  useEffect(() => { void load() }, [])

  async function submit(event) {
    event.preventDefault()
    const form = Object.fromEntries(new FormData(event.currentTarget))
    setBusy(true)
    setError('')
    try {
      const { user } = await localApi('account/' + (signup ? 'signup' : 'login'), 'POST', form)
      accept({ ...account, user })
    } catch (failure) { setError(failure.message) }
    finally { setBusy(false) }
  }

  async function connectGoogle() {
    setBusy(true)
    setError('')
    try {
      const { url } = await localApi('account/google', 'POST', {})
      window.location.assign(url)
    } catch (failure) {
      setError(failure.message)
      setBusy(false)
    }
  }

  async function logout() {
    setBusy(true)
    setError('')
    try {
      await localApi('account', 'DELETE')
      window.history.replaceState(null, '', '/login')
      setSignup(false)
      setAccount({ ...account, user: null })
    } catch (failure) { setError(failure.message) }
    finally { setBusy(false) }
  }

  if (account?.user) return <App user={account.user} onLogout={logout} accountBusy={busy}
    googleEnabled={account.googleEnabled} connectGoogle={connectGoogle} accountError={error} />

  return <main className="account-page">
    <section className="account-panel" aria-labelledby="account-title">
      <div className="account-brand"><span className="brand-icon" aria-hidden="true">⌁</span> quizeit</div>
      <h1 id="account-title">{signup ? 'Create your account' : 'Sign in to quizeit'}</h1>
      {error && <p className="notice" role="alert">{error}</p>}
      {account ? <>
        <form className="account-form" onSubmit={submit} key={signup ? 'signup' : 'login'}>
          {signup && <div className="account-names">
            <label>First name<input name="firstName" autoComplete="given-name" maxLength={80} required /></label>
            <label>Last name<input name="lastName" autoComplete="family-name" maxLength={80} required /></label>
          </div>}
          <label>Email<input name="email" type="email" autoComplete="email" maxLength={254} required /></label>
          <label>Password<input name="password" type="password" autoComplete={signup ? 'new-password' : 'current-password'} minLength={12} maxLength={256} required /></label>
          {signup && <p className="muted">Use at least 12 characters.</p>}
          <button className="button primary" disabled={busy}>{signup ? 'Create account' : 'Sign in'}</button>
        </form>
        {account.googleEnabled && <button className="button secondary" disabled={busy} onClick={connectGoogle}>Continue with Google</button>}
        <button type="button" className="text-button" disabled={busy} onClick={() => {
          if (onAuthPath() || window.location.pathname === '/') window.history.replaceState(null, '', signup ? '/login' : '/signup')
          setSignup(!signup)
          setError('')
        }}>{signup ? 'Already have an account? Sign in' : 'Create an account'}</button>
      </> : error ? <button className="button secondary" onClick={load}>Retry</button> : <p role="status">Checking your session…</p>}
    </section>
  </main>
}
