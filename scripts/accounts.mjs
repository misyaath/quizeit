import { createHash, randomBytes, randomUUID, scrypt, timingSafeEqual } from 'node:crypto'
import { promisify } from 'node:util'
import { createRemoteJWKSet, jwtVerify } from 'jose'
import { ApiError } from './openai.mjs'

const derive = promisify(scrypt)
const random = () => randomBytes(32).toString('base64url')
const digest = text => createHash('sha256').update(text).digest('hex')
const cookieName = 'quizeit_session'
const googleCookie = 'quizeit_google'
const sessionSeconds = 30 * 24 * 60 * 60
const googleSeconds = 600
const jwks = createRemoteJWKSet(new URL('https://www.googleapis.com/oauth2/v3/certs'))
const emailFor = value => typeof value === 'string' ? value.trim().toLowerCase() : ''
const nameFor = value => typeof value === 'string' ? value.trim().slice(0, 80) : ''
const publicUser = ({ _id, email, firstName, lastName, role, googleSub }) => ({
  id: _id, email, firstName, lastName, role, googleLinked: Boolean(googleSub),
})

function cookie(req, name, value, age) {
  return name + '=' + value + '; Path=/; HttpOnly; SameSite=Lax; Max-Age=' + age + (req.secure ? '; Secure' : '')
}

function fromCookie(req, name) {
  const value = req.headers.cookie?.split(';').map(part => part.trim()).find(part => part.startsWith(name + '='))?.slice(name.length + 1)
  return /^[\w-]{43}$/.test(value ?? '') ? value : ''
}

const validEmail = email => email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
const validPassword = password => typeof password === 'string' && password.length >= 12 && password.length <= 256
const key = (password, salt) => derive(password, salt, 64, { N: 32768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 })

export async function createAccounts(db, { googleClientId = process.env.GOOGLE_CLIENT_ID, googleClientSecret = process.env.GOOGLE_CLIENT_SECRET,
  fetchResponse = fetch, verifyGoogle = (token, audience, nonce) => jwtVerify(token, jwks, {
    issuer: ['https://accounts.google.com', 'accounts.google.com'], audience, requiredClaims: ['sub', 'exp', 'iat', 'nonce'],
  }).then(({ payload }) => {
    if (payload.nonce !== nonce) throw new Error('Invalid nonce')
    return payload
  }),
} = {}) {
  const users = db.collection('users')
  const sessions = db.collection('sessions')
  const googleFlows = db.collection('google_signin')
  await Promise.all([
    users.createIndex({ email: 1 }, { unique: true }),
    users.createIndex({ googleSub: 1 }, { unique: true, sparse: true }),
    users.createIndex({ legacyOwner: 1 }, { unique: true, partialFilterExpression: { legacyOwner: true } }),
    sessions.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }),
    googleFlows.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }),
  ])
  const googleEnabled = Boolean(googleClientId && googleClientSecret)

  // Bound expensive password verification on the loopback server.
  let windowStart = Date.now()
  let passwordRequests = 0
  let pendingPasswords = 0
  async function passwordWork(task) {
    if (Date.now() - windowStart >= 60_000) {
      windowStart = Date.now()
      passwordRequests = 0
    }
    if (passwordRequests >= 40 || pendingPasswords >= 4) throw new ApiError(429, 'Too many sign-in requests. Try again in a minute.')
    passwordRequests++
    pendingPasswords++
    try { return await task() } finally { pendingPasswords-- }
  }

  async function getUser(req) {
    const token = fromCookie(req, cookieName)
    if (!token) return null
    const session = await sessions.findOne({ _id: digest(token), expiresAt: { $gt: new Date() } })
    if (!session) return null
    const user = await users.findOne({ _id: session.userId }, { projection: { passwordHash: 0, passwordSalt: 0 } })
    return user && { ...user, legacyOwner: user.legacyOwner === true && user.role === 'admin' }
  }

  async function startSession(req, res, user) {
    const token = random()
    await sessions.insertOne({ _id: digest(token), userId: user._id, expiresAt: new Date(Date.now() + sessionSeconds * 1000) })
    const previous = fromCookie(req, cookieName)
    if (previous) await sessions.deleteOne({ _id: digest(previous) })
    res.append('Set-Cookie', cookie(req, cookieName, token, sessionSeconds))
    if (!user.legacyOwner || user.role !== 'admin') res.append('Set-Cookie', cookie(req, 'code-server-session', '', 0))
    return publicUser(user)
  }

  async function register(req, res, input) {
    const email = emailFor(input.email)
    const firstName = nameFor(input.firstName)
    const lastName = nameFor(input.lastName)
    if (!firstName || !lastName || !validEmail(email) || !validPassword(input.password)) {
      throw new ApiError(400, 'Enter your first and last name, a valid email, and a password of 12–256 characters.')
    }
    const passwordSalt = random()
    const passwordHash = (await passwordWork(() => key(input.password, passwordSalt))).toString('hex')
    const user = { _id: randomUUID(), email, firstName, lastName, passwordSalt, passwordHash, role: 'learner', createdAt: new Date() }
    try { await users.insertOne(user) } catch (error) {
      if (error.code === 11000) throw new ApiError(409, 'An account already uses this email. Sign in to continue.')
      throw error
    }
    return startSession(req, res, user)
  }

  async function login(req, res, input) {
    const email = emailFor(input.email)
    const failure = () => new ApiError(401, 'Email or password is incorrect.')
    if (!validEmail(email) || !validPassword(input.password)) throw failure()
    const user = await users.findOne({ email })
    const candidate = await passwordWork(() => key(input.password, user?.passwordSalt ?? 'quizeit-unused-account'))
    if (!user?.passwordHash || !timingSafeEqual(Buffer.from(user.passwordHash, 'hex'), candidate)) throw failure()
    return startSession(req, res, user)
  }

  async function logout(req, res) {
    const token = fromCookie(req, cookieName)
    if (token) await sessions.deleteOne({ _id: digest(token) })
    res.append('Set-Cookie', cookie(req, cookieName, '', 0))
    res.append('Set-Cookie', cookie(req, 'code-server-session', '', 0))
  }

  async function beginGoogle(req, res, redirectUri, user) {
    if (!googleEnabled) throw new ApiError(503, 'Google sign-in is unavailable. Configure the Google OAuth client in .env.')
    const state = random()
    const browser = random()
    const nonce = random()
    const verifier = random()
    // Replace abandoned flows from this browser when it starts again.
    const previous = fromCookie(req, googleCookie)
    if (previous) await googleFlows.deleteOne({ browserHash: digest(previous) })
    await googleFlows.insertOne({ _id: digest(state), browserHash: digest(browser), nonce, verifier,
      userId: user?._id ?? null, redirectUri, expiresAt: new Date(Date.now() + googleSeconds * 1000),
    })
    res.append('Set-Cookie', cookie(req, googleCookie, browser, googleSeconds))
    const url = new URL('https://accounts.google.com/o/oauth2/v2/auth')
    url.search = new URLSearchParams({
      client_id: googleClientId, redirect_uri: redirectUri, response_type: 'code', scope: 'openid email profile',
      state, nonce, code_challenge: createHash('sha256').update(verifier).digest('base64url'), code_challenge_method: 'S256',
    })
    return url.href
  }

  async function finishGoogle(req, res, url, currentUser) {
    const browser = fromCookie(req, googleCookie)
    const state = url.searchParams.get('state')
    res.append('Set-Cookie', cookie(req, googleCookie, '', 0))
    if (!googleEnabled || !browser || !/^[\w-]{43}$/.test(state ?? '')) return 'failed'
    const flow = await googleFlows.findOneAndDelete({ _id: digest(state), browserHash: digest(browser), expiresAt: { $gt: new Date() } })
    if (!flow || (flow.userId && flow.userId !== currentUser?._id)) return 'failed'
    if (url.searchParams.has('error')) return 'canceled'
    const code = url.searchParams.get('code')
    if (!code || code.length > 2048) return 'failed'
    try {
      const response = await fetchResponse('https://oauth2.googleapis.com/token', {
        method: 'POST', body: new URLSearchParams({
          client_id: googleClientId, client_secret: googleClientSecret, code, code_verifier: flow.verifier,
          redirect_uri: flow.redirectUri, grant_type: 'authorization_code',
        }), signal: AbortSignal.timeout(15_000),
      })
      if (!response.ok) return 'failed'
      const { id_token } = await response.json()
      const profile = await verifyGoogle(id_token, googleClientId, flow.nonce)
      const email = emailFor(profile.email)
      if (profile.email_verified !== true || !validEmail(email) || typeof profile.sub !== 'string' || !profile.sub) return 'failed'
      let user = await users.findOne({ googleSub: profile.sub })
      if (flow.userId) {
        if ((user && user._id !== flow.userId) || email !== currentUser.email) return 'email'
        user = await users.findOneAndUpdate({ _id: flow.userId, $or: [{ googleSub: { $exists: false } }, { googleSub: profile.sub }] },
          { $set: { googleSub: profile.sub } }, { returnDocument: 'after' })
        if (!user) return 'email'
      } else if (!user) {
        if (await users.findOne({ email })) return 'email'
        user = {
          _id: randomUUID(), email, googleSub: profile.sub, role: 'learner',
          firstName: nameFor(profile.given_name) || nameFor(profile.name) || email.split('@')[0].slice(0, 80),
          lastName: nameFor(profile.family_name), createdAt: new Date(),
        }
        await users.insertOne(user)
      }
      await startSession(req, res, user)
      return 'success'
    } catch (error) {
      if (error.code === 11000) return 'email'
      return 'failed'
    }
  }

  return { getUser, register, login, logout, beginGoogle, finishGoogle, googleEnabled, publicUser }
}
