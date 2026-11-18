import React, { useMemo, useState } from 'react'
import CategoryFields, { matchesCategory } from './CategoryFields.jsx'
import { dashboardAttempts, dashboardReport } from './dashboard-data.js'
import { codingLanguages } from './coding.js'
import { formatDuration } from './AttemptActivity.jsx'
import { practicePassPercent } from './attempts.js'

const number = new Intl.NumberFormat(undefined, { maximumFractionDigits: 1 })
const date = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' })
const percent = value => number.format(value) + '%'
const attemptDate = at => Number.isFinite(at) ? date.format(at) : 'Date unavailable'
const count = (value, label) => number.format(value) + ' ' + label + (value === 1 ? '' : 's')

function ScoreTrend({ entries, openAttempt }) {
  const [selectedId, setSelectedId] = useState(null)
  const points = entries.filter(item => Number.isFinite(item.at)).slice(0, 12).reverse()
  const selected = points.find(item => item.attempt.id === selectedId) ?? points.at(-1)
  return <section className="analytics-panel" aria-labelledby="trend-heading">
    <div className="analytics-panel-header">
      <h2 id="trend-heading">Score trend</h2>
      {points.length > 0 && <span>{count(points.length, 'recent attempt')}</span>}
    </div>
    {selected ? <>
      <div className="trend-layout">
        <div className="trend-axis" aria-hidden="true"><span>100%</span><span>50%</span><span>0%</span></div>
        <div className="trend-scroll">
          <div className="trend-plot" style={{ '--points': points.length, '--pass-mark': practicePassPercent + '%' }} role="group" aria-label="Attempt scores in date order">
            <span className="trend-line" aria-hidden="true" />
            {points.map(({ attempt, score, at }) => <button key={attempt.id} type="button"
              className={'trend-slot' + (attempt.passed ? ' trend-pass' : '')}
              style={{ '--score': Math.max(1, score) + '%' }}
              aria-label={attempt.title + ', ' + attemptDate(at) + ', ' + percent(score)}
              aria-pressed={attempt.id === selected.attempt.id}
              onClick={() => setSelectedId(attempt.id)}
              title={attempt.title + ' · ' + percent(score)}><span aria-hidden="true" /></button>)}
          </div>
        </div>
      </div>
      <div className="trend-labels"><span>{attemptDate(points[0].at)}</span><span>{practicePassPercent}% practice pass mark</span><span>{attemptDate(points.at(-1).at)}</span></div>
      <div className="trend-selected" aria-live="polite">
        <div><strong>{percent(selected.score)}</strong><p>{selected.attempt.title}</p><small>{attemptDate(selected.at)} · {selected.attempt.correct}/{selected.attempt.total} correct</small></div>
        <button className="button small secondary" onClick={() => openAttempt(selected.attempt.id)}>Review attempt</button>
      </div>
    </> : <p className="analytics-empty">Scores appear here after you submit a dated attempt.</p>}
  </section>
}

function FocusAreas({ focus, domainCount }) {
  return <section className="analytics-panel" aria-labelledby="focus-heading">
    <div className="analytics-panel-header"><h2 id="focus-heading">Areas to review</h2><span>Lowest accuracy</span></div>
    {focus.length ? <ul className="analytics-focus">
      {focus.slice(0, 4).map(item => <li key={item.id}>
        <div><h3>{item.name}</h3><strong>{percent(100 * item.correct / item.total)}</strong></div>
        <progress value={item.correct} max={item.total} aria-label={item.name + ' accuracy'} />
        <p>{item.total - item.correct} missed · {item.total} scored</p>
      </li>)}
    </ul> : <p className="analytics-empty">{domainCount ? 'No missed questions in this selection.' : 'Complete a practice set to see accuracy by topic.'}</p>}
  </section>
}

function LanguageActivity({ languages }) {
  return <section className="analytics-panel" aria-labelledby="coding-activity-heading">
    <div className="analytics-panel-header"><h2 id="coding-activity-heading">Coding activity</h2><span>By programming language</span></div>
    {languages.length ? <div className="analytics-table" tabIndex={0} aria-label="Scrollable coding statistics">
      <table aria-label="Coding activity by language">
        <thead><tr><th scope="col">Language</th><th scope="col">Active editing</th><th scope="col">Edits</th><th scope="col">Saves</th><th scope="col">Example runs</th><th scope="col">Custom runs</th><th scope="col">Grading runs</th></tr></thead>
        <tbody>{languages.map(([language, stats]) => <tr key={language}>
          <th scope="row">{codingLanguages[language]?.label ?? language}</th>
          <td>{stats.editor ? formatDuration(stats.editor.activeMs) : '—'}</td>
          <td>{stats.editor?.editEvents ?? '—'}</td><td>{stats.editor?.saves ?? '—'}</td>
          <td>{stats.exampleRuns ?? 0}</td><td>{stats.customRuns ?? 0}</td><td>{stats.gradingRuns ?? 0}</td>
        </tr>)}</tbody>
      </table>
    </div> : <p className="analytics-empty">Submit a coding lab to see your activity here.</p>}
  </section>
}

function RecentAttempts({ entries, openAttempt, openHistory }) {
  return <section className="analytics-panel" aria-labelledby="recent-attempts-heading">
    <div className="analytics-panel-header">
      <h2 id="recent-attempts-heading">Recent attempts</h2>
      <button className="text-button" onClick={openHistory}>View history →</button>
    </div>
    {entries.length ? <ul className="analytics-attempts">
      {entries.slice(0, 5).map(({ attempt, score, at }) => <li key={attempt.id}>
        <button className="analytics-attempt" onClick={() => openAttempt(attempt.id)}>
          <span className="analytics-attempt-title"><strong>{attempt.title}</strong><small>{attemptDate(at)}</small></span>
          <span className="analytics-attempt-score"><strong>{percent(score)}</strong><small>{attempt.passed ? 'Passed' : 'Failed'}</small></span>
        </button>
      </li>)}
    </ul> : <p className="analytics-empty">No attempts match these filters.</p>}
  </section>
}

export default function StudyDashboard({ catalog, history, snapshots, openAttempt, openHistory, openPractice }) {
  const [providerId, setProviderId] = useState('')
  const [examId, setExamId] = useState('')
  const [setId, setSetId] = useState('')
  const [period, setPeriod] = useState('all')
  const attempts = useMemo(() => dashboardAttempts(history, snapshots, catalog.sets), [history, snapshots, catalog.sets])
  const category = attempts.filter(item => matchesCategory(item, providerId, examId))
  const practiceSets = [...new Map(category.slice().reverse().map(({ attempt }) => [attempt.setId, attempt.title]))]
    .sort(([, a], [, b]) => a.localeCompare(b))
  const threshold = new Date()
  threshold.setHours(0, 0, 0, 0)
  if (period !== 'all') threshold.setDate(threshold.getDate() - Number(period) + 1)
  const entries = category.filter(item => (!setId || item.attempt.setId === setId)
    && (period === 'all' || item.at >= Number(threshold)))
  const report = dashboardReport(entries)
  const cards = [
    ['Question accuracy', report.total ? percent(100 * report.correct / report.total) : '—', report.total ? report.correct + ' correct out of ' + report.total : ''],
    ['Pass rate', entries.length ? percent(100 * report.passed / entries.length) : '—', entries.length ? report.passed + ' passed · ' + (entries.length - report.passed) + ' failed' : ''],
    ['Submitted attempts', number.format(entries.length), entries.length ? count(new Set(entries.map(item => item.attempt.setId)).size, 'practice set') : ''],
    ['Time on questions', report.recordedTime ? formatDuration(report.visibleMs) : '—', report.recordedTime ? 'Time with a question visible' : 'No timing data'],
  ]

  return <div className="analytics-dashboard">
    <header className="analytics-header">
      <div><h1>Dashboard</h1><p>Track your practice scores and coding activity.</p></div>
      <button className="button primary" onClick={openPractice}>Practice exams →</button>
    </header>
    <div className="analytics-filters">
      <CategoryFields categories={catalog.categories} providerId={providerId} examId={examId}
        onChange={(provider, exam) => { setProviderId(provider); setExamId(exam); setSetId('') }} />
      <label className="filter-label">Practice set<select value={setId} onChange={event => setSetId(event.target.value)}>
        <option value="">All practice sets</option>
        {practiceSets.map(([id, title]) => <option key={id} value={id}>{title}</option>)}
      </select></label>
      <label className="filter-label">Period<select value={period} onChange={event => setPeriod(event.target.value)}>
        <option value="all">All time</option><option value="7">Last 7 days</option>
        <option value="30">Last 30 days</option><option value="90">Last 90 days</option>
      </select></label>
    </div>
    <dl className="analytics-metrics" aria-label="Practice totals">
      {cards.map(([label, value, note]) => <div key={label}><dt>{label}</dt><dd>{value}{note && <small>{note}</small>}</dd></div>)}
    </dl>
    {!history.length && <p className="analytics-first">Submit your first practice exam or coding lab to see results on this dashboard.</p>}
    <div className="analytics-overview">
      <ScoreTrend entries={entries} openAttempt={openAttempt} />
      <FocusAreas focus={report.focus} domainCount={report.domainCount} />
    </div>
    <LanguageActivity languages={report.languages} />
    <RecentAttempts entries={entries} openAttempt={openAttempt} openHistory={openHistory} />
  </div>
}
