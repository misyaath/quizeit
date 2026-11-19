import { useEffect, useRef, useState } from 'react'
import { encodeFrame, readFrame, releaseVideo, videoForStream } from './video-frame.js'
import { uploadExamEvidence } from './upload-exam-evidence.js'

export function useExamWebcam({ intervalSeconds, setId, draftId, questionId, sessionId, screenReady, presence, onFailure }) {
  const scope = useRef(null)
  const current = useRef(null)
  const activeQuestion = useRef(questionId)
  const delivery = useRef(null)
  const latestPresence = useRef(presence)
  latestPresence.current = presence
  activeQuestion.current = questionId
  const fail = useRef(onFailure)
  fail.current = onFailure
  const [camera, setCamera] = useState(null)
  const [covered, setCovered] = useState(null)
  const [starting, setStarting] = useState(false)
  const [error, setError] = useState('')
  const webcamSession = intervalSeconds && sessionId
  const active = camera && camera.sessionId === webcamSession ? camera : null

  useEffect(() => {
    scope.current = {}
    setCamera(null)
    setCovered(null)
    setStarting(false)
    setError('')
    const release = () => {
      scope.current = null
      if (current.current) {
        clearInterval(current.current.watch)
        releaseVideo(current.current.video)
        current.current = null
      }
    }
    window.addEventListener('pagehide', release)
    return () => {
      window.removeEventListener('pagehide', release)
      release()
    }
  }, [webcamSession, draftId])

  async function start() {
    if (!webcamSession || !screenReady || starting || current.current) return
    const requestScope = scope.current
    setError('')
    setStarting(true)
    let stream
    let accepted = false
    try {
      const devices = navigator.mediaDevices
      if (!devices?.getUserMedia) throw new Error('Webcam access needs HTTPS or localhost.')
      stream = await devices.getUserMedia({
        audio: false, video: { width: { ideal: 640 }, height: { ideal: 480 }, frameRate: { ideal: 5 } },
      })
      if (requestScope !== scope.current) return
      const track = stream.getVideoTracks()[0]
      if (!track || track.readyState === 'ended') throw new Error('The webcam did not start.')
      const video = videoForStream(stream)
      void video.play().catch(() => {})
      function cameraStopped() {
        if (current.current === opened) fail.current('The webcam stopped. Share the exam and enable the webcam again to resume.')
      }
      const watch = setInterval(() => { if (track.readyState !== 'live') cameraStopped() }, 1000)
      const opened = { sessionId: webcamSession, video, track, watch }
      track.addEventListener('ended', cameraStopped, { once: true })
      current.current = opened
      accepted = true
      setCamera(opened)
    } catch (failure) {
      if (requestScope === scope.current) setError(failure.name === 'NotAllowedError'
        ? 'Allow camera access to continue the exam.' : failure.message)
    } finally {
      if (!accepted) stream?.getTracks().forEach(track => track.stop())
      if (requestScope === scope.current) setStarting(false)
    }
  }

  useEffect(() => {
    if (!active || !screenReady) return
    const controller = new AbortController()
    let timer
    let pending = Promise.resolve()
    let returningRetries = 0
    const valid = () => !controller.signal.aborted && current.current === active && activeQuestion.current === questionId

    function schedule(delay = intervalSeconds * 1000, reason = 'interval') {
      clearTimeout(timer)
      if (valid()) timer = setTimeout(() => takePhoto(reason), delay)
    }

    function takePhoto(reason = 'interval') {
      if (!valid()) return
      clearTimeout(timer)
      pending = pending.then(async () => {
        if (!valid()) return
        if (reason !== 'interval' && latestPresence.current?.type !== reason) {
          schedule()
          return
        }
        const frame = await readFrame(active.video, 640, 480, 'The webcam did not send a photo.')
        if (active.track.muted || active.track.readyState !== 'live') throw new Error('The webcam feed is unavailable.')
        const blob = await encodeFrame(frame, 0.65)
        if (!valid()) return
        await uploadExamEvidence('attempt-media/webcam/' + setId + '/' + draftId + '/' + questionId,
          new URLSearchParams({ session: active.sessionId, reason }), blob, 'webcam photo', controller.signal)
        if (!valid()) return
        setCovered({ active, questionId })
        schedule()
      }).catch(failure => {
        if (!valid()) return
        if (failure.status === 429) schedule()
        else if (latestPresence.current?.type === 'away' && active.track.readyState === 'live') schedule()
        else if (reason === 'returned' && active.track.readyState === 'live' && returningRetries++ < 3) schedule(1000, 'returned')
        else fail.current(failure.message)
      })
    }
    delivery.current = reason => {
      if (reason === 'returned') returningRetries = 0
      takePhoto(reason)
    }
    takePhoto()
    return () => {
      delivery.current = null
      controller.abort()
      clearTimeout(timer)
    }
  }, [active, screenReady, setId, draftId, questionId, intervalSeconds])

  useEffect(() => {
    if (presence && presence.sessionId === sessionId) delivery.current?.(presence.type)
  }, [presence, sessionId])

  return {
    ready: !intervalSeconds || Boolean(active && covered?.active === active && covered.questionId === questionId),
    active: Boolean(active), starting, error, start,
  }
}
