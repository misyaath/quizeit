import React, { useEffect, useState } from 'react'
import { localApi } from './local-api.js'
import RouteLink from './RouteLink.jsx'
import { formatDate } from './AttemptDisplay.jsx'
import Results from './Results.jsx'
import { ReviewQueue } from './AttemptMediaReview.jsx'
import { defaultWebcamPhotoSeconds, maxWebcamPhotoSeconds, minWebcamPhotoSeconds } from './exam-media.js'

export default function RealExams({ navigate }) {
  const [catalog, setCatalog] = useState(null)
  const [selectedId, select] = useState('')
  const [error, setError] = useState('')
  const [reviewing, setReviewing] = useState(false)
  useEffect(() => {
    localApi('real-exams').then(setCatalog).catch(failure => setError(failure.message))
  }, [])

  const selected = catalog?.exams.find(exam => exam.id === selectedId)
  if (reviewing) return <ReviewQueue exam onClose={() => setReviewing(false)} />
  return <>
    <header className="section-heading author-heading">
      <h1>Real exams</h1>
      <div className="ai-actions">
        <RouteLink className="button secondary" to="exam-bank" navigate={navigate}>Exam question bank</RouteLink>
        <button className="button secondary" onClick={() => setReviewing(true)}>Review exam submissions</button>
      </div>
    </header>
    {error && <p className="notice" role="alert">{error}</p>}
    {!catalog && !error && <p role="status">Loading real exams…</p>}
    {catalog && <>
      <ExamBuilder sources={catalog.sources} onCreated={exam => {
        setCatalog(current => ({ ...current, exams: [exam, ...current.exams] }))
        select(exam.id)
      }} />
      <section className="dashboard-section" aria-labelledby="real-exam-invitations">
        <h2 id="real-exam-invitations">Candidate invitations</h2>
        {catalog.exams.length > 0 ? <label className="editor-field exam-selection">Exam
          <select value={selectedId} onChange={event => select(event.target.value)}>
            <option value="">Choose a real exam</option>
            {catalog.exams.map(exam => <option key={exam.id} value={exam.id}>{exam.title} · {exam.questionCount} questions</option>)}
          </select>
        </label> : <p className="muted">Create an exam to invite candidates.</p>}
        {selected && <Invitations key={selected.id} exam={selected} mailEnabled={catalog.mailEnabled} />}
      </section>
    </>}
  </>
}

function ExamBuilder({ sources, onCreated }) {
  const [rows, setRows] = useState([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const picked = new Set(rows.map(row => row.sourceId))
  const unused = sources.find(source => !picked.has(source.id))
  const total = rows.reduce((sum, row) => sum + Number(row.count), 0)

  function edit(key, values) {
    setRows(current => current.map(row => row.key === key ? { ...row, ...values } : row))
  }

  async function save(event) {
    event.preventDefault()
    const fields = new FormData(event.currentTarget)
    setBusy(true)
    setError('')
    setNotice('')
    try {
      onCreated(await localApi('real-exams', 'POST', {
        title: fields.get('title'), examMinutes: Number(fields.get('examMinutes')), webcamPhotoSeconds: Number(fields.get('webcamPhotoSeconds')),
        sources: rows.map(({ sourceId, count, minimumDifficulty }) => ({ sourceId, count: Number(count), minimumDifficulty: Number(minimumDifficulty) })),
      }))
      setNotice('Real exam created. You can now invite candidates.')
    } catch (failure) { setError(failure.message) }
    finally { setBusy(false) }
  }

  return <form className="question-panel author-form" onSubmit={save} aria-labelledby="create-real-exam">
    <h2 id="create-real-exam">Create a real exam</h2>
    <label className="editor-field">Exam title<input name="title" maxLength={160} required disabled={busy} /></label>
    <div className="author-pair">
      <label className="editor-field">Tracked time budget in minutes (0 to hide)<input name="examMinutes" type="number" min={0} max={600} defaultValue={0} required disabled={busy} /></label>
      <label className="editor-field">Webcam photo interval in seconds<input name="webcamPhotoSeconds" type="number" min={minWebcamPhotoSeconds}
        max={maxWebcamPhotoSeconds} defaultValue={defaultWebcamPhotoSeconds} required disabled={busy} /></label>
    </div>
    <fieldset disabled={busy}>
      <legend>Question sets</legend>
      {rows.map((row, index) => {
        const source = sources.find(item => item.id === row.sourceId)
        const available = source?.difficulty.filter(level => level >= Number(row.minimumDifficulty)).length ?? 0
        return <div className="editor-row" key={row.key}>
          <label className="editor-field">Question set {index + 1}<select value={row.sourceId} onChange={event => edit(row.key, { sourceId: event.target.value })}>
            {sources.filter(item => item.id === row.sourceId || !picked.has(item.id)).map(item => <option key={item.id} value={item.id}>{item.title}</option>)}
          </select></label>
          <div className="author-pair">
            <label className="editor-field">Number of questions<input type="number" min={1} max={Math.max(1, Math.min(available, 60))}
              value={row.count} required onChange={event => edit(row.key, { count: event.target.value })} /></label>
            <label className="editor-field">Minimum difficulty (1–10)<input type="number" min={1} max={10}
              value={row.minimumDifficulty} required onChange={event => edit(row.key, { minimumDifficulty: event.target.value })} /></label>
          </div>
          <p className="muted">{available} eligible questions</p>
          <button className="button small secondary" type="button" onClick={() => setRows(current => current.filter(item => item.key !== row.key))}>Remove question set</button>
        </div>
      })}
      {!sources.length && <p className="muted">Add questions to the exam bank first.</p>}
      <div className="ai-actions">
        <button className="button secondary" type="button" disabled={!unused} onClick={() =>
          setRows(current => [...current, { key: crypto.randomUUID(), sourceId: unused.id, count: 1, minimumDifficulty: 1 }])}>Add question set</button>
        <span className="muted">{total} / 60 questions</span>
      </div>
    </fieldset>
    {error && <p role="alert" className="notice">{error}</p>}
    {notice && <p role="status">{notice}</p>}
    <div><button className="button primary" disabled={busy || !rows.length || total > 60}>{busy ? 'Creating…' : 'Create exam'}</button></div>
  </form>
}

function Invitations({ exam, mailEnabled }) {
  const [entries, setEntries] = useState([])
  const [created, setCreated] = useState(null)
  const [review, setReview] = useState(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const endpoint = 'real-exams/' + exam.id + '/invitations'

  async function load() {
    try { setEntries(await localApi(endpoint)) }
    catch (failure) { setError(failure.message) }
  }
  useEffect(() => { void load() }, [endpoint])

  async function invite(event) {
    event.preventDefault()
    const fields = new FormData(event.currentTarget)
    const send = event.nativeEvent.submitter?.value === 'send'
    setBusy(true)
    setError('')
    setCreated(null)
    try {
      setCreated(await localApi(endpoint, 'POST', { email: fields.get('email'), days: Number(fields.get('days')), send }))
      await load()
    } catch (failure) { setError(failure.message) }
    finally { setBusy(false) }
  }

  async function openReview(entry) {
    setError('')
    try {
      const detail = await localApi('attempt-media/reviews/' + entry.id + '/' + entry.resultId)
      setReview({ ...detail, ownerId: entry.id })
    } catch (failure) { setError(failure.message) }
  }

  return <div className="exam-invitations">
    {error && <p role="alert" className="notice">{error}</p>}
    {review ? <Results set={review.set} attempt={review.attempt} backLabel="Invitations" goBack={() => setReview(null)}
      reviewOwnerId={review.ownerId} onVideoGraded={attempt => setReview(current => current && ({ ...current, attempt }))} /> : <>
      <form onSubmit={invite} className="question-panel author-form" aria-label="Invite a candidate">
        <div className="author-pair">
          <label className="editor-field">Candidate email<input type="email" name="email" maxLength={254} required disabled={busy} /></label>
          <label className="editor-field">Link expires after (days)<input type="number" name="days" min={1} max={365} defaultValue={7} required disabled={busy} /></label>
        </div>
        <div className="ai-actions">
          {mailEnabled && <button className="button primary" value="send" disabled={busy}>Send invitation email</button>}
          <button className={'button ' + (mailEnabled ? 'secondary' : 'primary')} value="copy" disabled={busy}>Create invitation link</button>
        </div>
        {created && <>
          <p role="status">{created.delivery === 'sent' ? 'Invitation emailed.' : created.delivery === 'failed'
            ? 'Email delivery failed. You can share the link below.' : 'Invitation link created.'} Expires {formatDate(created.expiresAt)}.</p>
          <label className="editor-field">Invitation link<input readOnly value={created.link} onFocus={event => event.target.select()} /></label>
        </>}
      </form>
      <div className="section-heading author-heading"><h3>Invited candidates</h3>
        <button className="button small secondary" onClick={load}>Refresh</button>
      </div>
      {entries.length === 0 && <p className="muted">No invitations yet.</p>}
      <ul className="history-list">{entries.map(entry => <li key={entry.id}>
        <div>
          <h3>{entry.firstName ? entry.firstName + ' ' + entry.lastName : entry.email}</h3>
          <p>{entry.firstName && entry.email + ' · '}{entry.resultId ? 'Submitted' : entry.startedAt ? 'Started'
            : Date.parse(entry.expiresAt) <= Date.now() ? 'Expired' : 'Invited'} · Link expires {formatDate(entry.expiresAt)}</p>
          {entry.verification && <details className="candidate-verification">
            <summary>Verification details</summary>
            <p>Started {formatDate(entry.startedAt)}</p>
            <p>IP address {entry.verification.ip ?? 'Unavailable'}</p>
            <p>{entry.verification.location ? 'Approximate location ' + entry.verification.location.latitude + ', ' + entry.verification.location.longitude
              : 'Approximate location unavailable'}</p>
            <p>{entry.verification.userAgent}</p>
          </details>}
        </div>
        {entry.resultId && <button className="button small secondary" onClick={() => openReview(entry)}>Review submission</button>}
      </li>)}</ul>
    </>}
  </div>
}
