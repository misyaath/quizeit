import { createHash, randomBytes, randomInt, randomUUID } from 'node:crypto'
import { isIP } from 'node:net'
import { mongoStore } from './mongo-store.mjs'
import { ApiError } from './openai.mjs'
import { currentUser } from './request-user.mjs'
import { validUuid } from './attempt-draft.mjs'
import { defaultWebcamPhotoSeconds, maxWebcamPhotoSeconds, minWebcamPhotoSeconds } from '../src/exam-media.js'
import { questionLimitFields, questionTimeField } from '../src/execution-settings.js'

const dayMs = 86_400_000
const tokenPattern = /^[A-Za-z0-9_-]{43}$/
const makeToken = () => randomBytes(32).toString('base64url')
const hash = value => createHash('sha256').update(value).digest('hex')
const emailFor = value => typeof value === 'string' ? value.trim().toLowerCase() : ''
const cleanText = (value, max) => typeof value === 'string' ? value.trim().slice(0, max) : ''
const integerIn = (value, min, max) => Number.isInteger(value) && value >= min && value <= max

export function requireExamAdmin() {
  if (currentUser()?.role !== 'admin') throw new ApiError(403, 'Only administrators can manage real exams.')
}

export function groupExamSources(sets) {
  const sources = new Map()
  for (const set of sets) {
    if (!sources.has(set.sourceId)) sources.set(set.sourceId, { id: set.sourceId, title: set.title, questions: [] })
    sources.get(set.sourceId).questions.push(...set.questions.map(question => {
      const applicable = question.type === 'coding' ? questionLimitFields : [questionTimeField]
      const inherited = Object.fromEntries(applicable.filter(field => set.limits?.[field.name] !== undefined)
        .map(field => [field.name, set.limits[field.name]]))
      return { ...question, difficulty: question.difficulty ?? set.difficulty ?? 5, limits: { ...inherited, ...question.limits } }
    }))
  }
  return [...sources.values()]
}

function shuffle(items) {
  const result = [...items]
  for (let i = result.length - 1; i > 0; i--) {
    const index = randomInt(i + 1)
    const item = result[i]
    result[i] = result[index]
    result[index] = item
  }
  return result
}

function publicTemplate({ id, title, examMinutes, webcamPhotoSeconds, pools }) {
  return { id, title, examMinutes, webcamPhotoSeconds, sources: pools.map(({ sourceId, title, count, minimumDifficulty }) => ({
    sourceId, title, count, minimumDifficulty,
  })), questionCount: pools.reduce((total, pool) => total + pool.count, 0) }
}

function browserLocation(value) {
  if (!value || !Number.isFinite(value.latitude) || Math.abs(value.latitude) > 90
    || !Number.isFinite(value.longitude) || Math.abs(value.longitude) > 180) return null
  return { latitude: Math.round(value.latitude * 100) / 100, longitude: Math.round(value.longitude * 100) / 100,
    ...(Number.isFinite(value.accuracy) && value.accuracy >= 0 && { accuracyMeters: Math.round(value.accuracy) }) }
}

function configuredOrigin(value) {
  if (!value) return null
  const url = new URL(value)
  const local = ['localhost', '127.0.0.1'].includes(url.hostname)
  if (url.username || url.password || url.pathname !== '/' || url.search || url.hash
    || (url.protocol !== 'https:' && !(local && url.protocol === 'http:'))) {
    throw new Error('QUIZEIT_PUBLIC_URL must be an HTTPS origin without a path.')
  }
  return url
}

export async function createRealExams(db, {
  publicUrl = process.env.QUIZEIT_PUBLIC_URL, mailKey = process.env.QUIZEIT_RESEND_API_KEY,
  mailFrom = process.env.QUIZEIT_EXAM_FROM, sendRequest = fetch, now = () => new Date(),
} = {}) {
  const publicOrigin = configuredOrigin(publicUrl)
  const mailEnabled = Boolean(publicOrigin?.protocol === 'https:' && mailKey && mailFrom)
  const templates = mongoStore(db, 'real_exam_templates')
  const invitations = db.collection('exam_invitations')
  await Promise.all([
    templates.initialize(() => []),
    invitations.createIndex({ tokenHash: 1 }, { unique: true }),
    invitations.createIndex({ examId: 1, createdAt: -1 }),
  ])

  async function findExam(id) {
    const exam = (await templates.read()).find(item => item.id === id)
    if (!exam) throw new ApiError(404, 'Real exam not found.')
    return exam
  }

  async function list() {
    return { exams: (await templates.read()).map(publicTemplate), mailEnabled }
  }

  async function create(input, sources) {
    const title = cleanText(input.title, 160)
    const { examMinutes = 0, webcamPhotoSeconds = defaultWebcamPhotoSeconds } = input
    if (!title || !integerIn(examMinutes, 0, 600) || !integerIn(webcamPhotoSeconds, minWebcamPhotoSeconds, maxWebcamPhotoSeconds)
      || !Array.isArray(input.sources) || input.sources.length < 1 || input.sources.length > 60) {
      throw new ApiError(400, 'Enter a title, valid timings, and at least one exam question set.')
    }
    const used = new Set()
    const pools = input.sources.map(row => {
      const source = sources.find(item => item.id === row?.sourceId)
      if (!source || used.has(source.id) || !integerIn(row.count, 1, 60) || !integerIn(row.minimumDifficulty, 1, 10)) {
        throw new ApiError(400, 'Select each exam source once and enter a valid question count and minimum difficulty.')
      }
      used.add(source.id)
      const questions = source.questions.filter(question => question.difficulty >= row.minimumDifficulty)
      if (questions.length < row.count) throw new ApiError(400, source.title + ' has only ' + questions.length + ' eligible questions.')
      return { sourceId: source.id, title: source.title, count: row.count, minimumDifficulty: row.minimumDifficulty, questions }
    })
    if (pools.reduce((total, pool) => total + pool.count, 0) > 60) throw new ApiError(400, 'An exam can contain at most 60 questions.')
    const exam = { id: randomUUID(), title, examMinutes, webcamPhotoSeconds, pools }
    await templates.update(current => [exam, ...current])
    return publicTemplate(exam)
  }

  async function invite(id, input, requestOrigin) {
    const exam = await findExam(id)
    const email = emailFor(input.email)
    if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !integerIn(input.days, 1, 365)) {
      throw new ApiError(400, 'Enter a candidate email and an expiry between 1 and 365 days.')
    }
    if (input.send && !mailEnabled) throw new ApiError(503, 'Configure an HTTPS public URL and email delivery before sending invitations.')
    const token = makeToken()
    const invitationId = randomUUID()
    const createdAt = now()
    const expiresAt = new Date(createdAt.getTime() + input.days * dayMs)
    const questionIds = shuffle(exam.pools.flatMap(pool => shuffle(pool.questions).slice(0, pool.count).map(question => question.id)))
    const link = new URL('/exam-invite/' + token, publicOrigin ?? requestOrigin).href
    await invitations.insertOne({ _id: invitationId, examId: exam.id, email, tokenHash: hash(token), questionIds, createdAt, expiresAt })
    let delivery = 'link'
    if (input.send) {
      const response = await sendRequest('https://api.resend.com/emails', {
        method: 'POST', signal: AbortSignal.timeout(12_000),
        headers: { Authorization: 'Bearer ' + mailKey, 'Content-Type': 'application/json', 'Idempotency-Key': 'quiz-invite-' + invitationId },
        body: JSON.stringify({ from: mailFrom, to: [email], subject: 'Your Quizeit exam invitation',
          text: 'You have been invited to ' + exam.title + '. Open your personal link before ' + expiresAt.toISOString() + ':\n\n' + link }),
      }).catch(() => null)
      delivery = response?.ok ? 'sent' : 'failed'
      await invitations.updateOne({ _id: invitationId }, { $set: { delivery } })
    }
    return { link, expiresAt, delivery }
  }

  const unclaimed = token => ({ tokenHash: hash(token), expiresAt: { $gt: now() }, startedAt: { $exists: false } })
  const unavailable = () => new ApiError(404, 'This exam invitation has expired or has already been used.')
  async function inspect(token) {
    const invite = tokenPattern.test(token) && await invitations.findOne(unclaimed(token))
    if (!invite) throw unavailable()
    return { title: (await findExam(invite.examId)).title, expiresAt: invite.expiresAt }
  }

  async function claim(token, input, req, res) {
    if (!tokenPattern.test(token)) throw unavailable()
    const email = emailFor(input.email)
    const firstName = cleanText(input.firstName, 80)
    const lastName = cleanText(input.lastName, 80)
    if (!firstName || !lastName || !email) throw new ApiError(400, 'Enter your name and invited email address.')
    const invite = await invitations.findOne(unclaimed(token))
    if (!invite) throw unavailable()
    if (invite.email !== email) throw new ApiError(403, 'Use the email address that received this invitation.')
    const session = makeToken()
    const startedAt = now()
    const clientIp = req.ip?.replace(/^::ffff:/, '')
    const claimed = await invitations.findOneAndUpdate(unclaimed(token), { $set: {
      firstName, lastName, startedAt, sessionHash: hash(session), sessionExpiresAt: new Date(startedAt.getTime() + dayMs),
      verification: { ip: isIP(clientIp ?? '') ? clientIp : null, location: browserLocation(input.location),
        userAgent: cleanText(req.headers['user-agent'], 300) },
    } }, { returnDocument: 'after' })
    if (!claimed) throw unavailable()
    const setId = 'exam-' + claimed._id
    res.append('Set-Cookie', 'quizeit_candidate=' + session + '; Path=/api/candidate/' + setId
      + '/; HttpOnly; SameSite=Strict; Max-Age=86400' + (req.quizOrigin.startsWith('https:') ? '; Secure' : ''))
    return { path: '/candidate/' + setId }
  }

  async function getCandidate(req, setId) {
    const id = setId.slice(5)
    const token = req.headers.cookie?.split(';').map(part => part.trim())
      .find(part => part.startsWith('quizeit_candidate='))?.slice('quizeit_candidate='.length)
    if (!validUuid(id) || !tokenPattern.test(token ?? '')) return null
    const invite = await invitations.findOne({ _id: id, sessionHash: hash(token), sessionExpiresAt: { $gt: now() } })
    if (!invite) return null
    return { _id: id, role: 'candidate', setId, examId: invite.examId, questionIds: invite.questionIds }
  }

  async function assignedSet(candidate) {
    const exam = await findExam(candidate.examId)
    const questions = new Map(exam.pools.flatMap(pool => pool.questions.map(question => [question.id, question])))
    return { id: candidate.setId, title: exam.title, mode: 'exam', webcamPhotoSeconds: exam.webcamPhotoSeconds,
      limits: { examMinutes: exam.examMinutes }, questions: candidate.questionIds.map(id => questions.get(id)) }
  }

  const reviewFields = { firstName: 1, lastName: 1, email: 1 }
  const reviewCandidates = () => invitations.find({ startedAt: { $exists: true } }, { projection: reviewFields }).toArray()
  const reviewCandidate = id => invitations.findOne({ _id: id, startedAt: { $exists: true } }, { projection: reviewFields })
  const listInvitations = id => invitations.find({ examId: id }, {
    projection: { email: 1, startedAt: 1, expiresAt: 1, firstName: 1, lastName: 1, verification: 1, delivery: 1 },
  }).sort({ createdAt: -1 }).toArray()

  return { publicOrigin, list, create, invite, inspect, claim, getCandidate, assignedSet, reviewCandidates, reviewCandidate, listInvitations }
}
