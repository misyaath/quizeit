import React, { useEffect, useState } from 'react'
import { localApi } from './local-api.js'
import RouteLink, { Breadcrumbs } from './RouteLink.jsx'
import { ReviewQueue } from './AttemptMediaReview.jsx'
import { defaultWebcamPhotoSeconds, maxWebcamPhotoSeconds, minWebcamPhotoSeconds } from './exam-media.js'
import { defaultExamGrading, pointsFor } from '../packages/assessment/grading.js'
import { formats } from './questions/index.js'

export default function RealExams({ navigate }) {
  const [catalog, setCatalog] = useState(null)
  const [error, setError] = useState('')
  const [reviewing, setReviewing] = useState(false)
  useEffect(() => {
    localApi('real-exams').then(setCatalog).catch(failure => setError(failure.message))
  }, [])

  if (reviewing) return <ReviewQueue exam onClose={() => setReviewing(false)} />
  return <>
    <header className="section-heading author-heading">
      <h1>Real exams</h1>
      <div className="ai-actions">
        <RouteLink className="button secondary" to="exam-bank" navigate={navigate}>Exam question bank</RouteLink>
        <RouteLink className="button secondary" to="candidate-invitations" navigate={navigate}>Candidate invitations</RouteLink>
        <button className="button secondary" onClick={() => setReviewing(true)}>Review exam submissions</button>
      </div>
    </header>
    {error && <p className="notice" role="alert">{error}</p>}
    {!catalog && !error && <p role="status">Loading real exams…</p>}
    {catalog && <>
      <ExamBuilder sources={catalog.sources} onCreated={exam => {
        setCatalog(current => ({ ...current, exams: [exam, ...current.exams] }))
      }} />
      <section className="dashboard-section" aria-labelledby="saved-real-exams">
        <div className="section-heading"><h2 id="saved-real-exams">Saved exams</h2></div>
        {!catalog.exams.length && <p className="muted">No real exams yet.</p>}
        <ul className="history-list invitation-exam-list">{catalog.exams.map(exam => <li key={exam.id}>
          <div><h3>{exam.title}</h3><p>{exam.questionCount} questions</p></div>
          <div className="ai-actions">
            <RouteLink className="button small secondary" to={{ screen: 'real-exams', realExamId: exam.id }}
              aria-label={'View details for ' + exam.title} navigate={navigate}>View details</RouteLink>
            <RouteLink className="button small secondary" to={{ screen: 'candidate-invitations', invitationExamId: exam.id }}
              navigate={navigate}>Invite candidates</RouteLink>
          </div>
        </li>)}</ul>
      </section>
    </>}
  </>
}

const gradeFields = [
  ['passPercent', 'Pass mark (%)'],
  ['written', 'Points per written question'],
  ['coding', 'Points per coding question'],
  ['video', 'Points per video question'],
]

function readGrading(fields) {
  return {
    passPercent: Number(fields.get('passPercent')),
    marks: Object.fromEntries(gradeFields.slice(1).map(([name]) => [name, Number(fields.get(name))])),
  }
}

function GradingFields({ grading = defaultExamGrading, disabled }) {
  return <fieldset disabled={disabled}>
    <legend>Grading</legend>
    <div className="execution-limit-fields">{gradeFields.map(([name, label]) =>
      <label className="editor-field" key={name}>{label}
        <input name={name} type="number" min={1} max={100} required defaultValue={name === 'passPercent' ? grading.passPercent : grading.marks[name]} />
      </label>)}</div>
    <p className="muted">Coding earns full points when all tests pass. Reviewers can award partial points for video answers.</p>
  </fieldset>
}

export function ExamDetails({ id, navigate }) {
  const [exam, setExam] = useState(null)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)
  const path = 'real-exams/' + id
  useEffect(() => {
    localApi(path).then(setExam).catch(failure => setError(failure.message))
  }, [path])

  async function save(event) {
    event.preventDefault()
    const grading = readGrading(new FormData(event.currentTarget))
    setError('')
    setNotice('')
    setBusy(true)
    try {
      const updated = await localApi(path + '/grading', 'PUT', grading)
      setExam(current => ({ ...current, grading: updated.grading }))
      setNotice('Grading saved for future invitations.')
    } catch (failure) { setError(failure.message) }
    finally { setBusy(false) }
  }

  return <>
    <Breadcrumbs to="real-exams" label="Real exams" navigate={navigate}>{exam?.title ?? 'Exam details'}</Breadcrumbs>
    {error && <p role="alert" className="notice">{error}</p>}
    {!exam && !error && <p role="status">Loading exam details…</p>}
    {exam && <>
      <header className="section-heading author-heading">
        <div><h1>{exam.title}</h1><p>{exam.questionCount} questions · {exam.grading.passPercent}% pass mark</p></div>
        <RouteLink className="button secondary" to={{ screen: 'candidate-invitations', invitationExamId: id }}
          navigate={navigate}>Invite candidates</RouteLink>
      </header>
      <dl className="score-grid stat-grid">
        <div className="score-card"><dt>Tracked time budget</dt><dd>{exam.examMinutes ? exam.examMinutes + ' minutes' : 'No budget'}</dd></div>
        <div className="score-card"><dt>Webcam photo interval</dt><dd>{exam.webcamPhotoSeconds} seconds</dd></div>
      </dl>
      <form className="question-panel author-form" onSubmit={save} aria-label="Exam grading settings">
        <GradingFields grading={exam.grading} disabled={busy} />
        <p className="muted">Changes apply to future invitations. Each candidate keeps the grading rules assigned with their link.</p>
        {notice && <p role="status">{notice}</p>}
        <div><button className="button primary" disabled={busy}>{busy ? 'Saving…' : 'Save grading'}</button></div>
      </form>
      <section className="dashboard-section" aria-labelledby="exam-question-sources">
        <div className="section-heading"><h2 id="exam-question-sources">Question sources</h2></div>
        <div className="review-list">{exam.sources.map(source => <details className="question-panel" key={source.sourceId}>
          <summary><strong>{source.title}</strong> · Draw {source.count} of {source.questions.length} eligible · Difficulty {source.minimumDifficulty}+</summary>
          <ol className="exam-source-questions">{source.questions.map(question => <li key={question.id}>
            <div>{question.prompt}</div>
            <small className="muted">{formats[question.type].label} · Difficulty {question.difficulty} · {pointsFor(exam, question)} points</small>
          </li>)}</ol>
        </details>)}</div>
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
        grading: readGrading(fields),
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
    <GradingFields disabled={busy} />
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
