import React, { useState } from 'react'

export function useAiActivity() {
  const [stages, setStages] = useState([])
  return {
    stages,
    dismiss: () => setStages([]),
    reset: message => setStages([message]),
    report: message => setStages(current => current.at(-1) === message ? current : [...current, message].slice(-5)),
  }
}

export default function AiActivity({ stages, active, onDismiss }) {
  if (!stages.length) return null
  return <div className={'ai-activity' + (active ? ' ai-activity-running' : '')}>
    <div className="ai-activity-heading">
      <strong>Activity history</strong>
      {!active && <button type="button" className="ai-activity-close" aria-label="Close activity history" onClick={onDismiss}>
        <span aria-hidden="true">×</span>
      </button>}
    </div>
    <div className="ai-activity-current" role="status">
      <span className="ai-activity-dot" aria-hidden="true" />
      {stages.at(-1)}
    </div>
    {stages.length > 1 && <ul className="ai-activity-history">
      {stages.slice(0, -1).map((stage, index) => <li key={index}>{stage}</li>)}
    </ul>}
  </div>
}
