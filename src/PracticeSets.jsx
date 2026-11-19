import React from 'react'
import { domains, formats, isAnswered, isGeneratedSet } from './questions/index.js'
import CategoryFields, { matchesCategory } from './CategoryFields.jsx'
import RouteLink from './RouteLink.jsx'

const certification = 'https://learn.microsoft.com/en-us/credentials/certifications/azure-ai-cloud-developer-associate/'

export default function PracticeSets({ catalog, attempts, history, navigate, filters, onFilter }) {
  const { providerId, examId } = filters
  const sets = catalog.sets.filter(set => matchesCategory(set, providerId, examId))
  const questionCount = sets.reduce((sum, set) => sum + set.questions.length, 0)
  const generated = sets.filter(isGeneratedSet)
  const levels = sets.filter(set => !isGeneratedSet(set) && set.difficulty)
  const unranked = sets.filter(set => !isGeneratedSet(set) && !set.difficulty)
  const labs = unranked.filter(set => set.questions.every(question => question.type === 'coding'))
  const other = unranked.filter(set => !labs.includes(set))
  const completed = sets.filter(set => attempts[set.id]?.submitted).length
  const next = sets.find(set => attempts[set.id] && !attempts[set.id].submitted)
    ?? sets.find(set => set.difficulty && !attempts[set.id]?.submitted)
    ?? sets.find(set => !attempts[set.id]?.submitted) ?? sets[0]
  function renderSet(set) {
    const attempt = attempts[set.id]
    const answered = set.questions.filter(question => isAnswered(question, attempt?.answers[question.id])).length
    const result = attempt?.submitted && history.find(entry => entry.id === attempt.resultId)
    const status = result?.pendingReview ? 'Pending video review' : result ? `${result.correct}/${result.total} correct · ${result.passed ? 'Passed' : 'Failed'}`
      : attempt ? `${answered}/${set.questions.length} answered` : `${set.questions.length} questions`
    const category = catalog.categories.find(item => item.id === set.providerId)
    const subcategory = category?.exams.find(item => item.id === set.examId)
    return <article className="set-card" key={set.id}>
      {set.difficulty
        ? <span className="format">Difficulty {set.difficulty}/10</span>
        : <div className={'set-icon ' + (set.id === 'bonus' ? 'bonus-icon' : '')} aria-hidden="true">{set.id === 'bonus' ? '✦' : '☷'}</div>}
      <div><h3>{set.difficulty ? set.title.replace(/^Level \d+ · /, '') : set.title}</h3><p>{[set.categoryName ?? category?.name, set.subcategoryName ?? subcategory?.name].filter(Boolean).join(' · ')}</p><p>{set.mode === 'exam' && 'Exam · '}{status}</p></div>
      <RouteLink className="button small secondary" to={{ screen: 'exam', setId: set.id, section: attempt?.submitted ? 'result' : undefined }} navigate={navigate}
        aria-label={`${attempt?.submitted ? 'View results for' : attempt ? 'Resume' : 'Start'} ${set.title}`}>
        {attempt?.submitted ? 'Results' : attempt ? 'Resume' : 'Start'} <span aria-hidden="true">→</span>
      </RouteLink>
    </article>
  }

  return <>
    <div className="topline"><span>Exam preparation</span></div>
    <header className="hero">
      <div className="hero-art" aria-hidden="true"><i /><i /><i /><i /><b /><b /><b /></div>
      <div className="hero-content">
        <h1>Cloud certification practice</h1>
        <p>Filter practice sets by category and subcategory, or generate a question set for your own topic.</p>
        <RouteLink className="button primary" to={next ? { screen: 'exam', setId: next.id } : 'generate'} navigate={navigate}>
          {!next ? 'Generate questions' : completed === sets.length ? 'View practice results' : attempts[next.id] ? 'Resume practice' : 'Start practice'} <span aria-hidden="true">→</span>
        </RouteLink>
      </div>
      <div className="hero-stats">
        <div><strong>{questionCount}</strong><span>Practice questions</span></div>
        <div><strong>{Object.keys(formats).length}</strong><span>Practice formats</span></div>
        <div><strong>{completed}/{sets.length}</strong><span>Sets submitted</span></div>
      </div>
    </header>
    <section aria-labelledby="sets-heading" className="dashboard-section">
      <div className="section-heading"><div><h2 id="sets-heading">Practice sets</h2><p>Work through the questions at your own pace and see explanations after you submit.</p></div></div>
      <CategoryFields categories={catalog.categories} providerId={providerId} examId={examId}
        onChange={(providerId, examId) => onFilter({ providerId, examId })} />
      {labs.length > 0 && <><h3 className="set-group-heading">Coding labs</h3><div className="set-grid">{labs.map(renderSet)}</div></>}
      {generated.length > 0 && <><h3 className="set-group-heading">Generated sets</h3><div className="set-grid">{generated.map(renderSet)}</div></>}
      {levels.length > 0 && <><h3 className="set-group-heading">Case-study levels</h3><div className="set-grid">{levels.map(renderSet)}</div></>}
      {other.length > 0 && <><h3 className="set-group-heading">Practice sets</h3><div className="set-grid">{other.map(renderSet)}</div></>}
      {!sets.length && <p className="notice">No question sets match these filters.</p>}
    </section>
    {(!providerId || providerId === 'azure') && <section className="dashboard-section blueprint" aria-labelledby="expect-heading">
      <div>
        <h2 id="expect-heading">What to expect</h2>
        <p>Microsoft lists AI-200 as an intermediate, 120-minute exam. Expect applied decisions involving Python, Azure SDKs, containers, messaging, vector search, and production troubleshooting.</p>
        <p>Microsoft’s exam sandbox shows examples of multiple choice, case studies, build lists, drag and drop, hot areas, active screens, and labs. This app adds short-answer drills for recall.</p>
        <a href={certification} target="_blank" rel="noreferrer">Official AI-200 exam page ↗</a>
      </div>
      <div className="domain-list">
        {domains.map(domain => <div key={domain.id}><span>{domain.name}</span><b>{domain.weight}</b></div>)}
      </div>
    </section>}
  </>
}
