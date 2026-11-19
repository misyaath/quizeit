import React, { useEffect, useRef, useState } from 'react'
import { mediaUrl, videoByteLimit } from './exam-media.js'
import { apiUrl, localApi } from './local-api.js'

const stopTracks = stream => stream?.getTracks().forEach(track => track.stop())
const recordingTypes = ['video/webm;codecs=vp8,opus', 'video/mp4', 'video/webm']
const timeLabel = seconds => Math.floor(seconds / 60) + ':' + String(seconds % 60).padStart(2, '0')

async function showPreview(player, track) {
  player.muted = true
  player.srcObject = new MediaStream([track])
  let timeout
  let frame
  try {
    await Promise.race([
      player.play().then(() => {
        if (!player.requestVideoFrameCallback) return
        return new Promise(resolve => { frame = player.requestVideoFrameCallback(resolve) })
      }),
      new Promise((_, reject) => {
        timeout = setTimeout(() => reject(new Error('The camera did not send a video frame. Check that it is available and try again.')), 6000)
      }),
    ])
    if (!player.videoWidth || !player.videoHeight) throw new Error('No camera image is available. Check your camera and try again.')
  } finally {
    clearTimeout(timeout)
    if (frame !== undefined) player.cancelVideoFrameCallback(frame)
  }
}

function MediaToggle({ kind, enabled, onClick, disabled }) {
  const video = kind === 'video'
  const label = video ? (enabled ? 'Turn camera off' : 'Turn camera on')
    : (enabled ? 'Mute microphone' : 'Unmute microphone')
  return <button type="button" className={'video-device-toggle' + (enabled ? '' : ' device-off')}
    aria-label={label} title={label} onClick={onClick} disabled={disabled}>
    <svg viewBox="0 0 24 24" height="22" width="22" fill="none" stroke="currentColor"
      strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {video ? <>
        <rect x="3" y="6" width="12" height="12" rx="2" />
        <path d="m15 10 5-3v10l-5-3" />
      </> : <>
        <rect x="9" y="3" width="6" height="12" rx="3" />
        <path d="M5 11v1a7 7 0 0 0 14 0v-1M12 19v3" />
      </>}
      {!enabled && <path d="m3 3 18 18" />}
    </svg>
  </button>
}

export default function VideoAnswer({ setId, draftId, question, value, disabled, onChange, onRecording, flushDraft }) {
  const [preview, setPreview] = useState('')
  const [blob, setBlob] = useState(null)
  const [phase, setPhase] = useState('idle')
  const [remainingSeconds, setRemainingSeconds] = useState(question.videoSeconds)
  const [error, setError] = useState('')
  const [cameraEnabled, setCameraEnabled] = useState(true)
  const [micEnabled, setMicEnabled] = useState(true)
  const [cameraDark, setCameraDark] = useState(false)
  const [cameraInterrupted, setCameraInterrupted] = useState(false)
  const [cameraOptions, setCameraOptions] = useState([])
  const [cameraId, setCameraId] = useState('')
  const blocked = useRef(disabled)
  blocked.current = disabled
  const camera = useRef(null)
  const recorder = useRef(null)
  const live = useRef(null)
  const mounted = useRef(true)
  const timeout = useRef(null)
  const deadline = useRef(0)
  const endpoint = 'attempt-media/video/' + setId + '/' + draftId + '/' + question.id

  const opening = phase === 'opening'
  const ready = phase === 'ready'
  const recording = phase === 'recording'
  const stopping = phase === 'stopping'
  const saving = phase === 'saving'
  const showingCamera = ready || recording || stopping
  const idle = phase === 'idle'
  const playback = preview || (value?.mediaId && mediaUrl(value.mediaId))

  useEffect(() => {
    if (!blob) {
      setPreview('')
      return
    }
    const url = URL.createObjectURL(blob)
    setPreview(url)
    return () => URL.revokeObjectURL(url)
  }, [blob])

  function closeCamera() {
    const stream = camera.current
    camera.current = null
    if (live.current) {
      live.current.pause()
      live.current.srcObject = null
    }
    stopTracks(stream)
  }

  function finish() {
    if (recorder.current?.state !== 'recording') return
    clearTimeout(timeout.current)
    if (mounted.current) setPhase('stopping')
    recorder.current.stop()
  }

  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
      clearTimeout(timeout.current)
      finish()
      closeCamera()
      onRecording(false)
    }
  }, [])

  useEffect(() => {
    if (!disabled) return
    if (recorder.current) finish()
    else if (camera.current) {
      closeCamera()
      setPhase('idle')
    }
  }, [disabled])

  useEffect(() => {
    if (!recording) return
    const tick = setInterval(() => {
      setRemainingSeconds(Math.max(0, Math.ceil((deadline.current - performance.now()) / 1000)))
    }, 200)
    return () => clearInterval(tick)
  }, [recording])

  useEffect(() => {
    setCameraDark(false)
    if (!showingCamera || !cameraEnabled || cameraInterrupted) return
    const canvas = document.createElement('canvas')
    canvas.width = 12
    canvas.height = 8
    const context = canvas.getContext('2d', { willReadFrequently: true })
    if (!context) return
    let darkFrames = 0
    const probe = setInterval(() => {
      const player = live.current
      if (!player?.videoWidth || player.readyState < 2) return
      context.drawImage(player, 0, 0, canvas.width, canvas.height)
      const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data
      const dark = !pixels.some((value, index) => index % 4 !== 3 && value > 16)
      darkFrames = dark ? darkFrames + 1 : 0
      setCameraDark(darkFrames >= 3)
    }, 700)
    return () => clearInterval(probe)
  }, [showingCamera, cameraEnabled, cameraInterrupted])

  async function startCamera(deviceId = '') {
    if (disabled || (!idle && !ready) || !draftId) return
    const keepMicOn = !ready || micEnabled
    if (ready) closeCamera()
    setError('')
    setPhase('opening')
    let stream
    try {
      if (!navigator.mediaDevices?.getUserMedia || !recordingTypes.some(type => globalThis.MediaRecorder?.isTypeSupported(type))) {
        throw new Error('Camera recording is unavailable in this browser.')
      }
      stream = await navigator.mediaDevices.getUserMedia({
        video: deviceId ? { deviceId: { exact: deviceId } } : true,
        audio: true,
      })
      if (!mounted.current || blocked.current) {
        stopTracks(stream)
        if (mounted.current) setPhase('idle')
        return
      }
      camera.current = stream
      const [videoTrack] = stream.getVideoTracks()
      for (const track of stream.getAudioTracks()) track.enabled = keepMicOn
      setCameraEnabled(true)
      setMicEnabled(keepMicOn)
      setCameraId(videoTrack.getSettings().deviceId || deviceId)
      setCameraInterrupted(videoTrack.muted)
      void navigator.mediaDevices.enumerateDevices().then(devices => {
        if (mounted.current) setCameraOptions(devices.filter(device => device.kind === 'videoinput' && device.deviceId))
      }).catch(() => {})
      const showCameraStatus = () => {
        if (camera.current === stream) setCameraInterrupted(videoTrack.muted)
      }
      videoTrack.addEventListener('mute', showCameraStatus)
      videoTrack.addEventListener('unmute', showCameraStatus)
      for (const track of stream.getTracks()) {
        track.addEventListener('ended', () => {
          if (camera.current !== stream) return
          setError('The camera or microphone disconnected.')
          if (recorder.current) finish()
          else {
            closeCamera()
            setPhase('idle')
          }
        }, { once: true })
      }
      await showPreview(live.current, videoTrack)
      if (!mounted.current || camera.current !== stream) return
      setPhase('ready')
    } catch (failure) {
      if (camera.current === stream && stream) closeCamera()
      else stopTracks(stream)
      if (!mounted.current) return
      if (!blocked.current) setError(failure.name === 'NotAllowedError'
        ? 'Allow access to your camera and microphone, then try again.'
        : failure.message)
      setPhase('idle')
    }
  }

  function toggleTrack(kind) {
    const tracks = kind === 'video' ? camera.current?.getVideoTracks() : camera.current?.getAudioTracks()
    if (!tracks?.length) return
    const enabled = !tracks[0].enabled
    for (const track of tracks) track.enabled = enabled
    if (kind === 'video') setCameraEnabled(enabled)
    else setMicEnabled(enabled)
  }

  function startRecording() {
    if (!ready || disabled || !camera.current || recorder.current) return
    setError('')
    try {
      const mimeType = recordingTypes.find(type => MediaRecorder.isTypeSupported(type))
      const active = new MediaRecorder(camera.current, { mimeType, videoBitsPerSecond: 1_000_000 })
      const chunks = []
      active.ondataavailable = event => { if (event.data.size) chunks.push(event.data) }
      active.onstop = () => {
        if (recorder.current !== active) return
        recorder.current = null
        clearTimeout(timeout.current)
        closeCamera()
        if (!mounted.current) return
        onRecording(false)
        setPhase('idle')
        if (chunks.length) setBlob(new Blob(chunks, { type: active.mimeType || mimeType }))
        else setError('The recording is empty. Start the camera and try again.')
      }
      active.onerror = () => {
        if (recorder.current !== active) return
        recorder.current = null
        clearTimeout(timeout.current)
        closeCamera()
        if (!mounted.current) return
        setError('Could not complete the recording.')
        onRecording(false)
        setPhase('idle')
      }
      recorder.current = active
      active.start(1000)
      deadline.current = performance.now() + question.videoSeconds * 1000
      setRemainingSeconds(question.videoSeconds)
      setPhase('recording')
      onRecording(true)
      timeout.current = setTimeout(() => {
        setRemainingSeconds(0)
        finish()
      }, question.videoSeconds * 1000)
    } catch {
      recorder.current = null
      setError('Could not start the recording. Check your camera and microphone, then try again.')
    }
  }

  async function save() {
    if (!blob || blob.size > videoByteLimit) {
      setError('Record a shorter video. The size limit is 64 MiB.')
      return
    }
    setError('')
    setPhase('saving')
    try {
      await flushDraft()
      const response = await fetch(apiUrl(endpoint), { method: 'POST', body: blob })
      const result = await response.json().catch(() => null)
      if (!response.ok) throw new Error(result?.error ?? 'Could not save the video.')
      onChange(result.answer)
      if (mounted.current) setBlob(null)
    } catch (failure) {
      if (mounted.current) setError(failure.message)
    } finally {
      if (mounted.current) setPhase('idle')
    }
  }

  async function remove() {
    setPhase('removing')
    setError('')
    try {
      await localApi(endpoint + '/' + value.mediaId, 'DELETE')
      onChange(undefined)
    } catch (failure) {
      if (mounted.current) setError(failure.message)
    } finally {
      if (mounted.current) setPhase('idle')
    }
  }

  return <div className="video-answer">
    {playback && !showingCamera && !opening && <div className="video-controls">
      {preview && <button className="button primary" type="button" disabled={disabled || !idle} onClick={save}>
        {saving ? 'Submitting…' : 'Submit video'}
      </button>}
      <button className="button secondary" type="button" disabled={disabled || !idle || !draftId} onClick={() => startCamera(cameraId)}>Record again</button>
      {preview ? <button className="text-button" type="button" disabled={!idle} onClick={() => setBlob(null)}>Discard preview</button>
        : <button className="text-button" type="button" disabled={disabled || !idle} onClick={remove}>Remove saved video</button>}
    </div>}
    <div className="video-stage">
      <video className={'video-live' + (showingCamera && cameraEnabled && !cameraInterrupted ? ' visible' : '')} ref={live}
        muted autoPlay playsInline aria-label="Live camera preview" aria-hidden={!showingCamera || !cameraEnabled || cameraInterrupted} />
      {opening && <p className="video-placeholder" role="status">Starting camera…</p>}
      {showingCamera && (!cameraEnabled || cameraInterrupted) && <p className="video-placeholder" role="status">
        {cameraEnabled ? 'Camera feed interrupted' : 'Camera off'}
      </p>}
      {!opening && !showingCamera && (playback
        ? <video controls playsInline preload="metadata" src={playback}
          aria-label={preview ? 'Unsaved video preview' : 'Saved video answer'} />
        : <div className="video-placeholder">
          <button className="button primary" type="button" disabled={disabled || !idle || !draftId} onClick={() => startCamera(cameraId)}>Start camera</button>
        </div>)}
      {(recording || stopping) && <div className="video-timer-overlay">
        <span className="video-recording" role="status">{recording ? 'Recording video…' : 'Finishing recording…'}</span>
        <div className="video-recording-time" role="timer" aria-live="off"
          aria-label={timeLabel(question.videoSeconds) + ' total, ' + timeLabel(remainingSeconds) + ' left'}>
          <span aria-hidden="true">{timeLabel(question.videoSeconds)} / {timeLabel(remainingSeconds)}</span>
        </div>
      </div>}
      {showingCamera && <div className="video-device-controls" role="group" aria-label="Camera and microphone">
        <MediaToggle kind="audio" enabled={micEnabled} disabled={disabled || stopping} onClick={() => toggleTrack('audio')} />
        <MediaToggle kind="video" enabled={cameraEnabled} disabled={disabled || stopping} onClick={() => toggleTrack('video')} />
      </div>}
    </div>
    {showingCamera && cameraDark && <p className="notice" role="status">Your camera image is dark. Check the privacy shutter, camera placement, or lighting.</p>}
    {error && <p className="notice" role="alert">{error}</p>}
    <div className="video-controls">
      {(ready || idle) && cameraOptions.length > 1 && <label className="video-camera-select">Camera
        <select aria-label="Camera device" value={cameraId} disabled={disabled} onChange={event => startCamera(event.target.value)}>
          <option value="">Default camera</option>
          {cameraOptions.map((device, index) => <option key={device.deviceId} value={device.deviceId}>{device.label || 'Camera ' + (index + 1)}</option>)}
        </select>
      </label>}
      {ready && <button className="button primary" type="button" disabled={disabled} onClick={startRecording}>Start recording</button>}
      {(recording || stopping) && <button className="button video-stop" type="button" disabled={stopping} onClick={finish}>
        {stopping ? 'Preparing preview…' : 'Stop recording'}
      </button>}
    </div>
    {!showingCamera && !opening && value?.mediaId && !preview && <p role="status">Video answer saved.</p>}
  </div>
}
