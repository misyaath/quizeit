import React, { useState } from 'react'
import AiActivity, { useAiActivity } from './AiActivity.jsx'
import { localAiApi } from './local-api.js'

export default function ExplainWithChatGPT({ question, attempt, onExplain, goSettings }) {
  const [bankReply, setBankReply] = useState(null)
  const reply = attempt ? attempt.explanations?.[question.id] : bankReply
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const activity = useAiActivity()

  async function explain() {
    setBusy(true)
    setError('')
    activity.reset('Preparing your explanation…')
    try {
      const result = await localAiApi('openai/explain', { attemptId: attempt?.id, questionId: question.id, refresh: Boolean(reply) }, activity.report)
      if (attempt) onExplain(attempt.id, question.id, result)
      else setBankReply(result)
      activity.report('Explanation ready.')
    } catch (error) {
      activity.report('Explanation stopped.')
      setError(error.message)
    } finally {
      setBusy(false)
    }
  }

  return <div className="ai-explanation">
    {reply && <div>
      <h4>AI explanation</h4><p className="ai-reply">{reply.text}</p>
      <p className="muted">{reply.model}{reply.source === 'chatgpt' ? ' · ChatGPT plan' : reply.source === 'openai-platform' ? ' · OpenAI Platform' : ''}{reply.incomplete ? ' · Response incomplete' : ''}</p>
      {reply.files?.length > 0 && <p>Study files cited: {reply.files.join(', ')}</p>}
      {reply.sources?.length > 0 && <details className="explanation-sources">
        <summary>Web sources used ({reply.sources.length})</summary>
        <ul>{reply.sources.map(source => <li key={source.url}><a href={source.url} target="_blank" rel="noreferrer">{source.title}</a></li>)}</ul>
      </details>}
    </div>}
    <div className="ai-actions">
      <button className="button secondary" disabled={busy} onClick={explain}>
        {busy ? 'Generating explanation…' : reply ? 'Refresh explanation' : 'Explain with ChatGPT'}
      </button>
    </div>
    <AiActivity stages={activity.stages} active={busy} onDismiss={activity.dismiss} />
    {error && <p role="alert">{error} <button className="text-button" onClick={goSettings}>Open Settings</button></p>}
  </div>
}
