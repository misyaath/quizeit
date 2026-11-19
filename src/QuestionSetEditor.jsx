import React, { useEffect, useState } from 'react'
import { localApi } from './local-api.js'
import CategoryFields, { matchesCategory } from './CategoryFields.jsx'
import { codingLanguages, projectLanguages } from './coding.js'
import { domains, formats, generalDomain } from './questions/index.js'
import { examField, questionLimitFields, questionTimeField, setLimitFields } from './execution-settings.js'

const emptySet = () => ({ title: '', questions: [], providerId: '', examId: '', providerName: '', examName: '', sharing: 'private', revision: null })
const newQuestion = type => ({
  type, domain: 'general', prompt: '', explanation: '',
  ...(['single', 'multi'].includes(type) && { options: ['', ''], answer: type === 'single' ? '' : [] }),
  ...(type === 'text' && { answer: [''] }),
  ...(type === 'order' && { answer: ['', ''] }),
  ...(type === 'match' && { labels: ['', ''], answer: ['', ''] }),
  ...(type === 'coding' && { languages: [{ id: 'python', starter: '', solution: '' }], tests: [{ label: 'Example', stdin: '', expected: '', hidden: false }] }),
})
const replace = (items, index, value) => items.map((item, position) => position === index ? value : item)
const remove = (items, index) => items.filter((_, position) => position !== index)
const setFields = setLimitFields.map(field => ({
  ...field, label: field === examField ? 'Total set time (minutes)'
    : field === questionTimeField ? 'Default time per question (minutes)' : field.label,
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
  if (type === 'coding') return <CodingFields question={question} update={update} />
  if (type === 'single' || type === 'multi') return <>
    <h3>Options and correct answers</h3>
    <Rows items={options} label="option" add={() => ''} onChange={values => update({
      options: values, answer: type === 'single' ? values.includes(answer) ? answer : '' : answer.filter(item => values.includes(item)),
    })} render={(option, index, change) => <>
      <Text label={'Option ' + (index + 1)} value={option} onChange={change} required />
      <label><input type={type === 'single' ? 'radio' : 'checkbox'} name={type === 'single' ? 'correct-option' : undefined}
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

function QuestionEditor({ question, onChange }) {
  const update = fields => onChange({ ...question, ...fields })
  const study = question.caseStudy
  return <div className="question-author-fields">
    <div className="author-pair">
      <label className="editor-field">Question type<select value={question.type} onChange={event => onChange({
        ...newQuestion(event.target.value), id: question.id, prompt: question.prompt, explanation: question.explanation,
        domain: question.domain, caseStudy: question.caseStudy, exhibits: question.exhibits,
        limits: question.limits && Object.fromEntries(Object.entries(question.limits).filter(([name]) => event.target.value === 'coding' || name === 'questionMinutes')),
      })}>{Object.entries(formats).map(([id, format]) => <option value={id} key={id}>{format.label}</option>)}</select></label>
      <label className="editor-field">Domain<select value={question.domain} onChange={event => update({ domain: event.target.value })}>
        {[generalDomain, ...domains].map(domain => <option value={domain.id} key={domain.id}>{domain.name}</option>)}
      </select></label>
    </div>
    <Text label="Question prompt" multiline value={question.prompt} onChange={prompt => update({ prompt })} required />
    <Text label="Explanation" multiline value={question.explanation} onChange={explanation => update({ explanation })} required />
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

export default function QuestionSetEditor({ user, onSaved }) {
  const [list, setList] = useState(null)
  const [provider, setProvider] = useState('')
  const [exam, setExam] = useState('')
  const [form, setForm] = useState(null)
  const [questionIndex, setQuestionIndex] = useState(0)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [archive, setArchive] = useState(false)

  async function load() {
    try { setList(await localApi('question-sets')) } catch (failure) { setError(failure.message) }
  }
  useEffect(() => { void load() }, [])
  function apply(saved) {
    setForm({ ...saved.document, providerId: saved.providerId, examId: saved.examId, providerName: '', examName: '',
      revision: saved.revision, sharing: saved.private ? 'private' : 'shared' })
    setArchive(false)
  }
  async function open(id) {
    setBusy(true)
    setError('')
    setNotice('')
    try {
      apply(await localApi('question-sets/' + id))
      setQuestionIndex(0)
    } catch (failure) { setError(failure.message) }
    finally { setBusy(false) }
  }

  async function commit(event) {
    event.preventDefault()
    setBusy(true)
    setError('')
    setNotice('')
    try {
      if (archive) {
        await localApi('question-sets/' + form.id, 'DELETE', { revision: form.revision })
        setForm(null)
        setNotice('Question set archived.')
      } else {
        const saved = await localApi(form.id ? 'question-sets/' + form.id : 'question-sets', form.id ? 'PUT' : 'POST', form)
        apply(saved)
        setNotice('Question set saved.')
      }
      await Promise.all([load(), onSaved()])
    } catch (failure) { setError(failure.message) }
    finally { setBusy(false) }
  }

  const patch = values => setForm(current => ({ ...current, ...values }))
  const category = list?.categories.find(item => item.id === form?.providerId)
  const question = form?.questions[questionIndex]
  return <>
    <header className="section-heading"><div><h1>Manage question sets</h1></div>
      <button className="button primary" disabled={busy} onClick={() => {
        setForm(emptySet()); setQuestionIndex(0); setNotice(''); setError(''); setArchive(false)
      }}>New question set</button>
    </header>
    {error && <p className="notice" role="alert">{error}</p>}
    {notice && <p className="notice" role="status">{notice}</p>}
    {!form && list && <>
      <CategoryFields categories={list.categories} providerId={provider} examId={exam}
        onChange={(nextProvider, nextExam) => { setProvider(nextProvider); setExam(nextExam) }} />
      <div className="set-grid">
        {list.sets.filter(set => matchesCategory(set, provider, exam)).map(set => {
          const category = list.categories.find(item => item.id === set.providerId)
          const subcategory = category?.exams.find(item => item.id === set.examId)
          return <article className="set-card" key={set.id}>
            <div><h3>{set.title}</h3><p>{category?.name} · {subcategory?.name}</p><p>{set.count} questions · {set.private ? 'Private' : 'Shared'}</p></div>
            <button className="button small secondary" disabled={busy} onClick={() => open(set.id)}>Edit {set.title}</button>
          </article>
        })}
      </div>
      {!list.sets.some(set => matchesCategory(set, provider, exam)) && <p className="notice">No editable sets match these filters.</p>}
    </>}
    {form && <form onSubmit={commit} className="author-form question-panel">
      <fieldset disabled={busy || archive}>
        <legend>Question set</legend>
        <Text label="Set title" value={form.title} maxLength={160} required onChange={title => patch({ title })} />
        <CategoryFields categories={list?.categories ?? []} allowNew providerId={form.providerId} examId={form.examId}
          onChange={(providerId, examId) => patch({ providerId, examId, providerName: '', examName: '' })} />
        {!form.providerId && <Text label="New category name" value={form.providerName} maxLength={100} required onChange={providerName => patch({ providerName })} />}
        {!form.examId && <Text label="New subcategory name" value={form.examName} maxLength={100} required onChange={examName => patch({ examName })} />}
        {category && form.examId && <p className="muted">{category.name} · {category.exams.find(item => item.id === form.examId)?.name}</p>}
        <div className="author-pair">
          <Text label="Difficulty (1–10, optional)" type="number" min={1} max={10} value={form.difficulty}
            onChange={difficulty => patch({ difficulty: difficulty === '' ? undefined : Number(difficulty) })} />
          {user.role === 'admin' && !form.id && <label className="editor-field">Visibility<select value={form.sharing}
            onChange={event => patch({ sharing: event.target.value })}><option value="private">Private</option><option value="shared">Shared bank</option></select></label>}
        </div>
        <Limits fields={setFields} limits={form.limits} onChange={limits => patch({ limits })} />
      </fieldset>
      <fieldset disabled={busy || archive}>
        <legend>Questions</legend>
        <div className="author-question-bar">
          {form.questions.length > 0 && <label className="editor-field">Question<select value={questionIndex} onChange={event => setQuestionIndex(Number(event.target.value))}>
            {form.questions.map((item, index) => <option key={item.id ?? index} value={index}>{index + 1}. {item.prompt.trim().slice(0, 70) || formats[item.type].label}</option>)}
          </select></label>}
          <button className="button secondary" type="button" onClick={() => {
            setQuestionIndex(form.questions.length)
            patch({ questions: [...form.questions, newQuestion('single')] })
          }}>Add question</button>
          {question && <button className="text-button" type="button" onClick={() => {
            patch({ questions: remove(form.questions, questionIndex) })
            setQuestionIndex(Math.max(0, questionIndex - 1))
          }}>Delete question</button>}
        </div>
        {question && <QuestionEditor key={questionIndex} question={question}
          onChange={next => patch({ questions: replace(form.questions, questionIndex, next) })} />}
      </fieldset>
      {archive && <p className="notice">Archive this set? Saved attempts and results will still be available.</p>}
      <div className="ai-actions">
        <button className="button primary" disabled={busy || (!archive && !form.questions.length)}>{archive ? 'Confirm archive' : 'Save question set'}</button>
        {form.id && !archive && <button className="button secondary" type="button" disabled={busy} onClick={() => setArchive(true)}>Archive set</button>}
        <button className="button secondary" disabled={busy} type="button" onClick={() => {
          if (archive) setArchive(false)
          else { setForm(null); setError(''); setNotice('') }
        }}>{archive ? 'Cancel archive' : 'Back to question sets'}</button>
      </div>
    </form>}
  </>
}
