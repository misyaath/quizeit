import { useEffect, useRef, useState } from 'react'
import { apiUrl } from './local-api.js'
import { encodeFrame, readFrame, releaseVideo, videoForStream } from './video-frame.js'

export function useExamWebcam({ intervalSeconds, setId, draftId, questionId, sessionId, screenReady, onFailure }) {
  const scope = useRef(null)
  const current = useRef(null)
  const activeQuestion = useRef(questionId)
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
    const valid = () => !controller.signal.aborted && current.current === active && activeQuestion.current === questionId

    async function takePhoto() {
      if (!valid()) return
      try {
        const frame = await readFrame(active.video, 640, 480, 'The webcam did not send a photo.')
        if (active.track.muted || active.track.readyState !== 'live') throw new Error('The webcam feed is unavailable.')
        const blob = await encodeFrame(frame, 0.65)
        if (!valid()) return
        const response = await fetch(apiUrl('attempt-media/webcam/' + setId + '/' + draftId + '/' + questionId
          + '?session=' + active.sessionId), { method: 'POST', body: blob, signal: controller.signal })
        if (!response.ok) {
          const problem = await response.json().catch(() => null)
          throw new Error(problem?.error ?? 'Could not save the webcam photo.')
        }
        if (!valid()) return
        setCovered({ active, questionId })
        timer = setTimeout(takePhoto, intervalSeconds * 1000)
      } catch (failure) {
        if (valid()) fail.current(failure.message)
      }
    }
    void takePhoto()
    return () => {
      controller.abort()
      clearTimeout(timer)
    }
  }, [active, screenReady, setId, draftId, questionId, intervalSeconds])

  return {
    ready: !intervalSeconds || Boolean(active && covered?.active === active && covered.questionId === questionId),
    active: Boolean(active), starting, error, start,
  }
}
