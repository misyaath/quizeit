import React, { useState } from 'react'
import { domains, generalDomain, formats } from './questions/index.js'
import CategoryFields, { matchesCategory } from './CategoryFields.jsx'
import { CaseDetails, Exhibits, formatLabel } from './QuestionDetails.jsx'
import { AnswerKey } from './AnswerReview.jsx'
import { localApi } from './local-api.js'
import ExplainWithChatGPT from './ExplainWithChatGPT.jsx'

export default function QuestionBank({ catalog, goSettings }) {
  const [providerId, setProviderId] = useState('')
  const [examId, setExamId] = useState('')
  const sets = catalog.sets.filter(set => matchesCategory(set, providerId, examId))
  const allQuestions = sets.flatMap(set => set.questions)
  const [search, setSearch] = useState('')
  const [domainId, setDomainId] = useState('all')
  const [format, setFormat] = useState('all')
  const [setId, setSetId] = useState('all')
  const [limit, setLimit] = useState(40)
  const pool = setId === 'all' ? allQuestions : sets.find(set => set.id === setId)?.questions ?? []
  const matches = pool.filter(question => (domainId === 'all' || question.domain.id === domainId)
    && (format === 'all' || question.type === format)
    && [question.prompt, question.caseStudy?.title].some(value => value?.toLowerCase().includes(search.trim().toLowerCase())))

  return <>
    <header className="bank-heading"><h1>Question bank</h1><p>Browse all {allQuestions.length} questions and reveal the answer and explanation for each one.</p></header>
    <CategoryFields categories={catalog.categories} providerId={providerId} examId={examId}
      onChange={(provider, exam) => { setProviderId(provider); setExamId(exam); setSetId('all'); setLimit(40) }} />
    <div className="bank-filters" onChange={() => setLimit(40)}>
      <label className="filter-label">Search questions<input type="search" placeholder="Search by keyword" value={search} onChange={event => setSearch(event.target.value)} /></label>
      <label className="filter-label">Domain<select value={domainId} onChange={event => setDomainId(event.target.value)}>
        <option value="all">All domains</option>{[...domains, generalDomain].map(domain => <option key={domain.id} value={domain.id}>{domain.name}</option>)}
      </select></label>
      <label className="filter-label">Format<select value={format} onChange={event => setFormat(event.target.value)}>
        <option value="all">All formats</option>{Object.entries(formats).map(([type, item]) => <option key={type} value={type}>{item.label}</option>)}
      </select></label>
    </div>
    <div className="filter-label bank-set-filter"><label htmlFor="bank-practice-set">Practice set</label><select id="bank-practice-set" value={setId} onChange={event => { setSetId(event.target.value); setLimit(40) }}>
      <option value="all">All sets</option>{sets.map(set => <option key={set.id} value={set.id}>{set.title}</option>)}
    </select></div>
    <p className="muted" role="status">{matches.length} {matches.length === 1 ? 'question' : 'questions'}</p>
    <div className="review-list">
      {matches.slice(0, limit).map(question => <BankQuestion question={question} key={question.id} goSettings={goSettings} />)}
      {!matches.length && <p className="notice">No questions match your search and filters.</p>}
      {limit < matches.length && <button className="button secondary" onClick={() => setLimit(limit + 40)}>Show more questions</button>}
    </div>
  </>
}

function BankQuestion({ question, goSettings }) {
  const [answer, setAnswer] = useState(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function reveal() {
    setLoading(true)
    setError('')
    try { setAnswer(await localApi('bank/' + question.id + '/answer')) }
    catch (failure) { setError(failure.message) }
    finally { setLoading(false) }
  }

  return <details className="review-card bank-card" key={question.id}>
        <summary><span>{question.prompt}<small>{formatLabel(question)} · {question.domain.name}</small></span></summary>
        <div className="review-body">
          <CaseDetails study={question.caseStudy} />
          <Exhibits items={question.exhibits} />
          {question.type === 'match' && <><h4>Items to match</h4><ul>{question.labels.map(label => <li key={label}>{label}</li>)}</ul></>}
          {question.options && <><h4>{question.type === 'order' ? 'Available steps' : 'Options'}</h4><ul>{question.options.map(option => <li key={option}>{option}</li>)}</ul></>}
          {error && <p className="notice" role="alert">{error}</p>}
          {answer ? <><AnswerKey question={answer} />{answer.type !== 'video' && <ExplainWithChatGPT question={answer} goSettings={goSettings} />}</>
            : <button className="button secondary" disabled={loading} onClick={reveal}>{loading ? 'Loading answer…' : 'Reveal answer'}</button>}
        </div>
  </details>
}
