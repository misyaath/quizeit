import React, { useEffect, useState } from 'react'
import { formatDate } from './AttemptDisplay.jsx'
import { localApi } from './local-api.js'
import Results from './Results.jsx'
import RouteLink from './RouteLink.jsx'

export default function CandidateInvitations({ navigate, initialExamId = '' }) {
  const [catalog, setCatalog] = useState(null)
  const [examId, setExamId] = useState(initialExamId)
  const [review, setReview] = useState(null)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [manualLink, setManualLink] = useState('')
  const [busy, setBusy] = useState(false)

  async function load() {
    try { setCatalog(await localApi('exam-invitations')) }
    catch (failure) { setError(failure.message) }
  }
  useEffect(() => { void load() }, [])

  function clearFeedback() {
    setError('')
    setNotice('')
    setManualLink('')
  }

  async function invite(event) {
    event.preventDefault()
    const fields = new FormData(event.currentTarget)
    const send = event.nativeEvent.submitter?.value === 'send'
    clearFeedback()
    setBusy(true)
    try {
      const result = await localApi('real-exams/' + examId + '/invitations', 'POST', {
        email: fields.get('email'), days: Number(fields.get('days')), send,
      })
      setNotice(result.delivery === 'sent' ? 'Invitation emailed.' : result.delivery === 'failed'
        ? 'Email delivery failed. Copy the invitation link to share it.' : 'Invitation link created.')
      await load()
    } catch (failure) { setError(failure.message) }
    finally { setBusy(false) }
  }

  async function copyLink(entry, replace = false) {
    if (replace && !window.confirm('Replace this invitation link? The previous link will stop working.')) return
    clearFeedback()
    setBusy(true)
    try {
      const { link } = await localApi('exam-invitations/' + entry.id + '/link', replace ? 'POST' : 'GET')
      try {
        await navigator.clipboard.writeText(link)
        setNotice('Invitation link copied.')
      } catch {
        setManualLink(link)
      }
      if (replace) await load()
    } catch (failure) { setError(failure.message) }
    finally { setBusy(false) }
  }

  async function openReview(entry) {
    clearFeedback()
    try {
      const detail = await localApi('attempt-media/reviews/' + entry.id + '/' + entry.resultId)
      setReview({ ...detail, ownerId: entry.id })
    } catch (failure) { setError(failure.message) }
  }

  if (review) return <Results set={review.set} attempt={review.attempt} backLabel="Candidate invitations" goBack={() => setReview(null)}
    reviewOwnerId={review.ownerId} onVideoGraded={attempt => setReview(current => current && ({ ...current, attempt }))} />

  return <>
    <header className="section-heading author-heading">
      <h1>Candidate invitations</h1>
      <RouteLink className="button secondary" to="real-exams" navigate={navigate}>Real exams</RouteLink>
    </header>
    {error && <p role="alert" className="notice">{error}</p>}
    {!catalog && !error && <p role="status">Loading invitations…</p>}
    {catalog && <>
      {catalog.exams.length ? <form onSubmit={invite} className="question-panel author-form" aria-label="Invite a candidate">
        <label className="editor-field exam-selection">Exam
          <select value={examId} onChange={event => setExamId(event.target.value)} required disabled={busy}>
            <option value="">Choose a real exam</option>
            {catalog.exams.map(exam => <option key={exam.id} value={exam.id}>{exam.title} · {exam.questionCount} questions</option>)}
          </select>
        </label>
        <div className="author-pair">
          <label className="editor-field">Candidate email<input type="email" name="email" maxLength={254} required disabled={busy} /></label>
          <label className="editor-field">Link expires after (days)<input type="number" name="days" min={1} max={365} defaultValue={7} required disabled={busy} /></label>
        </div>
        <div className="ai-actions">
          {catalog.mailEnabled && <button className="button primary" value="send" disabled={busy}>Send invitation email</button>}
          <button className={'button ' + (catalog.mailEnabled ? 'secondary' : 'primary')} value="copy" disabled={busy}>Create invitation link</button>
        </div>
      </form> : <p className="muted">Create a real exam to invite candidates.</p>}
      <section className="dashboard-section" aria-labelledby="all-invitations">
        <div className="section-heading">
          <h2 id="all-invitations">All invitations</h2>
          <button className="button small secondary" disabled={busy} onClick={() => { clearFeedback(); void load() }}>Refresh</button>
        </div>
        {notice && <p role="status" className="notice">{notice}</p>}
        {manualLink && <label className="editor-field invitation-manual-link">Invitation link
          <input readOnly value={manualLink} onFocus={event => event.target.select()} autoFocus />
        </label>}
        {catalog.entries.length ? <div className="analytics-table invitation-table">
          <table aria-labelledby="all-invitations">
            <thead><tr>
              <th scope="col">Candidate</th><th scope="col">Exam</th><th scope="col">Status</th>
              <th scope="col">Expires at</th><th scope="col">Actions</th>
            </tr></thead>
            <tbody>{catalog.entries.map(entry => <tr key={entry.id}>
              <th scope="row">
                {entry.firstName && <div>{entry.firstName} {entry.lastName}</div>}
                <div>{entry.email}</div>
                {entry.verification && <Verification entry={entry} />}
              </th>
              <td>{entry.examTitle}</td>
              <td>{entry.resultId ? 'Submitted' : entry.status}</td>
              <td><time dateTime={entry.expiresAt}>{formatDate(entry.expiresAt)}</time></td>
              <td>
                {entry.linkAction === 'copy' && <button type="button" className="button small secondary invitation-copy" disabled={busy}
                  title="Copy invitation link" aria-label={'Copy invitation link for ' + entry.email} onClick={() => copyLink(entry)}>
                  <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
                    <rect x="8" y="8" width="12" height="12" rx="2" /><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2" />
                  </svg>
                </button>}
                {entry.linkAction === 'replace' && <button className="button small secondary" disabled={busy} onClick={() => copyLink(entry, true)}>Replace link</button>}
                {entry.resultId && <button className="button small secondary" onClick={() => openReview(entry)}>Review submission</button>}
                {!entry.resultId && !entry.linkAction && <span className="muted">—</span>}
              </td>
            </tr>)}</tbody>
          </table>
        </div> : <p className="muted">No invitations yet.</p>}
      </section>
    </>}
  </>
}

function Verification({ entry }) {
  const { ip, location, userAgent } = entry.verification
  return <details className="candidate-verification">
    <summary>Verification details</summary>
    <p>Started {formatDate(entry.startedAt)}</p>
    <p>IP address {ip ?? 'Unavailable'}</p>
    <p>{location ? 'Approximate location ' + location.latitude + ', ' + location.longitude : 'Approximate location unavailable'}</p>
    <p>{userAgent}</p>
  </details>
}
