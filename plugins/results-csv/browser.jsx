import React, { useEffect, useState } from 'react'

function PracticeResults({ action, actionUrl }) {
  const [rows, setRows] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true
    action('results').then(result => { if (active) setRows(result) })
      .catch(failure => { if (active) setError(failure.message) })
    return () => { active = false }
  }, [])

  return <>
    <header className="section-heading author-heading">
      <h1>Export practice results</h1>
      <a className="button primary" href={actionUrl('download')}>Download CSV</a>
    </header>
    {error && <p className="notice" role="alert">{error}</p>}
    {!rows && !error && <p role="status">Loading results…</p>}
    {rows?.length === 0 && <p className="muted">No practice results to export.</p>}
    {rows?.length > 0 && <div className="analytics-table">
      <table aria-label="Practice results to export">
        <thead><tr><th scope="col">Question set</th><th scope="col">Submitted</th><th scope="col">Points</th><th scope="col">Result</th></tr></thead>
        <tbody>{rows.map(row => <tr key={row.id}>
          <th scope="row">{row.title}</th>
          <td>{new Date(row.submittedAt).toLocaleString()}</td>
          <td>{row.pointsEarned} / {row.pointsPossible}</td>
          <td>{row.passed === null ? 'Pending review' : row.passed ? 'Passed' : 'Failed'}</td>
        </tr>)}</tbody>
      </table>
    </div>}
  </>
}

export const pages = { results: PracticeResults }
