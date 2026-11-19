import React, { useEffect, useState } from 'react'
import { localApi } from './local-api.js'
import { newAttempt } from './attempts.js'
import { useAttemptProgress } from './useAttemptProgress.js'
import { formatDate } from './AttemptDisplay.jsx'
import Exam from './Exam.jsx'

export function ExamInvitation({ token }) {
  const [invitation, setInvitation] = useState(null)
  const [location, setLocation] = useState(null)
  const [locationStatus, setLocationStatus] = useState('')
  const [locating, setLocating] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const endpoint = 'exam-invites/' + token

  useEffect(() => {
    localApi(endpoint).then(setInvitation).catch(failure => setError(failure.message))
  }, [endpoint])

  function shareLocation() {
    if (!navigator.geolocation) {
      setLocationStatus('Location is unavailable in this browser.')
      return
    }
    setLocating(true)
    navigator.geolocation.getCurrentPosition(({ coords }) => {
      setLocation({ latitude: coords.latitude, longitude: coords.longitude, accuracy: coords.accuracy })
      setLocationStatus('Approximate location will be shared.')
      setLocating(false)
    }, () => {
      setLocationStatus('Location is unavailable. You can still start the exam.')
      setLocating(false)
    }, { timeout: 8000 })
  }

  async function start(event) {
    event.preventDefault()
    const identity = Object.fromEntries(new FormData(event.currentTarget))
    setBusy(true)
    setError('')
    try {
      const { path } = await localApi(endpoint, 'POST', { ...identity, location })
      window.location.replace(path)
    } catch (failure) {
      setError(failure.message)
      setBusy(false)
    }
  }

  return <main className="account-page">
    <section className="account-panel" aria-labelledby="invitation-title">
      <h1 id="invitation-title">{invitation?.title ?? 'Exam invitation'}</h1>
      {error && <p className="notice" role="alert">{error}</p>}
      {invitation ? <>
        <p>Start by {formatDate(invitation.expiresAt)} using the email address that received this invitation.</p>
        <form className="account-form" onSubmit={start}>
          <div className="account-names">
            <label>First name<input name="firstName" autoComplete="given-name" required maxLength={80} /></label>
            <label>Last name<input name="lastName" autoComplete="family-name" required maxLength={80} /></label>
          </div>
          <label>Email<input name="email" type="email" autoComplete="email" required maxLength={254} /></label>
          <p className="muted">The administrator can review your IP address, browser information, and exam evidence. You can also share your approximate location.</p>
          <button className="button secondary" type="button" disabled={busy || locating} onClick={() => {
            if (location) { setLocation(null); setLocationStatus('Location removed.') }
            else shareLocation()
          }}>{locating ? 'Requesting location…' : location ? 'Remove location' : 'Share location (optional)'}</button>
          {locationStatus && <p role="status">{locationStatus}</p>}
          <p className="muted">The exam requests screen sharing and takes periodic webcam photos on non-video questions.</p>
          <button className="button primary" disabled={busy || locating}>{busy ? 'Starting exam…' : 'Start exam'}</button>
        </form>
      </> : !error && <p role="status">Checking invitation…</p>}
    </section>
  </main>
}

export default function CandidateExam({ setId }) {
  const [assigned, setAssigned] = useState(null)
  const [catalogError, setCatalogError] = useState('')
  const { progress, ready, busy, timings, saveError, loadError,
    loadProgress, updateAttempt, finishAttempt, flushDraft } = useAttemptProgress()

  useEffect(() => {
    void loadProgress()
    localApi('catalog').then(({ sets }) => setAssigned(sets.find(set => set.id === setId)))
      .catch(failure => setCatalogError(failure.message))
  }, [setId])

  const attempt = progress.attempts[setId] ?? newAttempt()
  const timing = timings[attempt.draftId] ?? attempt.activity
  const set = attempt.practiceSet ?? timing?.practiceSet ?? assigned
  const position = Math.min(attempt.index ?? 0, (set?.questions.length ?? 1) - 1)
  const questionType = set?.questions[position]?.type
  if (attempt.submitted) return <main className="account-page"><section className="account-panel">
    <h1>Exam submitted</h1><p>Your responses have been saved for review.</p>
  </section></main>

  return <main className={'workspace candidate-workspace' + (questionType === 'coding' ? ' coding-workspace' : questionType === 'video' ? ' video-workspace' : '')}>
    {(catalogError || loadError || saveError) && <p className="notice" role="alert">{catalogError || loadError || saveError}</p>}
    {ready && set ? <Exam candidate set={set} attempt={attempt} position={position} timing={timing}
      update={update => updateAttempt(setId, update, position)}
      openQuestion={index => { if (index !== position) updateAttempt(setId, previous => previous, index) }}
      pinned={Boolean(attempt.practiceSet || timing?.practiceSet)} flushDraft={flushDraft}
      busy={busy} submit={async () => (await finishAttempt('submit', setId, position)).error} />
      : !catalogError && !loadError && <p role="status">Loading your exam…</p>}
  </main>
}
