import React, { useEffect, useRef, useState } from 'react'
import { codingLanguages, codingOptions, codingSelection, maxCodeLength, maxRunOutput, projectFiles } from './coding.js'
import { localApi } from './local-api.js'
import ResizeHandle from './ResizeHandle.jsx'

export function CodeBlock({ label, text }) {
  return <div className="execution-block"><span>{label}</span><pre><code>{text || '(empty)'}</code></pre></div>
}

export function ExecutionResults({ result }) {
  if (!result) return null
  return <div className="execution-results">
    <p><strong>{result.mode === 'custom' ? 'Custom run' : `${result.tests.filter(test => test.passed).length} of ${result.tests.length} tests passed`}</strong> · {result.runtime}</p>
    {(Number.isFinite(result.cpuSeconds) || Number.isFinite(result.peakMemoryKiB)) && <p className="muted">
      {[
        Number.isFinite(result.cpuSeconds) && Number(result.cpuSeconds.toFixed(3)) + 's CPU used',
        Number.isFinite(result.peakMemoryKiB) && result.peakMemoryKiB + ' KiB peak memory',
      ].filter(Boolean).join(' · ')}
    </p>}
    {result.limits && <p className="muted">Limits {result.limits.cpuSeconds}s CPU · {result.limits.wallSeconds}s wall · {result.limits.memoryKiB / 1024} MiB</p>}
    {result.tests.map(test => <details key={test.label} open={!test.hidden}>
      <summary><span>{test.label}</span><span className={test.passed ? 'result-correct' : 'result-missed'}>
        {test.passed ? (result.mode === 'custom' ? 'Completed' : 'Passed') : test.hidden ? 'Failed' : test.status}
      </span></summary>
      {!test.hidden && <div className="execution-details">
        {test.expected !== undefined && <CodeBlock label="Expected" text={test.expected} />}
        <CodeBlock label="Output" text={test.stdout} />
        {test.compileOutput && <CodeBlock label="Compiler output" text={test.compileOutput} />}
        {test.stderr && <CodeBlock label="Errors" text={test.stderr} />}
        {test.time != null && <p className="muted">CPU {test.time} s{test.memory != null && ` · Memory ${test.memory} KiB`}</p>}
      </div>}
    </details>)}
  </div>
}

export function CodeExamples({ question }) {
  return <div className="coding-examples">
    {question.tests.map(test => <figure key={test.label}>
      <figcaption>{test.label}</figcaption>
      <CodeBlock label="Input" text={test.stdin} />
      <CodeBlock label="Expected output" text={test.expected} />
    </figure>)}
  </div>
}

export default function CodingQuestion({ question, value, setId, draftId, onChange, disabled, useVsCode }) {
  const language = value?.language ?? question.languages[0].id
  const label = codingLanguages[language].label
  const [session, setSession] = useState(null)
  const [available, setAvailable] = useState(codingOptions)
  const [retry, setRetry] = useState(0)
  const [status, setStatus] = useState(null)
  const [editorError, setEditorError] = useState('')
  const [consoleView, setConsoleView] = useState('output')
  const [consoleHeight, setConsoleHeight] = useState(250)
  const [running, setRunning] = useState(false)
  const [error, setError] = useState('')
  const runningRef = useRef(false)
  const mounted = useRef(false)
  const binding = useRef()
  binding.current = { value, onChange, disabled }
  const identity = { setId, questionId: question.id, draftId, language }
  const started = session?.language === language && session?.draftId === draftId
  const blocked = disabled || running
  const stdin = value?.stdin ?? ''
  const selection = codingSelection(question, language)
  const code = value?.code?.[language] ?? selection.starter
  const files = projectFiles(selection, value)

  useEffect(() => {
    mounted.current = true
    localApi('code/languages').then(({ languages }) => {
      if (mounted.current) setAvailable(languages)
    }).catch(() => {})
    return () => { mounted.current = false }
  }, [])

  useEffect(() => {
    if (!useVsCode || !draftId) return
    let mounted = true
    setEditorError('')
    setSession(null)
    setStatus(null)
    const request = { setId, questionId: question.id, draftId, language }
    localApi('editor/workspace', 'POST', request).then(session => {
      if (mounted) setSession({ ...session, language, draftId })
    }).catch(error => { if (mounted) setEditorError(error.message) })
    return () => { mounted = false }
  }, [setId, question.id, draftId, language, retry, useVsCode])

  useEffect(() => {
    if (!started) return
    let mounted = true
    let pending = false
    async function refresh() {
      if (pending || document.hidden) return
      pending = true
      try {
        const snapshot = await localApi('editor/workspace/status', 'POST', { setId, questionId: question.id, draftId, language })
        if (!mounted) return
        setStatus(snapshot)
        const { value, onChange, disabled } = binding.current
        if (disabled || runningRef.current || (!snapshot.edited && value?.code?.[language] === undefined)) return
        const previousFiles = value?.files?.[language] ?? {}
        if (snapshot.code === value?.code?.[language]
          && Object.entries(snapshot.files ?? {}).every(([path, source]) => previousFiles[path] === source)) return
        onChange(previous => ({ ...previous, language, code: { ...previous?.code, [language]: snapshot.code },
          files: { ...previous?.files, [language]: snapshot.files }, lastRun: previous?.lastRun }))
      } catch {
        if (mounted) setStatus(null)
      } finally {
        pending = false
      }
    }
    void refresh()
    const timer = setInterval(() => void refresh(), 2500)
    return () => { mounted = false; clearInterval(timer) }
  }, [started, setId, question.id, draftId, language])

  async function run(custom = false) {
    if (disabled || runningRef.current || !canRun) return
    runningRef.current = true
    setRunning(true)
    setError('')
    setConsoleView('output')
    try {
      const { code: savedCode, files: savedFiles, stats, ...result } = await localApi('code/run', 'POST', {
        ...identity, ...(!useVsCode && { code, files }), ...(custom && { stdin }),
      })
      if (!mounted.current) return
      onChange(previous => ({ ...previous, language, code: { ...previous?.code, [language]: savedCode },
        files: { ...previous?.files, [language]: savedFiles }, ...(custom && { stdin }), lastRun: result }))
      setStatus(previous => ({ ...previous, stats }))
    } catch (failure) {
      if (mounted.current) setError(failure.message)
    } finally {
      runningRef.current = false
      if (mounted.current) setRunning(false)
    }
  }

  const canRun = !blocked && Boolean(draftId) && (useVsCode ? started && status?.editorOnline : code.trim() || Object.keys(files).length)
  const starterIds = new Set(question.languages.map(item => item.id))
  const options = new Map(available.map(item => [item.id, item]))
  if (!options.has(language)) options.set(language, { id: language, label })
  const option = item => <option key={item.id} value={item.id} title={item.runtime}>{item.label}</option>
  return <section className="coding-ide" aria-label="Code workspace" style={{ '--console-height': consoleHeight + 'px' }}>
    <header className="coding-toolbar">
      <strong>{useVsCode ? 'VS Code' : 'Code editor'}</strong>
      <span className="editor-status" role="status">{status?.editorOnline ? 'Auto Save on' : started ? 'Connecting editor…' : useVsCode ? 'Workspace' : 'Saved with your draft'}</span>
      <label>Language <select value={language} disabled={blocked} onChange={event => {
        setError('')
        const next = event.target.value
        onChange(previous => ({ ...previous, language: next, code: previous?.code ?? {}, lastRun: undefined }))
      }}>
        <optgroup label="With starter files">
          {question.languages.map(({ id }) => option(options.get(id) ?? { id, label: codingLanguages[id].label }))}
        </optgroup>
        <optgroup label="Start with an empty file">
          {[...options.values()].filter(item => !starterIds.has(item.id)).map(option)}
        </optgroup>
      </select></label>
      {started && <a className="button small secondary" href={session.editorUrl} target="_blank" rel="noreferrer">Open in new tab ↗</a>}
    </header>
    <div className="coding-edit-area">
      {!useVsCode ? <div className="inline-code-editor">
        <label>{codingLanguages[language].filename}
          <textarea value={code} maxLength={maxCodeLength} spellCheck={false} disabled={blocked} onChange={event => {
            const source = event.target.value
            onChange(previous => ({ ...previous, language, code: { ...previous?.code, [language]: source } }))
          }} />
        </label>
        {selection.files?.map(file => <label key={file.path}>{file.path}
          <textarea value={files[file.path]} maxLength={maxCodeLength} spellCheck={false} disabled={blocked} onChange={event => {
            const source = event.target.value
            onChange(previous => ({ ...previous, language, code: previous?.code ?? {}, files: {
              ...previous?.files, [language]: { ...previous?.files?.[language], [file.path]: source },
            } }))
          }} />
        </label>)}
      </div> : started
        ? <iframe title="Visual Studio Code workspace" src={session.editorUrl} allow="clipboard-read; clipboard-write" />
        : <div className="editor-message" role={editorError ? 'alert' : 'status'}>
          <p>{editorError || 'Opening VS Code…'}</p>
          {editorError && <button className="button small secondary" onClick={() => setRetry(previous => previous + 1)}>Retry editor</button>}
        </div>}
    </div>
    <ResizeHandle orientation="horizontal" label="Resize console" value={consoleHeight} min={140} max={500}
      step={20} measure={() => -1} onChange={setConsoleHeight} />
    <div className="coding-output">
      <div className="coding-output-heading">
        <div className="console-views" role="group" aria-label="Console view">
          <button aria-pressed={consoleView === 'output'} onClick={() => setConsoleView('output')}>Output</button>
          <button aria-pressed={consoleView === 'input'} onClick={() => setConsoleView('input')}>Custom input</button>
        </div>
        <button className="button small primary" disabled={!canRun} onClick={() => run()}>
          {running ? 'Running…' : 'Run examples'}
        </button>
      </div>
      <div className="coding-console-body">
        {started && <p className="coding-run-meta">Judge0 limits · {session.limits.cpuSeconds}s CPU · {session.limits.wallSeconds}s wall · {session.limits.memoryMiB} MiB
          {status?.stats && <> · {status.stats.editEvents} edits · {status.stats.saves} saves</>}</p>}
        {consoleView === 'input' ? <form className="custom-input" onSubmit={event => { event.preventDefault(); void run(true) }}>
          <label htmlFor="coding-stdin">Program input (stdin)</label>
          <textarea id="coding-stdin" value={stdin} maxLength={maxRunOutput} disabled={blocked} spellCheck={false}
            placeholder="Enter the input your program should read" onChange={event => {
              const next = event.target.value
              onChange(previous => ({ ...previous, language, code: previous?.code ?? {}, stdin: next,
                lastRun: previous?.lastRun?.mode === 'custom' ? undefined : previous?.lastRun }))
            }} />
          <button className="button small primary" disabled={!canRun}>Run custom input</button>
        </form> : <>
          {error && <p className="coding-output-message" role="alert">{error}</p>}
          {running && <p className="coding-output-message" role="status">Saving files and running {label}…</p>}
          {!running && !error && !value?.lastRun && <p className="coding-output-message">Run the examples or try your own input.</p>}
          {!running && <ExecutionResults result={value?.lastRun} />}
        </>}
      </div>
    </div>
  </section>
}
