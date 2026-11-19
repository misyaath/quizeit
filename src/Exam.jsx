import React, { useEffect, useRef, useState } from 'react'
import { hasResponse, isAnswered } from './questions/index.js'
import CodingQuestion, { CodeExamples } from './CodingQuestion.jsx'
import ResizeHandle from './ResizeHandle.jsx'
import { ExamClock, useQuestionTime } from './AttemptActivity.jsx'
import { CaseDetails, Exhibits, formatLabel } from './QuestionDetails.jsx'
import QuestionInput, { instructionFor } from './QuestionInput.jsx'

export default function Exam({ set, attempt, position, timing, update, openQuestion, goHome, submit, busy, useVsCode, pinned }) {
  const [confirming, setConfirming] = useState(false)
  const [submitError, setSubmitError] = useState('')
  const [questionCollapsed, setQuestionCollapsed] = useState(false)
  const [questionWidth, setQuestionWidth] = useState(32)
  const { answers, flags } = attempt
  const question = set.questions[position]
  const coding = question.type === 'coding'
  const hideQuestion = coding && questionCollapsed
  const caseQuestions = question.caseStudy ? set.questions.filter(item => item.caseStudy?.title === question.caseStudy.title) : []
  const total = set.questions.length
  const answered = set.questions.filter(item => isAnswered(item, answers[item.id])).length
  const value = answers[question.id]
  const flagged = flags.includes(question.id)
  const heading = useRef(null)
  const dialog = useRef(null)
  const startingDraft = useRef(false)
  const clock = useQuestionTime(set.id, question.id, attempt.draftId, timing, pinned)

  useEffect(() => {
    if (!pinned && !startingDraft.current) {
      startingDraft.current = true
      update(previous => previous)
    }
  }, [pinned, update])

  useEffect(() => {
    if (confirming) dialog.current?.showModal()
    else dialog.current?.close()
  }, [confirming])

  function jump(next) {
    openQuestion(next)
    if (!hideQuestion) requestAnimationFrame(() => heading.current?.focus({ preventScroll: true }))
  }

  function setAnswer(transform) {
    update(previous => ({
      ...previous, answers: { ...previous.answers, [question.id]: transform(previous.answers[question.id]) },
    }))
  }

  return <>
    <button className="back-link" onClick={goHome}>← Practice exams</button>
    <header className="exam-heading"><div><h1>{set.title}</h1>
      {set.categoryName && <p>{[set.categoryName, set.subcategoryName].filter(Boolean).join(' · ')}</p>}
      <p>{answered} of {total} questions answered</p>
      <ExamClock clock={clock} /></div>
      <button className="button secondary" onClick={() => setConfirming(true)}>Submit set</button>
    </header>
    <progress className="progress" max={total} value={answered} aria-label="Questions answered" />
    <div className={coding ? 'exam-grid coding-grid' + (hideQuestion ? ' coding-grid-expanded' : '') : 'exam-grid'}
      style={coding ? { '--question-width': questionWidth + '%' } : undefined}>
      <div className="exam-question-column">
        {coding && <button className="button small question-toggle" aria-expanded={!hideQuestion} aria-controls="exam-question-panel"
          onClick={() => setQuestionCollapsed(collapsed => !collapsed)}>{hideQuestion ? 'Show question' : 'Hide question'}</button>}
        <section className="question-panel" id="exam-question-panel" aria-labelledby="question-heading" hidden={hideQuestion}>
          <div className="question-meta"><span>Question {position + 1} of {total}</span><span className="format">{formatLabel(question)}</span></div>
          <p className="domain">{question.domain.name}</p>
          {caseQuestions.length > 1 && <p className="domain">Case study question {caseQuestions.indexOf(question) + 1} of {caseQuestions.length}</p>}
          <CaseDetails study={question.caseStudy} />
          <Exhibits items={question.exhibits} />
          <h2 id="question-heading" tabIndex={-1} ref={heading}>{question.prompt}</h2>
          <p className="muted">{instructionFor(question)}</p>
          {coding ? <CodeExamples question={question} /> : <QuestionInput key={question.id} question={question} value={value}
            onChange={next => setAnswer(() => next)} />}
          <div className="question-actions">
            <button className="button secondary" disabled={position === 0} onClick={() => jump(position - 1)}>← Previous</button>
            <button className={'button secondary' + (flagged ? ' marked' : '')} aria-pressed={flagged} onClick={() => update(previous => ({
              ...previous,
              flags: previous.flags.includes(question.id) ? previous.flags.filter(id => id !== question.id) : [...previous.flags, question.id],
            }))}>{flagged ? 'Flagged' : 'Flag for review'}</button>
            {position === total - 1
              ? <button className="button primary" onClick={() => setConfirming(true)}>Submit set</button>
              : <button className="button primary" onClick={() => jump(position + 1)}>Next →</button>}
          </div>
        </section>
      </div>
      {coding && <>
        {!hideQuestion && <ResizeHandle className="coding-columns-resizer" orientation="vertical" label="Resize question and editor"
          value={questionWidth} min={22} max={60} step={3} measure={handle => 100 / handle.parentElement.clientWidth}
          onChange={setQuestionWidth} />}
        <CodingQuestion key={question.id} question={question} setId={set.id} draftId={attempt.draftId}
          value={value} onChange={setAnswer} disabled={busy} useVsCode={useVsCode} />
      </>}
      <aside className="navigator" aria-label="Question navigator">
        <h2>Question navigator</h2>
        <div className="question-numbers">
          {set.questions.map((item, target) => {
            const response = answers[item.id]
            const status = isAnswered(item, response) ? 'answered' : hasResponse(response) ? 'incomplete' : 'unanswered'
            const marked = flags.includes(item.id)
            return <button key={item.id} className={`question-number ${status}${marked ? ' flagged' : ''}`}
              aria-current={target === position ? 'step' : undefined}
              aria-label={`Question ${target + 1}, ${status}${marked ? ', flagged' : ''}`} onClick={() => jump(target)}>{target + 1}</button>
          })}
        </div>
        <div className="legend"><span><i /> Answered</span><span><i /> Flagged</span><span><i /> Incomplete</span></div>
        <button className="text-button" disabled={!hasResponse(value)} onClick={() => update(previous => {
          const next = { ...previous.answers }
          delete next[question.id]
          return { ...previous, answers: next }
        })}>Clear current answer</button>
      </aside>
    </div>
    <dialog className="submit-dialog" ref={dialog} onCancel={event => { if (busy) event.preventDefault(); else setConfirming(false) }} aria-labelledby="submit-title">
      <h2 id="submit-title">Submit {set.title.toLowerCase()}?</h2>
      <p>{answered} of {total} questions are fully answered. {answered < total && 'Unanswered or incomplete questions count as zero.'}</p>
      {submitError && <p role="alert">{submitError}</p>}
      <div className="dialog-actions">
        <button className="button secondary" disabled={busy} onClick={() => { setConfirming(false); setSubmitError('') }}>Keep practicing</button>
        <button className="button primary" disabled={busy} onClick={async () => {
          await clock.stop()
          const error = await submit()
          if (error) clock.restart()
          setSubmitError(error ?? '')
        }}>{busy ? 'Saving attempt…' : 'Submit and see results'}</button>
      </div>
    </dialog>
  </>
}
