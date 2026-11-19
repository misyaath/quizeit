import React, { useEffect, useId, useRef, useState } from 'react'
import { maxCodeLength } from '../coding.js'

let monacoRequest
function loadMonaco() {
  if (!monacoRequest) {
    const stylesheet = document.createElement('link')
    stylesheet.rel = 'stylesheet'
    stylesheet.href = '/assets/code-editor.css'
    const stylesReady = new Promise((resolve, reject) => {
      stylesheet.onload = resolve
      stylesheet.onerror = reject
    })
    document.head.append(stylesheet)
    monacoRequest = Promise.all([import('/assets/code-editor.js'), stylesReady])
      .then(([monaco]) => monaco)
      .catch(error => {
        stylesheet.remove()
        monacoRequest = undefined
        throw error
      })
  }
  return monacoRequest
}

export default function MonacoCodeEditor({ language, mainFile, sources, disabled, onEdit }) {
  const [path, setPath] = useState(mainFile)
  const [ready, setReady] = useState(false)
  const [loadError, setLoadError] = useState(false)
  const [limitError, setLimitError] = useState(false)
  const [retry, setRetry] = useState(0)
  const container = useRef(null)
  const session = useRef(null)
  const latest = useRef(null)
  latest.current = { sources, onEdit, disabled }
  const project = useId()

  useEffect(() => {
    let disposed = false
    loadMonaco().then(monaco => {
      if (disposed) return
      const models = new Map()
      const current = { models, editor: null, activePath: mainFile }
      session.current = current
      try {
        for (const [filename, source] of Object.entries(latest.current.sources)) {
          const uri = monaco.Uri.from({ scheme: 'file', path: '/quizeit/' + project + '/' + filename })
          const model = monaco.editor.createModel(source, monaco.editorLanguage(language), uri)
          const entry = { model, source, view: null, syncing: false }
          models.set(filename, entry)
          entry.listener = model.onDidChangeContent(() => {
            if (entry.syncing) return
            const next = model.getValue()
            if (next.length > maxCodeLength) {
              setLimitError(true)
              writeModel(entry, entry.source)
              return
            }
            setLimitError(false)
            entry.source = next
            latest.current.onEdit(filename, next)
          })
        }
        current.editor = monaco.editor.create(container.current, {
          model: models.get(mainFile).model,
          ariaLabel: 'Edit ' + mainFile,
          theme: 'vs-dark',
          automaticLayout: true,
          readOnly: latest.current.disabled,
          minimap: { enabled: false },
          fontSize: 14,
          padding: { top: 10, bottom: 10 },
          scrollBeyondLastLine: false,
          wordBasedSuggestions: 'matchingDocuments',
          quickSuggestions: { other: true, comments: false, strings: false },
        })
        setReady(true)
      } catch (error) {
        disposeSession(current)
        session.current = null
        throw error
      }
    }).catch(() => { if (!disposed) setLoadError(true) })
    return () => {
      disposed = true
      if (session.current) disposeSession(session.current)
      session.current = null
    }
  }, [language, mainFile, project, retry])

  useEffect(() => {
    const current = session.current
    if (!ready || !current) return
    current.editor.updateOptions({ readOnly: disabled })
    for (const [filename, entry] of current.models) {
      const source = sources[filename]
      if (source !== entry.source) writeModel(entry, source)
    }
  }, [sources, disabled, ready])

  function selectFile(filename) {
    const current = session.current
    if (!current || filename === path) return
    const next = current.models.get(filename)
    current.models.get(current.activePath).view = current.editor.saveViewState()
    current.editor.setModel(next.model)
    current.editor.updateOptions({ ariaLabel: 'Edit ' + filename })
    if (next.view) current.editor.restoreViewState(next.view)
    current.activePath = filename
    setPath(filename)
  }

  return <div className="embedded-code-editor">
    <div className="code-file-tabs" role="group" aria-label="Project files">
      {Object.keys(sources).map(filename => <button key={filename} type="button" aria-pressed={path === filename}
        disabled={!ready || disabled} onClick={() => selectFile(filename)}>{filename}</button>)}
    </div>
    {limitError && <p className="code-editor-notice" role="alert">Each file can contain up to {maxCodeLength.toLocaleString()} characters.</p>}
    {!ready && <div className="editor-message" role={loadError ? 'alert' : 'status'}>
      <p>{loadError ? 'The code editor could not load.' : 'Loading code editor…'}</p>
      {loadError && <button type="button" className="button small secondary" onClick={() => {
        setLoadError(false)
        setRetry(value => value + 1)
      }}>Retry editor</button>}
    </div>}
    <div className="monaco-editor-host" ref={container} hidden={!ready} />
  </div>
}

function writeModel(entry, source) {
  entry.syncing = true
  entry.model.setValue(source)
  entry.source = source
  entry.syncing = false
}

function disposeSession(session) {
  session.editor?.dispose()
  for (const { listener, model } of session.models.values()) {
    listener?.dispose()
    model.dispose()
  }
}
