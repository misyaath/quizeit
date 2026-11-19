import React, { useEffect, useRef, useState } from 'react'
import { domains, generalDomain, hasResponse, isAnswered, isCorrect } from './questions/index.js'
import { practicePassPercent } from './attempts.js'
import { CaseDetails, Exhibits, formatLabel } from './QuestionDetails.jsx'
import { formatScore, formatDate, PassBadge } from './AttemptDisplay.jsx'
import { FormattedAnswer, ReferenceSolutions, SubmittedFiles } from './AnswerReview.jsx'
import ExplainWithChatGPT from './ExplainWithChatGPT.jsx'
import { CodeBlock, ExecutionResults } from './CodingQuestion.jsx'
import { CaptureEvidence } from './CaptureEvidence.jsx'
import AttemptActivity, { QuestionActivity } from './AttemptActivity.jsx'
import { localApi } from './local-api.js'
import { Breadcrumbs } from './RouteLink.jsx'

function answerStatus(question, value, codingResult, grade) {
  if (!hasResponse(value)) return 'Unanswered'
  if (!isAnswered(question, value)) return 'Incomplete'
  if (question.type === 'video' && !grade) return 'Pending review'
  return isCorrect(question, value, codingResult, grade) ? 'Correct' : 'Incorrect'
}

export default function Results({ set, attempt, restart, onExplain, goSettings, busy, backLabel, backTo, navigate, goBack, reviewOwnerId, onVideoGraded }) {
  const [filter, setFilter] = useState('all')
  const [confirmRestart, setConfirmRestart] = useState(false)
  const [restartError, setRestartError] = useState('')
  const [gradingQuestion, setGradingQuestion] = useState(null)
  const [gradeError, setGradeError] = useState(null)
  const restartDialog = useRef(null)
  const review = set.questions.map((question, index) => {
    const value = attempt.answers[question.id]
    const codingResult = attempt.codingResults?.[question.id]
    return { question, index, value, codingResult, status: answerStatus(question, value, codingResult, attempt.videoGrades?.[question.id]), flagged: attempt.flags.includes(question.id) }
  })
  const totals = { Correct: 0, Incorrect: 0, Incomplete: 0, Unanswered: 0, ...(attempt.pendingReview && { 'Pending review': 0 }) }
  for (const item of review) totals[item.status]++
  const score = totals.Correct
  const percentage = score / review.length * 100
  const visible = review.filter(item => {
    if (filter === 'all') return true
    if (filter === 'missed') return item.status !== 'Correct'
    if (filter === 'flagged') return item.flagged
    return item.status === filter
  })

  useEffect(() => {
    if (confirmRestart) restartDialog.current?.showModal()
    else restartDialog.current?.close()
  }, [confirmRestart])

  async function gradeVideo(questionId, correct) {
    setGradingQuestion(questionId)
    setGradeError(null)
    try {
      const { attempt: graded } = await localApi(
        'attempt-media/reviews/' + reviewOwnerId + '/' + attempt.id + '/' + questionId, 'PUT', { correct },
      )
      onVideoGraded(graded)
      if (filter === 'Pending review' && !graded.pendingReview) setFilter('all')
    } catch (error) {
      setGradeError({ questionId, message: error.message })
    } finally {
      setGradingQuestion(null)
    }
  }

  return <>
    {backTo ? <Breadcrumbs to={backTo} navigate={navigate} label={backLabel}>Results</Breadcrumbs>
      : <button className="back-link" onClick={goBack}>← {backLabel}</button>}
    <header className="results-hero">
      <div><PassBadge passed={attempt.passed} /><h1>{set.title} results</h1>
        <p>{attempt.pendingReview ? attempt.pendingReview + (attempt.pendingReview === 1 ? ' video answer' : ' video answers') + ' pending review'
          : score + ' of ' + set.questions.length + ' correct · Pass mark ' + practicePassPercent + '%'}</p>
        <p>{formatDate(attempt.submittedAt)}</p>
      </div>
      <div className="score" style={{ '--percent': percentage + '%' }}><strong>{attempt.pendingReview ? 'Pending' : formatScore(score, review.length)}</strong></div>
    </header>
    <section className="dashboard-section" aria-labelledby="answer-stats">
      <div className="section-heading"><h2 id="answer-stats">Answer breakdown</h2></div>
      <dl className="score-grid stat-grid">{Object.entries(totals).map(([status, count]) =>
        <div className="score-card" key={status}><dt>{status}</dt><dd>{count}</dd></div>
      )}</dl>
    </section>
    <AttemptActivity activity={attempt.activity} questions={set.questions} />
    <CaptureEvidence capture={attempt.activity?.capture} questions={set.questions} />
    <section className="dashboard-section" aria-labelledby="domain-scores">
      <div className="section-heading"><h2 id="domain-scores">Score by domain</h2>{restart && <button className="button secondary" disabled={Boolean(gradingQuestion)} onClick={() => setConfirmRestart(true)}>Retake set</button>}</div>
      <div className="score-grid">{[...domains, generalDomain].map(domain => {
        const questions = review.filter(item => item.question.domain.id === domain.id)
        if (!questions.length) return null
        const correct = questions.filter(item => item.status === 'Correct').length
        return <article className="score-card" key={domain.id}><h3>{domain.name}</h3>
          <strong>{correct}<span> / {questions.length}</span></strong>
          <progress className="progress" value={correct} max={questions.length} aria-label={domain.name} />
        </article>
      })}</div>
    </section>
    <section className="dashboard-section" aria-labelledby="review-heading">
      <div className="section-heading"><h2 id="review-heading">Review answers</h2>
        <label className="filter-label">Show <select value={filter} onChange={event => setFilter(event.target.value)}>
          <option value="all">All questions</option><option value="missed">Missed questions</option><option value="flagged">Flagged questions</option>
          {Object.keys(totals).map(status => <option key={status}>{status}</option>)}
        </select></label>
      </div>
      <div className="review-list">
        {visible.map(({ question, index, value, codingResult, status }) => (
          <details className="review-card" key={question.id}>
            <summary><span className="review-index">{index + 1}</span><span>{question.prompt} <small>{formatLabel(question)}</small></span><span className={status === 'Correct' ? 'result-correct' : 'result-missed'}>{status}</span></summary>
            <div className="review-body">
              <CaseDetails study={question.caseStudy} />
              <Exhibits items={question.exhibits} />
              {question.type === 'video' ? <div className="video-review">
                <div className="video-review-answer">
                  <h4>Submitted answer</h4>
                  <FormattedAnswer question={question} value={value} />
                </div>
                <section className="video-review-grade" aria-label="Video grade">
                  <h4>Video grade</h4>
                  <p role="status">{gradingQuestion === question.id ? 'Saving grade…' : status}</p>
                  <h4>Grading guidance</h4>
                  <p>{question.explanation}</p>
                  {question.domain.source && <a href={question.domain.source} target="_blank" rel="noreferrer">Review this exam domain ↗</a>}
                  {value?.mediaId && (reviewOwnerId ? <div className="ai-actions">
                    <button className="button secondary" disabled={busy || Boolean(gradingQuestion)} onClick={() => gradeVideo(question.id, false)}>Mark incorrect</button>
                    <button className="button primary" disabled={busy || Boolean(gradingQuestion)} onClick={() => gradeVideo(question.id, true)}>Mark correct</button>
                  </div> : status === 'Pending review' && <p className="muted">An administrator will review this recording and assign a grade.</p>)}
                  {gradeError?.questionId === question.id && <p className="notice" role="alert">{gradeError.message}</p>}
                </section>
              </div> : <div className="answer-comparison">
                <div><h4>Your answer</h4>{question.type === 'coding'
                  ? <SubmittedFiles question={question} value={value} />
                  : <FormattedAnswer question={question} value={value} />}</div>
                <div><h4>Correct answer</h4>{question.type === 'coding'
                  ? <ReferenceSolutions question={question} language={value?.language} />
                  : <FormattedAnswer question={question} value={question.answer} />}</div>
              </div>}
              <QuestionActivity stats={attempt.activity?.questions[question.id]} submittedLanguage={codingResult?.language
                ?? (question.type === 'coding' && hasResponse(value) ? value.language : undefined)} />
              <ExecutionResults result={codingResult} />
              {question.type === 'coding' && value?.lastRun?.mode === 'custom' &&
                <details className="saved-custom-run">
                  <summary>Last custom run</summary>
                  <CodeBlock label="Input" text={value.stdin} />
                  <ExecutionResults result={value.lastRun} />
                </details>}
              {question.type !== 'video' && <div className="answer-key"><h4>Explanation</h4><p>{question.explanation}</p>
                {question.domain.source && <a href={question.domain.source} target="_blank" rel="noreferrer">Review this exam domain ↗</a>}
              </div>}
              {goSettings && question.type !== 'video' && <ExplainWithChatGPT question={question} attempt={attempt} onExplain={onExplain} goSettings={goSettings} />}
            </div>
          </details>
        ))}
        {!visible.length && <p className="notice">No questions match this filter.</p>}
      </div>
    </section>
    <dialog className="submit-dialog" ref={restartDialog} onCancel={event => { if (busy) event.preventDefault(); else setConfirmRestart(false) }} aria-labelledby="retake-title">
      <h2 id="retake-title">Retake {set.title.toLowerCase()}?</h2>
      <p>Your previous results stay in Attempt history.</p>
      {restartError && <p role="alert">{restartError}</p>}
      <div className="dialog-actions">
        <button className="button secondary" disabled={busy} onClick={() => { setConfirmRestart(false); setRestartError('') }}>Cancel</button>
        <button className="button primary" disabled={busy} onClick={async () => setRestartError(await restart() ?? '')}>{busy ? 'Starting…' : 'Start new attempt'}</button>
      </div>
    </dialog>
  </>
}
