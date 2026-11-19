import React, { useEffect, useRef, useState } from 'react'
import { localApi } from './local-api.js'
import CategoryFields, { matchesCategory } from './CategoryFields.jsx'
import { codingLanguages, projectLanguages } from './coding.js'
import { domains, formats, generalDomain } from './questions/index.js'
import { examField, questionLimitFields, questionTimeField, setLimitFields } from './execution-settings.js'

import { defaultVideoSeconds, maxVideoSeconds } from './exam-media.js'
import RouteLink, { Breadcrumbs } from './RouteLink.jsx'

const emptySet = () => ({ title: '', questions: [], providerId: '', examId: '', providerName: '', examName: '', sharing: 'private', revision: null })
const newQuestion = type => ({
  type, domain: 'general', prompt: '', explanation: '',
  ...(['single', 'multi'].includes(type) && { options: ['', ''], answer: type === 'single' ? '' : [] }),
  ...(type === 'text' && { answer: [''] }),
  ...(type === 'order' && { answer: ['', ''] }),
  ...(type === 'match' && { labels: ['', ''], answer: ['', ''] }),
  ...(type === 'video' && { videoSeconds: defaultVideoSeconds }),
  ...(type === 'coding' && { languages: [{ id: 'python', starter: '', solution: '' }], tests: [{ label: 'Example', stdin: '', expected: '', hidden: false }] }),
})
const replace = (items, index, value) => items.map((item, position) => position === index ? value : item)
const remove = (items, index) => items.filter((_, position) => position !== index)
const setFields = setLimitFields.filter(field => field !== questionTimeField).map(field => ({
  ...field, label: field === examField ? 'Total set time (minutes)' : field.label,
}))

function Text({ label, value, onChange, multiline = false, ...props }) {
  const Input = multiline ? 'textarea' : 'input'
  return <label className="editor-field">{label}<Input value={value ?? ''} onChange={event => onChange(event.target.value)} {...props} /></label>
}

function Rows({ items, label, add, onChange, render, max = Infinity }) {
  return <div className="editor-rows">
    {items.map((item, index) => <div className="editor-row" key={index}>
      {render(item, index, value => onChange(replace(items, index, value)))}
      <button type="button" className="text-button" onClick={() => onChange(remove(items, index))}>Remove {label} {index + 1}</button>
    </div>)}
    <button className="button small secondary" type="button" disabled={items.length >= max} onClick={() => onChange([...items, add()])}>Add {label}</button>
  </div>
}

function Limits({ fields, limits = {}, onChange }) {
  return <div className="execution-limit-fields">
    {fields.map(({ name, label, min, max }) => <Text key={name} label={label} type="number" min={min} max={max}
      placeholder="Inherit" value={limits[name]} onChange={value => {
        const next = { ...limits }
        if (value === '') delete next[name]
        else next[name] = Number(value)
        onChange(next)
      }} />)}
  </div>
}

function ExhibitsEditor({ items = [], onChange }) {
  return <Rows items={items} label="exhibit" add={() => ({ title: '', code: '' })} onChange={onChange}
    render={(item, index, change) => <>
      <Text label={'Exhibit ' + (index + 1) + ' title'} value={item.title} onChange={title => change({ ...item, title })} required />
      <Text label="Exhibit code" value={item.code} multiline onChange={code => change({ ...item, code })} required />
    </>} />
}

function CodingFields({ question, update }) {
  return <>
    <h3>Languages and source files</h3>
    <Rows items={question.languages} label="language" max={Object.keys(codingLanguages).length}
      add={() => ({ id: Object.keys(codingLanguages).find(id => !question.languages.some(item => item.id === id)), starter: '', solution: '' })}
      onChange={languages => update({ languages })}
      render={(language, index, change) => <>
        <label className="editor-field">Language {index + 1}<select value={language.id} onChange={event => change({
          ...language, id: event.target.value, files: undefined,
        })}>
          {Object.entries(codingLanguages).filter(([id]) => id === language.id || !question.languages.some(item => item.id === id))
            .map(([id, item]) => <option value={id} key={id}>{item.label}</option>)}
        </select></label>
        <Text label="Starter code" multiline value={language.starter} onChange={starter => change({ ...language, starter })} />
        <Text label="Reference solution" multiline value={language.solution} onChange={solution => change({ ...language, solution })} required />
        {projectLanguages.includes(language.id) && <Rows items={language.files ?? []} label="project file" max={5}
          add={() => ({ path: '', starter: '', solution: '' })} onChange={files => change({ ...language, files: files.length ? files : undefined })}
          render={(file, number, editFile) => <>
            <Text label={'File ' + (number + 1) + ' path'} value={file.path} onChange={path => editFile({ ...file, path })} required />
            <Text label="File starter code" multiline value={file.starter} onChange={starter => editFile({ ...file, starter })} />
            <Text label="File solution" multiline value={file.solution} onChange={solution => editFile({ ...file, solution })} />
          </>} />}
      </>} />
    <h3>Tests</h3>
    <Rows items={question.tests} label="test" max={6} add={() => ({ label: '', stdin: '', expected: '', hidden: false })}
      onChange={tests => update({ tests })} render={(test, index, change) => <>
        <Text label={'Test ' + (index + 1) + ' label'} value={test.label} onChange={label => change({ ...test, label })} required maxLength={100} />
        <Text label="Standard input" multiline value={test.stdin} onChange={stdin => change({ ...test, stdin })} />
        <Text label="Expected output" multiline value={test.expected} onChange={expected => change({ ...test, expected })} />
        <label><input type="checkbox" checked={Boolean(test.hidden)} onChange={event => change({ ...test, hidden: event.target.checked })} /> Hidden grading test</label>
      </>} />
  </>
}

function AnswerFields({ question, update }) {
  const { type, options, labels, answer } = question
  if (type === 'video') return <Text label="Maximum video length (seconds)" type="number" min={5} max={maxVideoSeconds}
    value={question.videoSeconds ?? defaultVideoSeconds} onChange={value => update({ videoSeconds: Number(value) })} required />
  if (type === 'coding') return <CodingFields question={question} update={update} />
  if (type === 'single' || type === 'multi') return <>
    <h3>Options and correct answers</h3>
    <Rows items={options} label="option" add={() => ''} onChange={values => update({
      options: values, answer: type === 'single' ? values.includes(answer) ? answer : '' : answer.filter(item => values.includes(item)),
    })} render={(option, index, change) => <>
      <Text label={'Option ' + (index + 1)} value={option} onChange={change} required />
      <label><input type={type === 'single' ? 'radio' : 'checkbox'} name={type === 'single' ? 'correct-option-' + question.id : undefined}
        disabled={!option} checked={Boolean(option && (type === 'single' ? option === answer : answer.includes(option)))}
        onChange={() => update({ answer: type === 'single' ? option : answer.includes(option) ? answer.filter(item => item !== option) : [...answer, option] })} /> Correct option {index + 1}</label>
    </>} />
  </>
  if (type === 'match') return <>
    <h3>Matching pairs</h3>
    <Rows items={labels.map((label, index) => [label, answer[index]])} label="pair" add={() => ['', '']}
      onChange={pairs => update({ labels: pairs.map(pair => pair[0]), answer: pairs.map(pair => pair[1]), options: undefined })}
      render={([label, match], index, change) => <>
        <Text label={'Item ' + (index + 1)} value={label} onChange={next => change([next, match])} required />
        <Text label={'Match ' + (index + 1)} value={match} onChange={next => change([label, next])} required />
      </>} />
  </>
  return <>
    <h3>{type === 'order' ? 'Steps in the correct order' : 'Accepted answers'}</h3>
    <Rows items={answer} label={type === 'order' ? 'step' : 'answer'} add={() => ''}
      onChange={values => update({ answer: values, ...(type === 'order' && { options: undefined }) })}
      render={(value, index, change) => <Text label={(type === 'order' ? 'Step ' : 'Answer ') + (index + 1)} value={value} onChange={change} required />} />
  </>
}

function QuestionEditor({ question, onChange, examBank }) {
  const update = fields => onChange({ ...question, ...fields })
  const study = question.caseStudy
  return <div className="question-author-fields">
    <div className="author-pair">
      <label className="editor-field">Question type<select value={question.type} onChange={event => onChange({
        ...newQuestion(event.target.value), id: question.id, prompt: question.prompt, explanation: question.explanation,
        domain: question.domain, caseStudy: question.caseStudy, exhibits: question.exhibits, difficulty: question.difficulty,
        limits: question.limits && Object.fromEntries(Object.entries(question.limits).filter(([name]) => event.target.value === 'coding' || name === 'questionMinutes')),
      })}>{Object.entries(formats).map(([id, format]) => <option value={id} key={id}>{format.label}</option>)}</select></label>
      <label className="editor-field">Domain<select value={question.domain} onChange={event => update({ domain: event.target.value })}>
        {[generalDomain, ...domains].map(domain => <option value={domain.id} key={domain.id}>{domain.name}</option>)}
      </select></label>
    </div>
    {examBank && <Text label="Question difficulty (1–10)" type="number" min={1} max={10} placeholder="Inherit set difficulty"
      value={question.difficulty} onChange={difficulty => update({ difficulty: difficulty === '' ? undefined : Number(difficulty) })} />}
    <Text label="Question prompt" multiline value={question.prompt} onChange={prompt => update({ prompt })} required />
    <Text label={question.type === 'video' ? 'Grading guidance' : 'Explanation'} multiline value={question.explanation} onChange={explanation => update({ explanation })} required />
    <AnswerFields question={question} update={update} />
    <details open><summary>Timing and execution overrides</summary>
      <Limits fields={question.type === 'coding' ? questionLimitFields : questionLimitFields.slice(-1)}
        limits={question.limits} onChange={limits => update({ limits })} />
    </details>
    <details><summary>Case study and exhibits</summary>
      <label><input type="checkbox" checked={Boolean(study)} onChange={event => update({
        caseStudy: event.target.checked ? { title: '', background: '' } : undefined,
      })} /> Include a case study</label>
      {study && <>
        <Text label="Case study title" value={study.title} onChange={title => update({ caseStudy: { ...study, title } })} />
        <Text label="Case study background" multiline value={study.background} onChange={background => update({ caseStudy: { ...study, background } })} />
        <h3>Case study exhibits</h3>
        <ExhibitsEditor items={study.exhibits} onChange={exhibits => update({ caseStudy: { ...study, exhibits } })} />
      </>}
      <h3>Question exhibits</h3>
      <ExhibitsEditor items={question.exhibits} onChange={exhibits => update({ exhibits })} />
    </details>
  </div>
}

export default function QuestionSetEditor({ user, onSaved, navigate, editorId, creating, examBank = false }) {
  const [list, setList] = useState(null)
  const [provider, setProvider] = useState('')
  const [exam, setExam] = useState('')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  async function load() {
    setError('')
    try { setList(await localApi(examBank ? 'question-sets?mode=exam' : 'question-sets')) } catch (failure) { setError(failure.message) }
  }
  useEffect(() => { void load() }, [])

  const editing = creating || Boolean(editorId)
  const screen = examBank ? 'exam-bank' : 'authoring'
  const heading = examBank ? 'Exam question bank' : 'Manage question sets'
  function follow(route) {
    setNotice('')
    navigate(route)
  }
  function updateCatalog(message, destination) {
    setNotice(message)
    if (destination) navigate(destination, { replace: true })
    void load()
    void onSaved()
  }

  return <>
    {editing ? <Breadcrumbs to={screen} navigate={follow} label={heading}>
      {creating ? 'New question set' : 'Edit question set'}
    </Breadcrumbs> : <header className="section-heading">
      <h1>{heading}</h1>
      <RouteLink className="button primary" to={{ screen, section: 'new' }} navigate={follow}>New question set</RouteLink>
    </header>}
    {error && <p className="notice" role="alert">{error}</p>}
    {notice && <p className="notice" role="status">{notice}</p>}
    {editing ? <SetForm key={editorId ?? 'new'} editorId={editorId} user={user} categories={list?.categories ?? []}
      examBank={examBank} screen={screen} onStart={() => setNotice('')} onCommit={updateCatalog} /> : list && <>
      <CategoryFields categories={list.categories} providerId={provider} examId={exam}
        onChange={(nextProvider, nextExam) => { setProvider(nextProvider); setExam(nextExam) }} />
      <div className="set-grid">
        {list.sets.filter(set => matchesCategory(set, provider, exam)).map(set => {
          const category = list.categories.find(item => item.id === set.providerId)
          const subcategory = category?.exams.find(item => item.id === set.examId)
          return <article className="set-card" key={set.id}>
            <div><h3>{set.title}</h3><p>{category?.name} · {subcategory?.name}</p><p>{set.count} questions · {set.private ? 'Private' : 'Shared'}</p></div>
            <RouteLink className="button small secondary" to={{ screen, editorId: set.id }} navigate={follow}>Edit {set.title}</RouteLink>
          </article>
        })}
      </div>
      {!list.sets.some(set => matchesCategory(set, provider, exam)) && <p className="notice">No editable sets match these filters.</p>}
    </>}
  </>
}

function editableForm(saved) {
  return { ...saved.document, providerId: saved.providerId, examId: saved.examId, providerName: '', examName: '',
    revision: saved.revision, sharing: saved.private ? 'private' : 'shared' }
}

function SetForm({ editorId, user, categories, examBank, screen, onStart, onCommit }) {
  const [form, setForm] = useState(() => editorId ? null : { ...emptySet(), mode: examBank ? 'exam' : 'practice' })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [deleteError, setDeleteError] = useState('')
  const deleteDialog = useRef(null)
  const addButton = useRef(null)

  useEffect(() => {
    if (!editorId) return
    let active = true
    localApi('question-sets/' + editorId).then(saved => {
      if ((saved.document.mode === 'exam') !== examBank) throw new Error('This set is in a different question bank.')
      if (active) setForm(editableForm(saved))
    }).catch(failure => {
      if (active) setError(failure.message)
    })
    return () => { active = false }
  }, [editorId, examBank])

  const patch = values => setForm(current => ({ ...current, ...values }))

  function addQuestion() {
    const question = { ...newQuestion('single'), id: 'new-' + crypto.randomUUID() }
    patch({ questions: [...form.questions, question] })
    requestAnimationFrame(() => {
      const card = document.getElementById('author-' + question.id)
      if (!card) return
      card.open = true
      card.querySelector('textarea')?.focus()
    })
  }

  function deleteQuestion(index) {
    const questions = remove(form.questions, index)
    patch({ questions })
    requestAnimationFrame(() => {
      const next = questions[index] ?? questions[index - 1]
      const summary = next && document.getElementById('author-' + next.id)?.querySelector('summary')
      const focusTarget = summary || addButton.current
      focusTarget?.focus()
    })
  }

  async function commit(event) {
    event.preventDefault()
    const path = window.location.pathname
    onStart()
    setBusy(true)
    setError('')
    try {
      const saved = await localApi(editorId ? 'question-sets/' + editorId : 'question-sets', editorId ? 'PUT' : 'POST', form)
      if (editorId) setForm(editableForm(saved))
      const destination = !editorId && window.location.pathname === path ? { screen, editorId: saved.document.id } : undefined
      onCommit('Question set saved.', destination)
    } catch (failure) { setError(failure.message) }
    finally { setBusy(false) }
  }

  async function deleteSet() {
    const path = window.location.pathname
    onStart()
    setBusy(true)
    setDeleteError('')
    try {
      await localApi('question-sets/' + editorId, 'DELETE', { revision: form.revision })
      deleteDialog.current?.close()
      onCommit('Question set deleted.', window.location.pathname === path ? { screen } : undefined)
    } catch (failure) { setDeleteError(failure.message) }
    finally { setBusy(false) }
  }

  function revealInvalidControl(event) {
    let disclosure = event.target.closest('details')
    while (disclosure) {
      disclosure.open = true
      disclosure = disclosure.parentElement.closest('details')
    }
  }

  const category = categories.find(item => item.id === form?.providerId)
  return <>
    <header className="section-heading author-heading">
      <h1>{editorId ? form?.title || 'Edit question set' : 'New question set'}</h1>
      {editorId && form && <button className="button danger" type="button" disabled={busy} onClick={() => {
        setDeleteError('')
        deleteDialog.current.showModal()
      }}>Delete question set</button>}
    </header>
    {error && <p className="notice" role="alert">{error}</p>}
    {!form && !error && <p role="status">Loading question set…</p>}
    {form && <form onSubmit={commit} onInvalidCapture={revealInvalidControl} className="author-form question-panel">
      <details className="author-settings" open={!editorId}>
        <summary>Set settings</summary>
        <fieldset disabled={busy} aria-label="Set settings">
          <Text label="Set title" value={form.title} maxLength={160} required onChange={title => patch({ title })} />
          <CategoryFields categories={categories} allowNew providerId={form.providerId} examId={form.examId}
            onChange={(providerId, examId) => patch({ providerId, examId, providerName: '', examName: '' })} />
          {!form.providerId && <Text label="New category name" value={form.providerName} maxLength={100} required onChange={providerName => patch({ providerName })} />}
          {!form.examId && <Text label="New subcategory name" value={form.examName} maxLength={100} required onChange={examName => patch({ examName })} />}
          {category && form.examId && <p className="muted">{category.name} · {category.exams.find(item => item.id === form.examId)?.name}</p>}
          <div className="author-pair">
            <Text label="Difficulty (1–10, optional)" type="number" min={1} max={10} value={form.difficulty}
              onChange={difficulty => patch({ difficulty: difficulty === '' ? undefined : Number(difficulty) })} />
            {user.role === 'admin' && !examBank && !form.id && <label className="editor-field">Visibility<select value={form.sharing}
              onChange={event => patch({ sharing: event.target.value })}><option value="private">Private</option><option value="shared">Shared bank</option></select></label>}
          </div>
          <Limits fields={examBank ? setFields.filter(field => field.name !== examField.name) : setFields}
            limits={form.limits} onChange={limits => patch({ limits })} />
        </fieldset>
      </details>
      <fieldset className="author-questions" disabled={busy} aria-labelledby="author-questions-heading">
        <div className="author-question-bar">
          <h2 id="author-questions-heading">Questions <span className="muted">({form.questions.length})</span></h2>
          <div className="author-question-actions">
            <button className="button secondary" ref={addButton} type="button" onClick={addQuestion}><span aria-hidden="true">+</span> Add question</button>
            <button className="button primary" type="submit" disabled={!form.questions.length}>Save question set</button>
          </div>
        </div>
        {form.questions.map((question, index) => <details className="author-question" key={question.id} id={'author-' + question.id}>
          <summary>
            <span className="author-question-number">{index + 1}.</span>
            <span className="author-question-title">{question.prompt.trim() || 'New question'}</span>
            <span className="format">{formats[question.type].label}</span>
          </summary>
          <div className="author-question-body">
            <button className="button danger small" type="button" onClick={() => deleteQuestion(index)}>Delete question</button>
            <QuestionEditor question={question} examBank={examBank} onChange={next => patch({ questions: replace(form.questions, index, next) })} />
          </div>
        </details>)}
      </fieldset>
    </form>}
    <dialog ref={deleteDialog} className="submit-dialog" aria-labelledby="delete-set-title" onCancel={event => {
      if (busy) event.preventDefault()
    }}>
      <h2 id="delete-set-title">Delete question set?</h2>
      <p>This removes the set from the catalog. Saved attempts and results remain available.</p>
      {deleteError && <p role="alert">{deleteError}</p>}
      <div className="dialog-actions">
        <button className="button secondary" type="button" disabled={busy} onClick={() => deleteDialog.current.close()}>Cancel</button>
        <button className="button danger" type="button" disabled={busy} onClick={deleteSet}>{busy ? 'Deleting…' : 'Delete set'}</button>
      </div>
    </dialog>
  </>
}
