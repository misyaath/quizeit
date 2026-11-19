import React from 'react'

export const formatScore = (correct, total) => (correct * 100 / total).toLocaleString(undefined, { maximumFractionDigits: 1 }) + '%'
export const formatDate = date => date ? new Date(date).toLocaleString() : 'Submission date unavailable'

export function PassBadge({ passed }) {
  if (passed === null) return <span className="format">Pending review</span>
  return <span className={passed ? 'result-correct' : 'result-missed'}>{passed ? 'Passed' : 'Failed'}</span>
}
