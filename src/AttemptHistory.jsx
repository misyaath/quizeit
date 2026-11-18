import React from 'react'
import { practicePassPercent } from './attempts.js'
import { formatScore, formatDate, PassBadge } from './AttemptDisplay.jsx'

export default function AttemptHistory({ history, openAttempt }) {
  const groups = new Map()
  for (const attempt of history) {
    if (!groups.has(attempt.setId)) groups.set(attempt.setId, [])
    groups.get(attempt.setId).push(attempt)
  }
  const passed = history.filter(attempt => attempt.passed).length
  return <>
    <header className="bank-heading"><h1>Attempt history</h1><p>Saved in the local attempts file. The practice pass mark is {practicePassPercent}% correct.</p></header>
    <dl className="score-grid stat-grid history-stats">
      <div className="score-card"><dt>Total attempts</dt><dd>{history.length}</dd></div>
      <div className="score-card"><dt>Passed</dt><dd>{passed}</dd></div>
      <div className="score-card"><dt>Failed</dt><dd>{history.length - passed}</dd></div>
    </dl>
    <section className="dashboard-section" aria-labelledby="saved-attempts">
      <div className="section-heading"><h2 id="saved-attempts">Saved attempts</h2></div>
      {history.length === 0 && <p className="notice">Submit a practice set to see your first attempt here.</p>}
      <div className="history-groups">
        {[...groups.entries()].sort(([, a], [, b]) => (b.at(-1).submittedAt ?? '').localeCompare(a.at(-1).submittedAt ?? '')).map(([setId, attempts]) => {
          const passed = attempts.filter(attempt => attempt.passed).length
          return <details className="history-group" key={setId}>
            <summary><strong>{attempts.at(-1).title}</strong><span>{attempts.length} {attempts.length === 1 ? 'attempt' : 'attempts'} · {passed} passed · {attempts.length - passed} failed</span></summary>
            <ul className="history-list">
              {attempts.slice().reverse().map((attempt, index) => <li key={attempt.id}>
                <div><h3>Attempt {attempts.length - index}</h3><p>{formatDate(attempt.submittedAt)}</p></div>
                <PassBadge passed={attempt.passed} />
                <span className="history-score">{formatScore(attempt.correct, attempt.total)} <small>{attempt.correct} / {attempt.total} correct</small></span>
                <button className="button small secondary" onClick={() => openAttempt(attempt.id)} aria-label={`View details for attempt ${attempts.length - index} of ${attempt.title}`}>View details →</button>
              </li>)}
            </ul>
          </details>
        })}
      </div>
    </section>
  </>
}
