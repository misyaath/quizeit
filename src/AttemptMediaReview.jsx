import React, { useEffect, useState } from 'react'
import { localApi } from './local-api.js'
import { formatDate } from './AttemptDisplay.jsx'
import Results from './Results.jsx'

export function ReviewQueue({ onClose, refreshOwnHistory, exam = false }) {
  const [entries, setEntries] = useState(null)
  const [detail, setDetail] = useState(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function load() {
    try { setEntries((await localApi('attempt-media/reviews' + (exam ? '?mode=exam' : ''))).entries) }
    catch (failure) { setError(failure.message) }
  }
  useEffect(() => { void load() }, [])

  async function inspect(entry) {
    setBusy(true)
    setError('')
    try { setDetail({ ...(await localApi('attempt-media/reviews/' + entry.ownerId + '/' + entry.id)), entry }) }
    catch (failure) { setError(failure.message) }
    finally { setBusy(false) }
  }

  function updateGrade(attempt) {
    setDetail(current => current?.attempt.id === attempt.id ? { ...current, attempt } : current)
    void load()
    void refreshOwnHistory?.()
  }

  return <>
    {error && <p className="notice" role="alert">{error}</p>}
    {detail ? <>
      <p className="muted">Learner {detail.entry.learner}</p>
      <Results key={detail.attempt.id} set={detail.set} attempt={detail.attempt} backLabel={exam ? 'Exam submissions' : 'Submitted media'}
        goBack={() => setDetail(null)} reviewOwnerId={detail.entry.ownerId} onVideoGraded={updateGrade} />
    </> : <>
      <button className="back-link" onClick={onClose}>← {exam ? 'Real exams' : 'Attempt history'}</button>
      <h1>{exam ? 'Exam submissions' : 'Submitted media'}</h1>
      {!entries && !error && <p role="status">Loading submissions…</p>}
      {entries?.length === 0 && <p className="notice">{exam ? 'Submitted exams will appear here.' : 'Submitted practice videos will appear here.'}</p>}
      <ul className="history-list">{entries?.map(entry => <li key={entry.ownerId + '/' + entry.id}>
        <div><h3>{entry.title}</h3><p>{entry.learner} · {formatDate(entry.submittedAt)}</p></div>
        {entry.pendingReview > 0 && <span className="format">{entry.pendingReview} pending</span>}
        <button className="button secondary" onClick={() => inspect(entry)} disabled={busy}>Review submission</button>
      </li>)}</ul>
    </>}
  </>
}
