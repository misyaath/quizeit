import React, { useEffect, useRef, useState } from 'react'
import { codingLanguages } from './coding.js'
import { summarizeLanguages } from './activity-metrics.js'

export function formatDuration(ms = 0) {
  const seconds = Math.max(0, Math.round(ms / 1000))
  const minutes = Math.floor(seconds / 60)
  return minutes ? minutes + 'm ' + seconds % 60 + 's' : seconds + 's'
}

export function useQuestionTime(setId, questionId, draftId, timing, enabled) {
  const tabId = useRef(null)
  const sequence = useRef(0)
  const queue = useRef(Promise.resolve())
  const controls = useRef({})
  const [snapshot, setSnapshot] = useState(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [now, setNow] = useState(() => performance.now())

  useEffect(() => {
    if (!draftId || !enabled) return
    tabId.current ??= crypto.randomUUID()
    let mounted = true
    let since = null
    let active = false
    let paused = false
    let finishing = false

    function send(action, background = false) {
      const time = performance.now()
      const durationMs = since === null ? 0 : Math.min(15_000, Math.floor(time - since))
      const payload = JSON.stringify({ setId, questionId, draftId, durationMs, action, tabId: tabId.current, sequence: ++sequence.current })
      const starting = action === 'start' || action === 'resume'
      since = active && action === 'tick' ? time : null
      if (action !== 'tick') active = false

      const task = queue.current.then(async () => {
        const response = await fetch('/api/progress/time', {
          method: 'POST', keepalive: background, headers: { 'Content-Type': 'application/json' }, body: payload,
        })
        const result = await response.json()
        if (!response.ok) throw new Error(result.error ?? 'Could not save time.')
        paused = result.paused
        active = result.active && !document.hidden && !finishing
        since = active ? (starting ? performance.now() : time) : null
        if (mounted) {
          setError('')
          setSnapshot({ ...result, setId, questionId, draftId, active, since })
        }
      }).catch(() => {
        if (mounted) setError('Could not save the timer. Resume it to retry.')
        since = null
        active = false
      })
      queue.current = task
      return task
    }

    function start() {
      if (!document.hidden && !finishing) void send('start')
    }
    const visibility = () => {
      if (document.hidden) void send('stop', true)
      else start()
    }
    const hide = () => void send('stop', true)
    const show = event => { if (event.persisted) start() }
    controls.current = {
      toggle: async () => {
        setSaving(true)
        try { await send(active && !paused ? 'pause' : 'resume') }
        finally { if (mounted) setSaving(false) }
      },
      stop: () => {
        finishing = true
        return send('stop', true)
      },
      restart: () => {
        finishing = false
        start()
      },
    }
    start()
    const checkpoint = setInterval(() => { if (active && !document.hidden && !finishing) void send('tick') }, 5000)
    const display = setInterval(() => setNow(performance.now()), 500)
    document.addEventListener('visibilitychange', visibility)
    window.addEventListener('pagehide', hide)
    window.addEventListener('pageshow', show)
    return () => {
      mounted = false
      clearInterval(checkpoint)
      clearInterval(display)
      document.removeEventListener('visibilitychange', visibility)
      window.removeEventListener('pagehide', hide)
      window.removeEventListener('pageshow', show)
      if (!finishing) void send('stop', true)
    }
  }, [setId, questionId, draftId, enabled])

  const saved = snapshot?.setId === setId && snapshot?.questionId === questionId && snapshot?.draftId === draftId ? snapshot : null
  const delta = saved?.active && !error ? Math.max(0, now - saved.since) : 0
  const totalMs = saved?.totalMs ?? Object.values(timing?.questions ?? {}).reduce((sum, question) => sum + (question.visibleMs ?? 0), 0)
  return {
    totalMs: totalMs + delta, questionMs: (saved?.questionMs ?? timing?.questions?.[questionId]?.visibleMs ?? 0) + delta,
    examMinutes: saved?.examMinutes ?? timing?.examMinutes ?? 0, questionMinutes: saved?.questionMinutes ?? 0,
    active: Boolean(saved?.active) && !error, paused: saved?.paused ?? Boolean(timing?.paused), ready: Boolean(saved || error),
    toggle: () => controls.current.toggle?.(), stop: () => controls.current.stop?.(), restart: () => controls.current.restart?.(),
    error, saving,
  }
}

export function ExamClock({ clock }) {
  const totalBudget = clock.examMinutes * 60_000
  const questionBudget = clock.questionMinutes * 60_000
  const totalOver = totalBudget > 0 && clock.totalMs >= totalBudget
  const questionOver = questionBudget > 0 && clock.questionMs >= questionBudget
  return <div className="practice-clock">
    <p className={totalOver ? 'exam-timer expired' : 'exam-timer'}>
      Set time {formatDuration(clock.totalMs)}{totalBudget > 0 && (totalOver ? ' · limit reached' : ' · ' + formatDuration(totalBudget - clock.totalMs) + ' remaining')}
    </p>
    <p className={questionOver ? 'exam-timer expired' : 'exam-timer'}>
      Question time {formatDuration(clock.questionMs)}{questionBudget > 0 && (questionOver ? ' · limit reached' : ' · ' + formatDuration(questionBudget - clock.questionMs) + ' remaining')}
    </p>
    <button type="button" className="button small secondary" onClick={clock.toggle} disabled={!clock.ready || clock.saving}>
      {clock.active ? 'Pause timer' : 'Resume timer'}
    </button>
    {clock.paused && <p className="muted">Timer paused</p>}
    {clock.error && <p role="alert">{clock.error}</p>}
  </div>
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
    ...(activity.activeMs !== undefined ? [['Active set time', formatDuration(activity.activeMs)]] : []),
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
