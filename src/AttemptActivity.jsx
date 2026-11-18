import React, { useEffect, useRef, useState } from 'react'
import { codingLanguages } from './coding.js'
import { summarizeLanguages } from './activity-metrics.js'

export function formatDuration(ms = 0) {
  const seconds = Math.max(0, Math.round(ms / 1000))
  const minutes = Math.floor(seconds / 60)
  return minutes ? minutes + 'm ' + seconds % 60 + 's' : seconds + 's'
}

export function useQuestionTime(setId, questionId, draftId) {
  const checkpoint = useRef(() => Promise.resolve())
  useEffect(() => {
    if (!draftId) return
    let since = document.hidden ? null : performance.now()
    function send(stop = false) {
      const now = performance.now()
      const durationMs = since === null ? 0 : Math.min(15_000, Math.floor(now - since))
      since = stop || document.hidden ? null : now
      if (!durationMs) return Promise.resolve()
      return fetch('/api/progress/time', { method: 'POST', keepalive: true,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ setId, questionId, draftId, durationMs }),
      }).catch(() => {})
    }
    checkpoint.current = () => send()
    const timer = setInterval(() => void send(), 5000)
    const visibility = () => void send(document.hidden)
    const unload = () => void send(true)
    document.addEventListener('visibilitychange', visibility)
    window.addEventListener('pagehide', unload)
    return () => {
      clearInterval(timer)
      document.removeEventListener('visibilitychange', visibility)
      window.removeEventListener('pagehide', unload)
      void send(true)
    }
  }, [setId, questionId, draftId])
  return checkpoint
}

export function ExamClock({ timing }) {
  const [now, setNow] = useState(Date.now)
  const deadline = timing?.examMinutes > 0 ? timing.startedAt + timing.examMinutes * 60_000 : 0
  useEffect(() => {
    if (!deadline) return
    setNow(Date.now())
    const tick = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(tick)
  }, [deadline])
  if (!deadline) return null
  const left = Math.max(0, deadline - now)
  return <p className={left ? 'exam-timer' : 'exam-timer expired'}>
    {left ? formatDuration(left) + ' remaining' : 'Exam time limit reached'}
  </p>
}

const languageLabel = id => codingLanguages[id]?.label ?? id

function LanguageTable({ rows, label }) {
  if (!rows.length) return null
  return <div className="activity-table"><table aria-label={label}>
    <thead><tr><th>Language</th><th>Edits</th><th>Single-character edits</th><th>Inserted</th><th>Deleted</th><th>Saves</th><th>Active editing</th><th>Example runs</th><th>Custom runs</th><th>Grading runs</th></tr></thead>
    <tbody>{rows.sort(([a], [b]) => languageLabel(a).localeCompare(languageLabel(b))).map(([id, stats]) => <tr key={id}>
      <th scope="row">{languageLabel(id)}</th>
      <td>{stats.editor?.editEvents ?? '—'}</td><td>{stats.editor?.singleCharacterEdits ?? '—'}</td>
      <td>{stats.editor?.insertedCharacters ?? '—'}</td><td>{stats.editor?.deletedCharacters ?? '—'}</td>
      <td>{stats.editor?.saves ?? '—'}</td><td>{stats.editor ? formatDuration(stats.editor.activeMs) : '—'}</td>
      <td>{stats.exampleRuns ?? 0}</td><td>{stats.customRuns ?? 0}</td><td>{stats.gradingRuns ?? 0}</td>
    </tr>)}</tbody>
  </table></div>
}

export function QuestionActivity({ stats, submittedLanguage }) {
  if (!stats && !submittedLanguage) return null
  const rows = Object.entries(stats?.languages ?? {})
  const editor = stats?.editor
  return <div className="question-activity">
    {submittedLanguage && <p><strong>Submitted language</strong> {languageLabel(submittedLanguage)}</p>}
    {stats && <p>{formatDuration(stats.visibleMs)} on question · {stats.exampleRuns ?? 0} example runs · {stats.customRuns ?? 0} custom runs</p>}
    {!!rows.length && <LanguageTable rows={rows} label="Question activity by language" />}
    {editor && !rows.length && <p>{editor.editEvents} edits · {editor.singleCharacterEdits} single-character edits · {editor.insertedCharacters} inserted · {editor.deletedCharacters} deleted · {editor.saves} saves · {formatDuration(editor.activeMs)} active editing</p>}
  </div>
}

export default function AttemptActivity({ activity, questions }) {
  if (!activity) return null
  const totals = Object.values(activity.questions).reduce((sum, question) => ({
    edits: sum.edits + (question.editor?.editEvents ?? 0),
    active: sum.active + (question.editor?.activeMs ?? 0),
    visible: sum.visible + (question.visibleMs ?? 0),
    examples: sum.examples + (question.exampleRuns ?? 0),
    custom: sum.custom + (question.customRuns ?? 0),
  }), { edits: 0, active: 0, visible: 0, examples: 0, custom: 0 })
  const cards = [
    ['Elapsed time', formatDuration(activity.elapsedMs)],
    ['Time on questions', formatDuration(totals.visible)],
    ['Active editing', formatDuration(totals.active)],
    ['Edit events', totals.edits],
    ['Example runs', totals.examples],
    ['Custom runs', totals.custom],
    ['Submission requests', activity.submissions],
  ]
  const languages = summarizeLanguages([activity])
  return <section className="dashboard-section" aria-labelledby="attempt-activity-heading">
    <div className="section-heading"><h2 id="attempt-activity-heading">Attempt activity</h2></div>
    {activity.examMinutes > 0 && <p className="muted">Exam timer {activity.examMinutes}m · {activity.timeLimitReached ? 'Time limit reached' : 'Submitted within time'}</p>}
    <dl className="score-grid">{cards.map(([label, value]) => <div className="score-card" key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>
    {!!languages.length && <div className="language-activity">
      <h3>Activity by programming language</h3>
      <LanguageTable rows={languages} label="Attempt activity by language" />
    </div>}
    {!!activity.runs.length && <details className="activity-runs">
      <summary>Run history</summary>
      <div className="activity-table"><table>
        <thead><tr><th>Time</th><th>Question</th><th>Action</th><th>Result</th><th>CPU used</th><th>Peak memory</th><th>Limits</th></tr></thead>
        <tbody>{activity.runs.map((run, i) => <tr key={run.startedAt + '-' + i}>
          <td>{new Date(run.startedAt).toLocaleString()}</td>
          <td>{questions.findIndex(question => question.id === run.questionId) + 1} · {languageLabel(run.language)}</td>
          <td>{{ examples: 'Examples', custom: 'Custom input', submit: 'Grading' }[run.mode]}</td>
          <td>{run.status === 'error' ? 'Error' : `${run.passed} passed, ${run.failed} failed`}</td>
          <td>{run.cpuSeconds === undefined ? '—' : Number(run.cpuSeconds.toFixed(3)) + 's'}</td>
          <td>{run.peakMemoryKiB === undefined ? '—' : run.peakMemoryKiB + ' KiB'}</td>
          <td>{run.limits ? `${run.limits.cpuSeconds}s CPU, ${run.limits.wallSeconds}s wall, ${run.limits.memoryKiB / 1024} MiB` : '—'}</td>
        </tr>)}</tbody>
      </table></div>
    </details>}
  </section>
}
