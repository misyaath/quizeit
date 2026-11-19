import React, { useEffect, useRef, useState } from 'react'
import { formats } from './questions/index.js'
import AiActivity, { useAiActivity } from './AiActivity.jsx'
import { localAiApi, localApi } from './local-api.js'
import { attachmentExtensions, attachmentIssue } from './generation-attachments.js'

function encodeAttachment(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve({ name: file.name, base64: reader.result.split(',', 2)[1] })
    reader.onerror = () => reject(new Error('Could not read ' + file.name + '.'))
    reader.readAsDataURL(file)
  })
}

export default function GenerateSet({ active, savedSets, onGenerated, refreshCatalog, openSet, goSettings }) {
  const [models, setModels] = useState([])
  const [modelId, setModelId] = useState('')
  const [effort, setEffort] = useState('')
  const [modelError, setModelError] = useState('')
  const [loadingModels, setLoadingModels] = useState(false)
  const selectedModel = models.find(model => model.id === modelId)
  const [prompt, setPrompt] = useState('')
  const [attachments, setAttachments] = useState([])
  const [platformAttachments, setPlatformAttachments] = useState(false)
  const [attachmentError, setAttachmentError] = useState('')
  const fileInput = useRef(null)
  const [count, setCount] = useState(15)
  const [types, setTypes] = useState(() => Object.keys(formats).filter(type => type !== 'coding'))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [result, setResult] = useState(null)
  const [serverGeneration, setServerGeneration] = useState(null)
  const [canceling, setCanceling] = useState(false)
  const previousGeneration = useRef(null)
  const activity = useAiActivity()
  const resultHeading = useRef(null)

  async function loadModels() {
    setLoadingModels(true)
    setModelError('')
    try {
      const { models: available, platformAttachments } = await localApi('openai/models')
      setModels(available)
      setPlatformAttachments(Boolean(platformAttachments))
      setModelId(current => available.some(model => model.id === current) ? current : '')
      if (!available.length) setModelError('No eligible models are available for this ChatGPT account.')
    } catch (error) {
      setModels([])
      setModelError(error.message)
    } finally {
      setLoadingModels(false)
    }
  }

  function showServerGeneration(generation) {
    if (previousGeneration.current && !generation) void refreshCatalog()
    previousGeneration.current = generation
    setServerGeneration(generation)
  }

  useEffect(() => {
    if (!active) return
    void loadModels()
    let stopped = false
    let timer
    async function check() {
      try {
        const { generation } = await localApi('questions/generate/status')
        if (!stopped) showServerGeneration(generation)
      } catch {
        // The submit request still reports a server connection error.
      } finally {
        if (!stopped) timer = setTimeout(check, 1000)
      }
    }
    void check()
    return () => { stopped = true; clearTimeout(timer) }
  }, [active])

  async function cancel() {
    if (!serverGeneration?.cancellable || canceling) return
    setCanceling(true)
    setError('')
    try {
      const { generation } = await localApi('questions/generate/' + serverGeneration.id, 'DELETE')
      showServerGeneration(generation)
    } catch (error) {
      setError(error.message)
    } finally {
      setCanceling(false)
    }
  }

  useEffect(() => {
    if (result && active) resultHeading.current?.focus()
  }, [result, active])

  function attach(event) {
    const selection = Array.from(event.target.files ?? [])
    event.target.value = ''
    if (busy || serverGeneration || !selection.length) return
    const next = [...attachments, ...selection].filter((file, index, all) =>
      all.findIndex(item => item.name === file.name && item.size === file.size && item.lastModified === file.lastModified) === index)
    const issue = attachmentIssue(next, platformAttachments)
    setAttachmentError(issue)
    if (!issue) setAttachments(next)
  }

  async function generate(event) {
    event.preventDefault()
    if (busy || serverGeneration) return
    const issue = attachmentIssue(attachments, platformAttachments)
    setAttachmentError(issue)
    if (issue) return
    setError('')
    setResult(null)
    setBusy(true)
    activity.reset(attachments.length ? 'Reading attached files…' : 'Preparing your request…')
    try {
      const files = await Promise.all(attachments.map(encodeAttachment))
      const response = await localAiApi('questions/generate', {
        modelId, effort: selectedModel?.efforts.includes(effort) ? effort : '', prompt, count: Number(count), types,
        ...(files.length && { attachments: files }),
      }, activity.report)
      onGenerated(response.set, response.categories)
      setResult(response)
      activity.report('Question set saved.')
    } catch (error) {
      if (error.code === 'generation_active') activity.report('This request was not sent to OpenAI.')
      else if (error.code === 'generation_canceled') activity.report('Generation canceled. No set was saved.')
      else activity.report('Generation stopped.')
      if (error.code !== 'generation_canceled') setError(error.message)
    } finally {
      setBusy(false)
    }
  }

  const briefingLocked = busy || Boolean(serverGeneration)

  return <>
    <header className="bank-heading"><h1>Generate questions</h1><p>Describe what you want to practice. ChatGPT will file the set under a matching exam or create a relevant category if there’s no match.</p></header>
    <form className="generator-panel" onSubmit={generate}>
      <AiActivity stages={activity.stages} active={busy} onDismiss={activity.dismiss} />
      {serverGeneration && <div className="ai-activity">
        {!busy && <p className="ai-activity-current" role="status">{serverGeneration.message}</p>}
        <div className="ai-actions">
          <span className="muted">Running for {Math.max(0, Math.floor((Date.now() - serverGeneration.startedAt) / 1000))} seconds</span>
          <button type="button" className="button secondary" disabled={canceling || !serverGeneration.cancellable} onClick={cancel}>
            {canceling ? 'Canceling…' : 'Cancel generation'}
          </button>
        </div>
      </div>}
      <div className="generator-composer">
        <textarea aria-label="Question set prompt" rows={8} value={prompt} onChange={event => setPrompt(event.target.value)}
          maxLength={6000} required={!attachments.length} disabled={briefingLocked}
          placeholder="What would you like to practice? For example, create a challenging quiz on AKS troubleshooting with YAML examples." />
        {attachments.length > 0 && <ul className="generator-attachments" aria-label="Attached files">
          {attachments.map((file, index) => <li key={file.name + '-' + index}>
            <span title={file.name}>{file.name}</span>
            <button type="button" aria-label={'Remove ' + file.name} disabled={briefingLocked} onClick={() => {
              setAttachments(current => current.filter((_, offset) => offset !== index))
              setAttachmentError('')
            }}>×</button>
          </li>)}
        </ul>}
        <div className="generator-toolbar">
          <div className="generator-models">
            <div className="filter-label">
              <label htmlFor="generator-model">Model</label>
              <select id="generator-model" value={modelId} required disabled={busy || loadingModels || !models.length} onChange={event => {
                setModelId(event.target.value)
                setEffort('')
              }}>
                <option value="">{loadingModels ? 'Loading models…' : 'Choose a model'}</option>
                {models.map(model => <option value={model.id} key={model.id}>{model.name}</option>)}
              </select>
            </div>
            <div className="filter-label">
              <label htmlFor="generator-effort">Reasoning effort</label>
              <select id="generator-effort" value={selectedModel?.efforts.includes(effort) ? effort : ''} disabled={busy || !selectedModel}
                onChange={event => setEffort(event.target.value)}>
                <option value="">Model default</option>
                {selectedModel?.efforts.map(value => <option value={value} key={value}>{value === 'xhigh' ? 'Extra high' : value[0].toUpperCase() + value.slice(1)}</option>)}
              </select>
            </div>
          </div>
          <div className="generator-submit-actions">
            <input type="file" ref={fileInput} multiple accept={attachmentExtensions(platformAttachments).join(',')} hidden
              aria-label="Study attachments" disabled={briefingLocked} onChange={attach} />
            <button className="button small secondary" type="button" disabled={briefingLocked} onClick={() => fileInput.current?.click()}>Attach files</button>
            <button className="button primary generator-send" aria-label="Generate question set" title="Generate question set"
              disabled={briefingLocked || loadingModels || !selectedModel || (!prompt.trim() && !attachments.length) || !types.length || Number(count) < types.length}>
              <span aria-hidden="true">{busy ? '…' : '↑'}</span>
            </button>
          </div>
        </div>
      </div>
      <p className="generator-file-help">Up to 3 files and 10 MiB total. {platformAttachments
        ? 'PDF, Word, PowerPoint, Excel, and text formats.' : 'PDF and text formats. PDFs need selectable text.'}</p>
      {attachmentError && <p className="notice" role="alert">{attachmentError}</p>}
      {modelError && <div className="notice" role="alert">
        <p>{modelError}</p>
        <div className="ai-actions">
          <button type="button" className="button secondary" onClick={loadModels}>Reload models</button>
          <button type="button" className="text-button" onClick={goSettings}>Open Settings</button>
        </div>
      </div>}
      <label className="filter-label generator-count">Question count
        <input type="number" min={1} max={60} required value={count} onChange={event => setCount(event.target.value)} disabled={busy} />
      </label>
      <fieldset className="generator-formats" disabled={busy}>
        <legend>Question formats</legend>
        {Object.entries(formats).map(([type, format]) => <label key={type}>
          <input type="checkbox" checked={types.includes(type)} onChange={event => setTypes(current => event.target.checked
            ? [...current, type] : current.filter(item => item !== type))} /> {format.label}
        </label>)}
      </fieldset>
      {types.includes('coding') && <p className="muted">Name a programming language in your prompt, or use Python by default.</p>}
      {Number(count) < types.length && <p className="muted">Choose at least one question per selected format.</p>}
      {error && <p className="notice" role="alert">{error} {/connect/i.test(error) && <button className="text-button" type="button" onClick={goSettings}>Open Settings</button>}</p>}
    </form>
    {result && <section className="question-panel generator-panel" aria-labelledby="generated-set">
      <h2 id="generated-set" ref={resultHeading} tabIndex={-1}>{result.set.title}</h2>
      <p>{result.set.questions.length} questions · Model{result.models.length === 1 ? '' : 's'} {result.models.join(', ')}</p>
      <p>{result.category.providerName} → {result.category.examName}</p>
      {result.set.attachmentNames?.length > 0 && <p>Attachments: {result.set.attachmentNames.join(', ')}</p>}
      {result.set.studyFiles?.length > 0 && <p>Study files cited: {result.set.studyFiles.join(', ')}</p>}
      {result.set.sources?.length > 0 && <details>
        <summary>Web sources used ({result.set.sources.length})</summary>
        <ul>{result.set.sources.map(source => <li key={source.url}><a href={source.url} target="_blank" rel="noreferrer">{source.title}</a></li>)}</ul>
      </details>}
      <button className="button secondary" onClick={() => openSet(result.set.id)}>Start generated set →</button>
    </section>}
    {savedSets.length > 0 && <section className="question-panel generator-panel" aria-labelledby="saved-generated-sets">
      <h2 id="saved-generated-sets">Saved generated sets</h2>
      <ul className="history-list saved-generated-list">
        {savedSets.map(set => <li key={set.id}>
          <div><h3>{set.title}</h3><p>{set.questions.length} questions</p></div>
          <button className="button secondary" onClick={() => openSet(set.id)} aria-label={`Open ${set.title}`}>Open set →</button>
        </li>)}
      </ul>
    </section>}
  </>
}
