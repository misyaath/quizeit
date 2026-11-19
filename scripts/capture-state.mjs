import { captureGraceMs, screenshotIntervalMs } from '../src/exam-media.js'
import { ApiError } from './openai.mjs'

const maxScreenshots = 1600
const maxWebcamPhotos = 3600

export function captureIsActive(activity, now = Date.now()) {
  const capture = activity?.capture
  return Boolean(capture?.active && now - capture.lastAt <= screenshotIntervalMs + captureGraceMs)
}

export function requireExamCapture(draft, questionId) {
  if (draft?.setSnapshot?.mode !== 'exam') return
  const capture = draft.activity?.capture
  if (!captureIsActive(draft.activity) || (questionId && capture.questionId !== questionId)) {
    throw new ApiError(409, 'Share the exam to continue.', 'exam_capture_required')
  }
  const question = draft.setSnapshot.questions.find(item => item.id === capture.questionId)
  const interval = draft.setSnapshot.webcamPhotoSeconds
  if (interval && question?.type !== 'video' &&
    (capture.webcam?.questionId !== capture.questionId || Date.now() - capture.webcam.at > interval * 1000 + captureGraceMs)) {
    throw new ApiError(409, 'Enable the webcam to continue.', 'exam_webcam_required')
  }
}

export function endCapture(activity, sessionId, now = Date.now()) {
  const capture = activity?.capture
  if (!capture || !capture.active || capture.sessionId !== sessionId) return activity
  const clock = activity.clock && { ...activity.clock, lastAt: null }
  return { ...activity, clock, capture: {
    ...capture, active: false, events: [...capture.events, { type: 'stopped', at: now }],
  } }
}

export function checkFrame(draft, identity, now = Date.now()) {
  const capture = draft.activity?.capture
  if (draft.setSnapshot?.mode !== 'exam') throw new ApiError(403, 'Screenshots are available for exam attempts.')
  if (!draft.setSnapshot.questions.some(question => question.id === identity.questionId)) {
    throw new ApiError(409, 'Open this question before capturing it.')
  }
  if ((capture?.screenshots.length ?? 0) >= maxScreenshots) throw new ApiError(409, 'This exam has reached its screenshot limit.')
  if (identity.reason === 'start') return
  if (!captureIsActive(draft.activity, now) || capture.sessionId !== identity.sessionId) {
    throw new ApiError(409, 'Share the exam again.', 'exam_capture_required')
  }
  if (capture.questionId === identity.questionId && now - capture.lastAt < screenshotIntervalMs - 1500) {
    throw new ApiError(429, 'A screenshot was already captured for this question.')
  }
}

export function addFrame(draft, identity, id, now = Date.now()) {
  checkFrame(draft, identity, now)
  const previous = draft.activity.capture
  const events = [...previous?.events ?? []]
  if (identity.reason === 'start') {
    if (previous?.active) events.push({ type: 'interrupted', at: previous.lastAt })
    events.push({ type: 'started', at: now })
  }
  return { ...draft, activity: {
    ...draft.activity,
    capture: { ...previous, sessionId: identity.sessionId, active: true, lastAt: now, questionId: identity.questionId, events,
      ...(identity.reason === 'start' || previous.questionId !== identity.questionId ? { webcam: null } : {}),
      screenshots: [...previous?.screenshots ?? [], { id, at: now, questionId: identity.questionId,
        recording: identity.recording, surface: identity.surface }],
    },
  } }
}

export function checkWebcamFrame(draft, { sessionId, questionId }, now = Date.now()) {
  const set = draft.setSnapshot
  const question = set?.questions.find(item => item.id === questionId)
  const interval = set?.webcamPhotoSeconds
  if (set?.mode !== 'exam' || !interval || !question || question.type === 'video') {
    throw new ApiError(403, 'Webcam photos are available for non-video exam questions.')
  }
  const capture = draft.activity?.capture
  if (!captureIsActive(draft.activity, now) || capture.sessionId !== sessionId || capture.questionId !== questionId) {
    throw new ApiError(409, 'Share the exam before taking webcam photos.', 'exam_capture_required')
  }
  if ((capture.webcamPhotos?.length ?? 0) >= maxWebcamPhotos) throw new ApiError(409, 'This exam has reached its webcam photo limit.')
  if (capture.webcam?.questionId === questionId && now - capture.webcam.at < interval * 1000 - 1500) {
    throw new ApiError(429, 'A webcam photo was already captured for this question.')
  }
}

export function addWebcamFrame(draft, identity, id, now = Date.now()) {
  checkWebcamFrame(draft, identity, now)
  const capture = draft.activity.capture
  const frame = { id, at: now, questionId: identity.questionId }
  return { ...draft, activity: { ...draft.activity, capture: {
    ...capture, webcam: { at: frame.at, questionId: frame.questionId },
    webcamPhotos: [...capture.webcamPhotos ?? [], frame],
  } } }
}

export function finishCapture(activity, now) {
  const capture = activity?.capture
  return capture?.active ? { ...activity, capture: {
    ...capture, active: false, events: [...capture.events, { type: 'finished', at: now }],
  } } : activity
}
