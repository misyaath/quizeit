import { apiUrl } from './local-api.js'

export const screenshotIntervalMs = 30_000
export const captureGraceMs = 15_000
export const minWebcamPhotoSeconds = 5
export const maxWebcamPhotoSeconds = 300
export const defaultWebcamPhotoSeconds = 30
export const maxVideoSeconds = 300
export const defaultVideoSeconds = 120
export const videoByteLimit = 64 * 1024 * 1024
export const screenshotByteLimit = 512 * 1024
export const videoTypes = ['video/webm', 'video/mp4']
export const mediaUrl = id => apiUrl('attempt-media/files/' + id)

