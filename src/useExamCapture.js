import { useEffect, useRef, useState } from 'react'
import { apiUrl } from './local-api.js'
import { screenshotIntervalMs } from './exam-media.js'
import { cropExamWindow, markExamWindow } from './exam-window-capture.js'
import { encodeFrame, readFrame, releaseVideo, videoForStream } from './video-frame.js'
import { uploadExamEvidence } from './upload-exam-evidence.js'

const stopTracks = stream => stream.getTracks().forEach(track => track.stop())
const paint = () => new Promise(resolve => {
  const timeout = setTimeout(resolve, 250)
  requestAnimationFrame(() => requestAnimationFrame(() => {
    clearTimeout(timeout)
    resolve()
  }))
})

export function useExamCapture({ required, started, setId, draftId, questionId, flushDraft, recording }) {
  const current = useRef(null)
  const pending = useRef(Promise.resolve())
  const mounted = useRef(false)
  const openingMarkers = useRef(null)
  const activeQuestion = useRef(questionId)
  activeQuestion.current = questionId
  const videoRecording = useRef(recording)
  videoRecording.current = recording
  const [session, setSession] = useState(null)
  const [covered, setCovered] = useState('')
  const [starting, setStarting] = useState(false)
  const [error, setError] = useState('')
  const [presence, setPresence] = useState(null)
  const [recovering, setRecovering] = useState(false)
  const devices = navigator.mediaDevices
  const windowSharing = typeof devices?.setCaptureHandleConfig !== 'function'

  function stop(message = '') {
    const sharing = current.current
    current.current = null
    openingMarkers.current?.remove()
    openingMarkers.current = null
    if (sharing) {
      sharing.markers?.remove()
      releaseVideo(sharing.video)
      // If an upload is already in progress, stop the server session after it completes.
      void Promise.allSettled([pending.current, sharing.presenceWrites]).then(() => fetch(apiUrl('attempt-media/stop/' + sharing.setId + '/' + sharing.draftId), {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId: sharing.id }), keepalive: true,
      })).catch(() => {})
    }
    if (mounted.current) {
      setSession(null)
      setCovered('')
      setError(message)
      setPresence(null)
      setRecovering(false)
    }
  }

  useEffect(() => {
    mounted.current = {}
    const leave = () => stop()
    window.addEventListener('pagehide', leave)
    return () => {
      mounted.current = false
      window.removeEventListener('pagehide', leave)
      stop()
    }
  }, [setId, draftId])

  useEffect(() => {
    if (!required && current.current) stop()
  }, [required])

  async function start() {
    if (!draftId || starting || current.current) return
    if (!devices?.getDisplayMedia) {
      setError('Screen sharing needs a supported desktop browser on HTTPS or localhost.')
      return
    }
    setStarting(true)
    setError('')
    const id = crypto.randomUUID()
    const scope = mounted.current
    const markers = windowSharing ? markExamWindow(id) : null
    openingMarkers.current = markers
    let stream
    let accepted = false
    try {
      if (!windowSharing) devices.setCaptureHandleConfig({ handle: id, permittedOrigins: [window.location.origin] })
      stream = await devices.getDisplayMedia(windowSharing
        ? { video: { displaySurface: 'window' }, audio: false, monitorTypeSurfaces: 'exclude' }
        : { video: true, audio: false, preferCurrentTab: true, selfBrowserSurface: 'include', surfaceSwitching: 'exclude' })
      if (mounted.current !== scope) return
      const track = stream.getVideoTracks()[0]
      if (!track || track.readyState === 'ended') throw new Error('Screen sharing ended. Share the exam to continue.')
      const surface = track.getSettings().displaySurface
      if (windowSharing && surface === 'monitor') throw new Error('Select the browser window displaying this exam.')
      if (!windowSharing && (surface !== 'browser' || track.getCaptureHandle?.()?.handle !== id)) {
        throw new Error('Choose this exam tab in the browser’s sharing dialog.')
      }
      const video = videoForStream(stream)
      void video.play().catch(() => {})
      const sharing = { id, markers, track, video, setId, draftId, questionId: null, surface: windowSharing ? 'window' : 'tab',
        verifiedSurface: !windowSharing || ['window', 'browser'].includes(surface),
        presence: 'returned', presenceWrites: Promise.resolve() }
      current.current = sharing
      accepted = true
      openingMarkers.current = null
      track.addEventListener('ended', () => {
        if (current.current === sharing) stop('Screen sharing stopped. Share the exam to resume.')
      }, { once: true })
      track.addEventListener('capturehandlechange', () => {
        if (!windowSharing && current.current === sharing && track.getCaptureHandle()?.handle !== id) {
          stop('The shared tab changed. Share this exam tab to resume.')
        }
      })
      setSession(sharing)
    } catch (failure) {
      if (mounted.current === scope) setError(failure.name === 'NotAllowedError' ? 'Screen sharing was canceled. Share the exam to continue.' : failure.message)
    } finally {
      if (!accepted) {
        if (stream) stopTracks(stream)
        markers?.remove()
        if (openingMarkers.current === markers) openingMarkers.current = null
      }
      if (mounted.current === scope) setStarting(false)
    }
  }

  useEffect(() => {
    if (!required || !session) return
    let canceled = false
    let timer
    let returnRetries = 0
    const controller = new AbortController()
    const valid = () => !canceled && current.current === session
    function schedule(delay = screenshotIntervalMs, reason = 'interval') {
      clearTimeout(timer)
      if (valid()) timer = setTimeout(() => capture(reason), delay)
    }
    function capture(reason) {
      clearTimeout(timer)
      const task = pending.current.then(async () => {
        if (!valid() || activeQuestion.current !== questionId) return
        await flushDraft()
        if ((reason === 'open' || reason === 'returned') && !document.hidden) await paint()
        if (!valid()) return
        if ((reason === 'away' || reason === 'returned') && session.presence !== reason) {
          schedule()
          return
        }
        if (!session.verifiedSurface && (document.hidden || session.presence === 'away')) {
          setRecovering(true)
          schedule()
          return
        }
        if (session.track.muted) throw new Error('The shared exam did not send an image.')
        if (!session.markers && session.track.getCaptureHandle()?.handle !== session.id) throw new Error('The shared tab changed.')
        const frame = await readFrame(session.video, session.markers ? 1920 : 1280, session.markers ? 1080 : 720,
          'The shared exam did not send an image.')
        if (canceled || current.current !== session) return
        const blob = await encodeFrame(session.markers ? cropExamWindow(frame, session.markers) : frame, 0.68)
        if (canceled || current.current !== session) return
        const params = new URLSearchParams({ session: session.id,
          reason: session.questionId === null ? 'start' : reason, recording: String(videoRecording.current), surface: session.surface,
        })
        await uploadExamEvidence('attempt-media/screenshot/' + setId + '/' + draftId + '/' + questionId,
          params, blob, 'screenshot', controller.signal)
        session.questionId = questionId
        if (valid()) {
          setCovered(questionId)
          setRecovering(false)
          schedule()
        }
      }).catch(failure => {
        if (!valid()) return
        if (failure.status === 429) {
          if (reason === 'returned') setRecovering(false)
          schedule()
        } else if (session.presence === 'away' && session.track.readyState === 'live') {
          setRecovering(true)
          schedule()
        } else if (reason === 'returned' && session.track.readyState === 'live' && returnRetries++ < 3) {
          schedule(1000, 'returned')
        } else stop(failure.message)
      })
      pending.current = task
    }
    function focusChanged(event) {
      const type = document.hidden || event.type === 'blur'
        || (event.type === 'visibilitychange' && !document.hasFocus()) ? 'away' : 'returned'
      if (!valid() || type === session.presence) return
      session.presence = type
      const source = event.type === 'visibilitychange' ? 'visibility' : 'focus'
      setPresence({ type, sessionId: session.id })
      session.presenceWrites = session.presenceWrites.then(async () => {
        const response = await fetch(apiUrl('attempt-media/presence/' + setId + '/' + draftId), {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sessionId: session.id, type, source }), keepalive: true, signal: AbortSignal.timeout(5000),
        })
        if (!response.ok) throw new Error('Could not log the exam focus change.')
      }).catch(() => {})
      if (type === 'returned') {
        returnRetries = 0
        setRecovering(true)
      }
      capture(type)
    }
    if (started) {
      window.addEventListener('blur', focusChanged)
      window.addEventListener('focus', focusChanged)
      document.addEventListener('visibilitychange', focusChanged)
    }
    capture('open')
    return () => {
      canceled = true
      clearTimeout(timer)
      controller.abort()
      window.removeEventListener('blur', focusChanged)
      window.removeEventListener('focus', focusChanged)
      document.removeEventListener('visibilitychange', focusChanged)
    }
  }, [required, started, session, questionId, setId, draftId, flushDraft])

  const coveredQuestion = Boolean(session && covered === questionId)
  return { ready: !required || (coveredQuestion && !recovering), coveredQuestion, recovering, presence, sharing: Boolean(session),
    sessionId: session?.id, windowSharing, starting, error, start, stop }
}
