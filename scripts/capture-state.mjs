import { captureGraceMs, screenshotIntervalMs } from '../src/exam-media.js'
import { ApiError } from './openai.mjs'

const maxScreenshots = 1600
const maxWebcamPhotos = 3600
const focusFrameGapMs = 3000

export function recordPresence(draft, sessionId, type, source, now = Date.now()) {
  const { activity } = draft
  const capture = activity?.capture
  if (!activity?.proctoredStartedAt || activity.writtenSubmittedAt || !capture?.active
    || capture.sessionId !== sessionId || (capture.presence ?? 'returned') === type) return draft
  return { ...draft, activity: { ...activity, capture: {
    ...capture, presence: type,
    events: capture.events.length >= 2600 ? capture.events : [...capture.events, { type, source, at: now, questionId: capture.questionId }],
  } } }
}

const focusFrame = reason => reason === 'away' || reason === 'returned'

export function captureIsActive(activity, now = Date.now()) {
  const capture = activity?.capture
  return Boolean(capture?.active && now - capture.lastAt <= screenshotIntervalMs + captureGraceMs)
}

export function requireExamCapture(draft, questionId, { setup = false } = {}) {
  if (draft?.setSnapshot?.mode !== 'exam') return
  const { questions } = draft.setSnapshot
  const allVideo = questions.every(question => question.type === 'video')
  const target = questionId && questions.find(question => question.id === questionId)
  if (target?.type === 'video' || (!questionId && (allVideo || draft.activity?.writtenSubmittedAt))) {
    if (allVideo || draft.activity?.writtenSubmittedAt) return
    throw new ApiError(409, 'Submit the written section before recording video answers.')
  }
  if (draft.activity?.writtenSubmittedAt) throw new ApiError(409, 'The written section has already been submitted.')
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
  if (!setup && !draft.activity?.proctoredStartedAt) throw new ApiError(409, 'Start the exam after sharing your screen and enabling the webcam.')
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
  if (draft.activity?.writtenSubmittedAt || !draft.setSnapshot.questions.some(question => question.id === identity.questionId && question.type !== 'video')) {
    throw new ApiError(409, 'Open this question before capturing it.')
  }
  if ((capture?.screenshots.length ?? 0) >= maxScreenshots) throw new ApiError(409, 'This exam has reached its screenshot limit.')
  if (identity.reason === 'start') return
  if (!capture?.active || capture.sessionId !== identity.sessionId) {
    throw new ApiError(409, 'Share the exam again.', 'exam_capture_required')
  }
  if (identity.reason === 'interval' && capture.questionId === identity.questionId && now - capture.lastAt < screenshotIntervalMs - 1500) {
    throw new ApiError(429, 'A screenshot was already captured for this question.')
  }
  if (focusFrame(identity.reason) && now - (capture.screenFocusAt?.[identity.reason] ?? 0) < focusFrameGapMs) {
    throw new ApiError(429, 'A screenshot was just captured for this focus change.')
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
      ...(identity.reason === 'start' && { presence: 'returned' }),
      ...(focusFrame(identity.reason) && { screenFocusAt: { ...previous.screenFocusAt, [identity.reason]: now } }),
      screenshots: [...previous?.screenshots ?? [], { id, at: now, questionId: identity.questionId,
        recording: identity.recording, surface: identity.surface, requestId: identity.requestId, sessionId: identity.sessionId, reason: identity.reason }],
    },
  } }
}

export function checkWebcamFrame(draft, { sessionId, questionId, reason }, now = Date.now()) {
  const set = draft.setSnapshot
  const question = set?.questions.find(item => item.id === questionId)
  const interval = set?.webcamPhotoSeconds
  if (set?.mode !== 'exam' || !interval || !question || question.type === 'video' || draft.activity?.writtenSubmittedAt) {
    throw new ApiError(403, 'Webcam photos are available for non-video exam questions.')
  }
  const capture = draft.activity?.capture
  if (!capture?.active || capture.sessionId !== sessionId || capture.questionId !== questionId) {
    throw new ApiError(409, 'Share the exam before taking webcam photos.', 'exam_capture_required')
  }
  if ((capture.webcamPhotos?.length ?? 0) >= maxWebcamPhotos) throw new ApiError(409, 'This exam has reached its webcam photo limit.')
  if (focusFrame(reason) ? now - (capture.webcamFocusAt?.[reason] ?? 0) < focusFrameGapMs
    : capture.webcam?.questionId === questionId && now - capture.webcam.at < interval * 1000 - 1500) {
    throw new ApiError(429, 'A webcam photo was already captured for this question.')
  }
}

export function addWebcamFrame(draft, identity, id, now = Date.now()) {
  checkWebcamFrame(draft, identity, now)
  const capture = draft.activity.capture
  const frame = { id, at: now, questionId: identity.questionId, requestId: identity.requestId, sessionId: identity.sessionId, reason: identity.reason }
  return { ...draft, activity: { ...draft.activity, capture: {
    ...capture, webcam: { at: frame.at, questionId: frame.questionId },
    ...(focusFrame(identity.reason) && { webcamFocusAt: { ...capture.webcamFocusAt, [identity.reason]: now } }),
    webcamPhotos: [...capture.webcamPhotos ?? [], frame],
  } } }
}

export function finishCapture(activity, now) {
  const capture = activity?.capture
  return capture?.active ? { ...activity, capture: {
    ...capture, active: false, events: [...capture.events, { type: 'finished', at: now }],
  } } : activity
}
