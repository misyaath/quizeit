import { execFile } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { createWriteStream, createReadStream } from 'node:fs'
import { link, lstat, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { Transform } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { promisify } from 'node:util'
import { GridFSBucket } from 'mongodb'
import { ApiError } from './openai.mjs'
import { validUuid } from './attempt-draft.mjs'
import { screenshotByteLimit, videoByteLimit, videoTypes } from '../src/exam-media.js'

const probe = promisify(execFile)

function limiter(req, limit) {
  if (Number(req.headers['content-length']) > limit) throw new ApiError(413, 'The media file is too large.')
  let size = 0
  return new Transform({
    transform(chunk, _encoding, done) {
      size += chunk.length
      if (size > limit) return done(new ApiError(413, 'The media file is too large.'))
      done(null, chunk)
    },
    flush(done) {
      done(size === 0 ? new ApiError(400, 'The media file is empty.') : undefined)
    },
  })
}

async function durationOf(path, type, maxSeconds) {
  try {
    const { stdout } = await probe('ffprobe', [
      '-v', 'error', '-protocol_whitelist', 'file,pipe', '-f', type === 'video/webm' ? 'matroska' : 'mov',
      '-select_streams', 'v:0', '-show_entries', 'packet=pts_time,duration_time', '-of', 'csv=p=0', path,
    ], { timeout: 12_000, maxBuffer: 2_000_000 })
    let duration = 0
    for (const line of stdout.trim().split('\n')) {
      const [pts, length] = line.split(',').map(Number)
      if (Number.isFinite(pts)) duration = Math.max(duration, pts + (Number.isFinite(length) ? length : 0))
    }
    if (!duration) throw new ApiError(422, 'The file does not contain playable video.')
    if (duration > maxSeconds + 0.5) throw new ApiError(422, 'The video exceeds the question’s recording limit.')
    return duration
  } catch (error) {
    if (error instanceof ApiError) throw error
    if (error.code === 'ENOENT') throw new ApiError(503, 'Install ffprobe (included in FFmpeg) on the app host to validate video uploads.')
    throw new ApiError(422, 'Use a playable WebM or MP4 video.')
  }
}

function readRange(header, size) {
  if (!header) return null
  const match = /^bytes=(\d*)-(\d*)$/.exec(header)
  if (!match || (!match[1] && !match[2])) return false
  const start = match[1] ? Number(match[1]) : Math.max(0, size - Number(match[2]))
  const end = match[1] && match[2] ? Math.min(size - 1, Number(match[2])) : size - 1
  return Number.isSafeInteger(start) && start <= end && start < size ? { start, end } : false
}

async function readImage(stream) {
  const chunks = []
  let size = 0
  for await (const chunk of stream) {
    size += chunk.length
    if (size > screenshotByteLimit) throw new ApiError(413, 'The image is too large.')
    chunks.push(chunk)
  }
  const image = Buffer.concat(chunks)
  if (size < 5 || image[0] !== 255 || image[1] !== 216 || image.at(-2) !== 255 || image.at(-1) !== 217) {
    throw new ApiError(422, 'The image is not a JPEG.')
  }
  return image
}

export function createAttemptMedia(db, dataDir = resolve('local-data')) {
  const bucket = new GridFSBucket(db, { bucketName: 'attempt_media' })
  const files = db.collection('attempt_media.files')
  const images = db.collection('exam_image_files')
  const imagesDir = resolve(process.env.QUIZEIT_EXAM_IMAGES_DIR || join(dataDir, 'exam-images'))
  const imagePath = id => join(imagesDir, id + '.jpg')

  async function storeImage(id, image, metadata, uploadDate = new Date()) {
    if (!validUuid(id)) throw new Error('The exam image ID is invalid.')
    const path = imagePath(id)
    const staged = path + '.' + randomUUID() + '.tmp'
    await mkdir(imagesDir, { recursive: true, mode: 0o700 })
    try {
      await writeFile(staged, image, { flag: 'wx', mode: 0o600, flush: true })
      await link(staged, path).catch(error => { if (error.code !== 'EEXIST') throw error })
    } finally {
      await rm(staged, { force: true })
    }
    if (!(await lstat(path)).isFile() || !(await readFile(path)).equals(image)) {
      throw new Error('The saved exam image failed verification.')
    }
    await images.updateOne({ _id: id }, { $setOnInsert: { path, length: image.length, metadata, uploadDate } }, { upsert: true })
    const entry = await images.findOne({ _id: id })
    if (entry?.path !== path || entry.length !== image.length
      || Object.entries(metadata).some(([key, value]) => entry.metadata?.[key] !== value)) {
      throw new Error('The saved exam image metadata failed verification.')
    }
  }

  async function migrateImages() {
    let migrated = 0
    let bytes = 0
    for await (const file of files.find({ 'metadata.kind': { $in: ['screenshot', 'webcam'] } })) {
      const image = await readImage(bucket.openDownloadStream(file._id))
      if (image.length !== file.length) throw new Error('The original exam image length changed during migration.')
      await storeImage(file._id, image, file.metadata, file.uploadDate)
      await bucket.delete(file._id)
      migrated++
      bytes += image.length
    }
    return { migrated, bytes }
  }

  async function upload(req, identity, maxSeconds) {
    const mime = req.headers['content-type']?.split(';', 1)[0]
    const video = identity.kind === 'video'
    if (video ? !videoTypes.includes(mime) : mime !== 'image/jpeg') {
      throw new ApiError(415, video ? 'Upload a WebM or MP4 video.' : 'Upload a JPEG image.')
    }
    const id = randomUUID()
    if (!video) {
      if (Number(req.headers['content-length']) > screenshotByteLimit) throw new ApiError(413, 'The image is too large.')
      await storeImage(id, await readImage(req), { ...identity, mime })
      return { id }
    }

    const dir = await mkdtemp(join(tmpdir(), 'quizeit-video-'))
    const path = join(dir, 'video')
    try {
      await pipeline(req, limiter(req, videoByteLimit), createWriteStream(path))
      const duration = await durationOf(path, mime, maxSeconds)
      await pipeline(createReadStream(path), bucket.openUploadStreamWithId(id, id, { metadata: { ...identity, mime } }))
      return { id, duration }
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  }

  async function send(req, res, file) {
    if (file.path) {
      const stat = file.path === imagePath(file._id) && await lstat(file.path).catch(error => {
        if (error.code === 'ENOENT') return null
        throw error
      })
      if (!stat || !stat.isFile() || stat.size !== file.length) throw new ApiError(404, 'Exam image not found.')
    }
    const range = readRange(req.headers.range, file.length)
    if (range === false) {
      res.writeHead(416, { 'Content-Range': 'bytes */' + file.length })
      return res.end()
    }
    res.writeHead(range ? 206 : 200, {
      'Content-Type': file.metadata.mime, 'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'private, no-store',
      'Accept-Ranges': 'bytes', 'Content-Length': range ? range.end - range.start + 1 : file.length,
      ...(range && { 'Content-Range': `bytes ${range.start}-${range.end}/${file.length}` }),
    })
    const stream = file.path ? createReadStream(file.path, range || undefined)
      : bucket.openDownloadStream(file._id, range ? { start: range.start, end: range.end + 1 } : {})
    await pipeline(stream, res)
  }

  async function find(id) {
    return (await images.findOne({ _id: id })) ?? files.findOne({ _id: id })
  }

  async function remove(id) {
    const image = await images.findOne({ _id: id })
    if (!image) return bucket.delete(id)
    if (image.path !== imagePath(id)) throw new Error('The exam image path is invalid.')
    await rm(image.path, { force: true })
    await images.deleteOne({ _id: id })
  }

  return { upload, send, find, remove, migrateImages }
}
