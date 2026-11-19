import { useEffect, useRef, useState } from 'react'
import { apiUrl } from './local-api.js'
import { screenshotIntervalMs } from './exam-media.js'
import { cropExamWindow, markExamWindow } from './exam-window-capture.js'
import { encodeFrame, readFrame, releaseVideo, videoForStream } from './video-frame.js'

const stopTracks = stream => stream.getTracks().forEach(track => track.stop())
const paint = () => new Promise(resolve => {
  const timeout = setTimeout(resolve, 250)
  requestAnimationFrame(() => requestAnimationFrame(() => {
    clearTimeout(timeout)
    resolve()
  }))
})

export function useExamCapture({ required, setId, draftId, questionId, flushDraft, recording }) {
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
      void pending.current.then(() => fetch(apiUrl('attempt-media/stop/' + sharing.setId + '/' + sharing.draftId), {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId: sharing.id }), keepalive: true,
      })).catch(() => {})
    }
    if (mounted.current) {
      setSession(null)
      setCovered('')
      setError(message)
    }
  }

  useEffect(() => {
    mounted.current = {}
    const leave = () => stop()
    const visibilityChanged = () => {
      if (document.hidden && current.current?.markers) stop('The exam is no longer visible. Share its window to resume.')
    }
    window.addEventListener('pagehide', leave)
    document.addEventListener('visibilitychange', visibilityChanged)
    return () => {
      mounted.current = false
      window.removeEventListener('pagehide', leave)
      document.removeEventListener('visibilitychange', visibilityChanged)
      stop()
    }
  }, [setId, draftId])

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
      const sharing = { id, markers, track, video, setId, draftId, questionId: null, surface: windowSharing ? 'window' : 'tab' }
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
    function capture(reason) {
      const task = pending.current.then(async () => {
        if (canceled || current.current !== session || activeQuestion.current !== questionId) return
        await flushDraft()
        if (reason === 'open' && !document.hidden) await paint()
        if (canceled || current.current !== session) return
        if (session.markers ? document.hidden || !document.hasFocus() : session.track.getCaptureHandle()?.handle !== session.id) {
          throw new Error(session.markers ? 'Bring the exam window to the front.' : 'The shared tab changed.')
        }
        const frame = await readFrame(session.video, session.markers ? 1920 : 1280, session.markers ? 1080 : 720,
          'The shared exam did not send an image.')
        if (canceled || current.current !== session) return
        const blob = await encodeFrame(session.markers ? cropExamWindow(frame, session.markers) : frame, 0.68)
        if (canceled || current.current !== session) return
        const params = new URLSearchParams({ session: session.id,
          reason: session.questionId === null ? 'start' : reason, recording: String(videoRecording.current), surface: session.surface,
        })
        const response = await fetch(apiUrl('attempt-media/screenshot/' + setId + '/' + draftId + '/' + questionId + '?' + params), {
          method: 'POST', body: blob,
        })
        if (!response.ok) {
          const error = await response.json().catch(() => null)
          throw new Error(error?.error ?? 'Could not save the screenshot.')
        }
        session.questionId = questionId
        if (!canceled && current.current === session) {
          setCovered(questionId)
          timer = setTimeout(() => capture('interval'), screenshotIntervalMs)
        }
      }).catch(failure => {
        if (!canceled && current.current === session) stop(failure.message)
      })
      pending.current = task
    }
    capture('open')
    return () => {
      canceled = true
      clearTimeout(timer)
    }
  }, [required, session, questionId, setId, draftId, flushDraft])

  return { ready: !required || Boolean(session && covered === questionId), sharing: Boolean(session),
    sessionId: session?.id, windowSharing, starting, error, start, stop }
}
