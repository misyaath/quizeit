import { execFile } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { createWriteStream, createReadStream } from 'node:fs'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Transform } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { promisify } from 'node:util'
import { GridFSBucket } from 'mongodb'
import { ApiError } from './openai.mjs'
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

export function createAttemptMedia(db) {
  const bucket = new GridFSBucket(db, { bucketName: 'attempt_media' })
  const files = db.collection('attempt_media.files')
  async function upload(req, identity, maxSeconds) {
    const mime = req.headers['content-type']?.split(';', 1)[0]
    const video = identity.kind === 'video'
    if (video ? !videoTypes.includes(mime) : mime !== 'image/jpeg') {
      throw new ApiError(415, video ? 'Upload a WebM or MP4 video.' : 'Upload a JPEG image.')
    }
    const id = randomUUID()
    if (!video) {
      const sizeCheck = limiter(req, screenshotByteLimit)
      // Collect one bounded JPEG and verify the container before exposing it to playback.
      const chunks = []
      let size = 0
      for await (const chunk of req) {
        size += chunk.length
        if (size > screenshotByteLimit) throw new ApiError(413, 'The image is too large.')
        chunks.push(chunk)
      }
      const image = Buffer.concat(chunks)
      if (size < 5 || image[0] !== 255 || image[1] !== 216 || image.at(-2) !== 255 || image.at(-1) !== 217) {
        throw new ApiError(422, 'The image is not a JPEG.')
      }
      await pipeline([image], sizeCheck, bucket.openUploadStreamWithId(id, id, { metadata: { ...identity, mime } }))
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
    await pipeline(bucket.openDownloadStream(file._id, range ? { start: range.start, end: range.end + 1 } : {}), res)
  }

  return { upload, send, find: id => files.findOne({ _id: id }), remove: id => bucket.delete(id) }
}
