import { createHash, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto'
import { createLocalJWKSet, jwtVerify } from 'jose'
import { ApiError } from './openai.mjs'

const issuer = 'https://auth.openai.com'
const resource = 'https://api.openai.com/v1'
const permission = 'chatgpt.tokens.use.direct'
const scopes = 'openid profile email offline_access resource.invoke ' + permission
export const callbackPath = '/auth/chatgpt/callback'
const cookieName = 'study_lab_chatgpt'
const lifetime = 10 * 60 * 1000
const random = () => randomBytes(32).toString('base64url')
const expired = () => new ApiError(401, 'Reconnect your ChatGPT account in Settings.')
const hasPermission = granted => typeof granted === 'string'
  && [permission, 'resource.invoke'].every(scope => granted.split(/\s+/).includes(scope))

function sameSecret(expected, actual) {
  return typeof actual === 'string' && actual.length === expected.length
    && Buffer.byteLength(actual) === expected.length && timingSafeEqual(Buffer.from(expected), Buffer.from(actual))
}

export function createChatGPTAuth(store, fetchResponse) {
  let pending
  let refreshing
  let revision = 0

  async function remote(url, options = {}) {
    try {
      return await fetchResponse(url, { ...options, redirect: 'error', signal: AbortSignal.timeout(20_000) })
    } catch {
      throw new ApiError(502, 'Could not reach OpenAI sign-in. Try again.')
    }
  }

  async function readRemote(response) {
    return await response.json().catch(() => ({}))
  }

  function status({ account }) {
    return { connected: Boolean(account?.accessToken), email: account?.email ?? null }
  }

  async function begin(port, useDifferentAccount) {
    let saved = await store.read()
    if (!saved.hostId) saved = await store.update(current => ({ ...current, hostId: current.hostId ?? 'urn:uuid:' + randomUUID() }))
    const account = useDifferentAccount ? null : saved.account
    const state = random()
    const browser = random()
    const nonce = random()
    const verifier = random()
    const redirect = 'http://127.0.0.1:' + port + callbackPath
    pending = { state, browser, nonce, verifier, redirect, account, revision: ++revision, expires: Date.now() + lifetime }
    const url = new URL('/api/accounts/authorize', issuer)
    url.search = new URLSearchParams({
      client_id: account?.clientId ?? 'dynamic_agent_client',
      ...(account ? {} : { agent_name_hint: 'quizeit' }),
      ...(account?.needsPermission ? { prompt: 'consent' } : {}),
      ...(account?.idToken ? { id_token_hint: account.idToken } : account?.email ? { login_hint: account.email } : {}),
      ext_agent_host_id: saved.hostId, response_type: 'code', redirect_uri: redirect,
      scope: scopes, resource, state, nonce,
      code_challenge_method: 'S256',
      code_challenge: createHash('sha256').update(verifier).digest('base64url'),
    }).toString()
    return {
      url: url.href,
      cookie: `${cookieName}=${browser}; Path=${callbackPath}; HttpOnly; SameSite=Lax; Max-Age=${lifetime / 1000}`,
    }
  }

  async function exchange(parameters) {
    const response = await remote(issuer + '/api/accounts/oauth/token', {
      method: 'POST', body: new URLSearchParams({ ...parameters, resource }),
    })
    const data = await readRemote(response)
    if (!response.ok) {
      const error = new ApiError([400, 401].includes(response.status) ? 401 : 502, 'OpenAI could not authorize this session. Start sign-in again.')
      error.code = typeof data.error === 'string' ? data.error : data.error?.code
      throw error
    }
    return data
  }

  function credentials(tokens, previous) {
    const granted = tokens.scope ?? previous?.scope
    if (!hasPermission(granted)) throw new ApiError(403, 'This account did not grant ChatGPT plan access.')
    if (typeof tokens.access_token !== 'string' || !tokens.access_token
      || typeof tokens.refresh_token !== 'string' || !tokens.refresh_token
      || !Number.isFinite(tokens.expires_in) || tokens.expires_in <= 0) {
      throw new ApiError(502, 'OpenAI returned incomplete sign-in credentials.')
    }
    return {
      accessToken: tokens.access_token, refreshToken: tokens.refresh_token,
      expiresAt: Date.now() + tokens.expires_in * 1000, scope: granted,
    }
  }

  async function callback(params, cookies) {
    const transaction = pending
    const browser = cookies?.match(new RegExp('(?:^|; *)' + cookieName + '=([^;]+)'))?.[1]
    if (!transaction || transaction.expires < Date.now() || !sameSecret(transaction.state, params.get('state'))
      || !sameSecret(transaction.browser, browser)) return 'invalid'
    pending = undefined
    if (params.has('error')) return params.get('error') === 'access_denied' ? 'denied' : 'failed'
    const clientId = params.get('client_id') ?? transaction.account?.clientId
    if (!params.get('code') || !/^oaiapp_[\w-]+$/.test(clientId ?? '')
      || (transaction.account && clientId !== transaction.account.clientId)) return 'invalid'

    try {
      const tokens = await exchange({
        grant_type: 'authorization_code', client_id: clientId, code: params.get('code'),
        redirect_uri: transaction.redirect, code_verifier: transaction.verifier,
      })
      const jwks = await remote(issuer + '/.well-known/jwks.json')
      if (!jwks.ok) return 'failed'
      const { payload } = await jwtVerify(tokens.id_token, createLocalJWKSet(await readRemote(jwks)), {
        issuer, audience: clientId, requiredClaims: ['sub', 'iat', 'exp'], clockTolerance: 5,
      })
      if (!payload.sub || payload.nonce !== transaction.nonce
        || (Array.isArray(payload.aud) && payload.aud.length > 1 && payload.azp !== clientId)
        || (transaction.account && transaction.account.subject !== payload.sub)) return 'invalid'
      const identity = {
        clientId, subject: payload.sub, email: typeof payload.email === 'string' ? payload.email : null,
        idToken: tokens.id_token,
      }
      const allowed = hasPermission(tokens.scope)
      const account = allowed ? { ...identity, ...credentials(tokens) } : { ...identity, needsPermission: true }
      const saved = await store.update(current => {
        if (revision !== transaction.revision) return current
        if (!allowed && current.account?.accessToken) return current
        return { ...current, account }
      })
      if (revision !== transaction.revision) return 'invalid'
      return allowed && saved.account?.accessToken === account.accessToken ? 'connected' : 'permission'
    } catch (error) {
      return error instanceof ApiError && error.status === 403 ? 'permission' : 'failed'
    }
  }

  async function accessToken(rejectedToken) {
    const { account } = await store.read()
    if (!account?.refreshToken || !hasPermission(account.scope)) throw expired()
    if (account.accessToken !== rejectedToken && account.expiresAt > Date.now() + 30_000) return account.accessToken
    if (!refreshing) {
      refreshing = store.update(async current => {
        const existing = current.account
        if (!existing?.refreshToken) throw expired()
        if (existing.accessToken !== rejectedToken && existing.expiresAt > Date.now() + 30_000) return current
        try {
          const tokens = await exchange({
            grant_type: 'refresh_token', client_id: existing.clientId, refresh_token: existing.refreshToken,
          })
          return { ...current, account: { ...existing, ...credentials(tokens, existing) } }
        } catch (error) {
          if (!['invalid_grant', 'invalid_refresh_token', 'token_expired', 'refresh_token_expired', 'refresh_token_invalidated', 'refresh_token_reused'].includes(error.code) && error.status !== 403) throw error
          const { clientId, subject, email, idToken } = existing
          return { ...current, account: { clientId, subject, email, idToken, needsPermission: error.status === 403 } }
        }
      }).finally(() => { refreshing = undefined })
    }
    const refreshed = (await refreshing).account?.accessToken
    if (!refreshed) throw expired()
    return refreshed
  }

  async function disconnect() {
    revision++
    pending = undefined
    let revoked = true
    const saved = await store.update(async current => {
      const account = current.account
      if (!account) return current
      try {
        if (!account.refreshToken) return { ...current, account: { clientId: account.clientId, subject: account.subject, email: account.email } }
        const discovery = await remote(issuer + '/.well-known/openid-configuration')
        const data = await readRemote(discovery)
        const endpoint = new URL(data.revocation_endpoint)
        if (!discovery.ok || data.issuer !== issuer || endpoint.origin !== issuer) throw new Error()
        const response = await remote(endpoint.href, {
          method: 'POST', body: new URLSearchParams({
            token: account.refreshToken, token_type_hint: 'refresh_token', client_id: account.clientId,
          }),
        })
        revoked = response.ok
      } catch {
        revoked = false
      }
      return { ...current, account: { clientId: account.clientId, subject: account.subject, email: account.email } }
    })
    return { ...status(saved), revoked }
  }

  return {
    begin, callback, accessToken, disconnect,
    status: async () => status(await store.read()),
    clearCookie: `${cookieName}=; Path=${callbackPath}; HttpOnly; SameSite=Lax; Max-Age=0`,
  }
}
