import React, { useEffect, useRef, useState } from 'react'
import { hasResponse, isAnswered } from './questions/index.js'
import CodingQuestion, { CodeExamples } from './CodingQuestion.jsx'
import VideoAnswer from './VideoAnswer.jsx'
import { useExamCapture } from './useExamCapture.js'
import { useExamWebcam } from './useExamWebcam.js'
import ResizeHandle from './ResizeHandle.jsx'
import { ExamClock, useQuestionTime } from './AttemptActivity.jsx'
import { CaseDetails, Exhibits, formatLabel } from './QuestionDetails.jsx'
import QuestionInput, { instructionFor } from './QuestionInput.jsx'
import { Breadcrumbs } from './RouteLink.jsx'

export default function Exam({ set, attempt, position, timing, update, openQuestion, navigate, submit, busy, useVsCode, pinned, flushDraft, candidate = false }) {
  const [confirming, setConfirming] = useState(false)
  const [submitError, setSubmitError] = useState('')
  const [questionCollapsed, setQuestionCollapsed] = useState(false)
  const [videoQuestionCollapsed, setVideoQuestionCollapsed] = useState(false)
  const [questionWidth, setQuestionWidth] = useState(32)
  const { answers, flags } = attempt
  const question = set.questions[position]
  const coding = question.type === 'coding'
  const video = question.type === 'video'
  const hideQuestion = (coding && questionCollapsed) || (video && videoQuestionCollapsed)
  const caseQuestions = question.caseStudy ? set.questions.filter(item => item.caseStudy?.title === question.caseStudy.title) : []
  const total = set.questions.length
  const answered = set.questions.filter(item => isAnswered(item, answers[item.id])).length
  const value = answers[question.id]
  const flagged = flags.includes(question.id)
  const heading = useRef(null)
  const dialog = useRef(null)
  const startingDraft = useRef(false)
  const realExam = set.mode === 'exam'
  const [recording, setRecording] = useState(false)
  const capture = useExamCapture({ required: realExam, setId: set.id, draftId: attempt.draftId,
    questionId: question.id, flushDraft, recording })
  const webcamInterval = realExam && !video ? set.webcamPhotoSeconds : undefined
  const webcam = useExamWebcam({ intervalSeconds: webcamInterval, setId: set.id, draftId: attempt.draftId,
    questionId: question.id, sessionId: capture.sessionId, screenReady: capture.ready, onFailure: capture.stop })
  const examReady = capture.ready && webcam.ready
  const clock = useQuestionTime(set.id, question.id, attempt.draftId, timing, pinned && examReady)
  const shareLabel = capture.windowSharing ? 'Share exam window' : 'Share exam tab'

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
    requestAnimationFrame(() => {
      if (!heading.current?.closest('[hidden]')) heading.current?.focus({ preventScroll: true })
    })
  }

  function setAnswer(transform) {
    update(previous => ({
      ...previous, answers: { ...previous.answers, [question.id]: transform(previous.answers[question.id]) },
    }))
  }

  function toggleFlag() {
    update(previous => ({
      ...previous,
      flags: previous.flags.includes(question.id) ? previous.flags.filter(id => id !== question.id) : [...previous.flags, question.id],
    }))
  }

  function questionStatus(item) {
    const response = answers[item.id]
    return isAnswered(item, response) ? 'answered' : hasResponse(response) ? 'incomplete' : 'unanswered'
  }

  const questionActions = <div className="question-actions">
    {(!video || total > 1) && <button className="button secondary" disabled={position === 0 || recording} onClick={() => jump(position - 1)}>← Previous</button>}
    <button className={'button secondary' + (flagged ? ' marked' : '')} aria-pressed={flagged} onClick={toggleFlag}>{flagged ? 'Flagged' : 'Flag for review'}</button>
    {video && total > 1 && <label className="video-question-jump">
      Jump to
      <select value={position} disabled={recording} onChange={event => jump(Number(event.target.value))}>
        {set.questions.map((item, index) => <option key={item.id} value={index}>
          {index + 1} · {questionStatus(item)}{flags.includes(item.id) ? ', flagged' : ''}
        </option>)}
      </select>
    </label>}
    {position < total - 1
      ? <button className="button primary" disabled={recording} onClick={() => jump(position + 1)}>Next →</button>
      : !video && <button className="button primary" disabled={recording} onClick={() => setConfirming(true)}>Submit set</button>}
  </div>

  return <>
    {!candidate && !video && <Breadcrumbs to="home" navigate={navigate} label="Practice exams">Question {position + 1}</Breadcrumbs>}
    <header className="exam-heading">
      <div className="exam-heading-text">
        {video && !candidate ? <Breadcrumbs to="home" navigate={navigate} label="Practice exams">Video question</Breadcrumbs> : <h1>{set.title}</h1>}
        {!video && set.categoryName && <p>{[set.categoryName, set.subcategoryName].filter(Boolean).join(' · ')}</p>}
        <p>{answered} of {total} questions answered</p>
      </div>
      <div className={video ? 'exam-actions video-exam-actions' : 'exam-actions'}>
        {!video && <button type="button" className="button exam-pause" onClick={clock.toggle} disabled={!examReady || !clock.ready || clock.saving || busy}>
          <span className={clock.active ? 'pause-icon' : 'resume-icon'} aria-hidden="true" />
          {clock.active ? 'Pause timer' : 'Resume timer'}
        </button>}
        {video && <button type="button" className="button question-toggle" aria-expanded={!hideQuestion} aria-controls="exam-question-panel"
          disabled={!examReady} onClick={() => setVideoQuestionCollapsed(collapsed => !collapsed)}>{hideQuestion ? 'Show question' : 'Hide question'}</button>}
        <button className="button primary exam-submit" disabled={!examReady || busy || recording} onClick={() => setConfirming(true)}>Submit set</button>
        {!video && clock.paused && <p className="exam-pause-status" role="status">Timer paused</p>}
      </div>
    </header>
    {realExam && <section className="notice exam-sharing" aria-label="Exam screen sharing">
      <div>
        <strong>{capture.ready ? 'Screen sharing active' : capture.sharing ? 'Saving exam screenshot…' : 'Exam paused for screen sharing'}</strong>
        {!capture.sharing && <p>{capture.windowSharing
          ? 'Choose the browser window displaying this exam and keep it in front. Quizeit saves only the visible exam page.'
          : 'Choose this exam tab in the sharing dialog.'} Quizeit takes a screenshot when each question opens and every 30 seconds, including during video answers. Administrators can review the evidence after submission.</p>}
        {webcamInterval && <p>{webcam.ready ? 'Webcam active.' : webcam.active ? 'Saving webcam photo…' : 'Enable the webcam to continue.'}{' '}
          Webcam photos are saved when a question opens and every {webcamInterval} seconds. Audio is off for webcam photos.</p>}
        {capture.error && <p role="alert">{capture.error}</p>}
        {webcam.error && <p role="alert">{webcam.error}</p>}
      </div>
      <div className="exam-sharing-actions">
        {capture.sharing ? <button className="button secondary" onClick={() => capture.stop('Screen sharing stopped. Share the exam to resume.')}>Stop sharing</button>
          : <button className="button primary" disabled={!pinned || capture.starting} onClick={capture.start}>
            {capture.starting ? 'Waiting for permission…' : shareLabel}
          </button>}
        {webcamInterval && capture.ready && !webcam.active &&
          <button className="button primary" disabled={webcam.starting} onClick={webcam.start}>
            {webcam.starting ? 'Opening webcam…' : 'Enable webcam'}
          </button>}
      </div>
    </section>}
    {!video && <ExamClock clock={clock} />}
    <progress className="progress" max={total} value={answered} aria-label="Questions answered" />
    <div hidden={realExam && !capture.sharing} inert={!examReady} className={coding ? 'exam-grid coding-grid' + (hideQuestion ? ' coding-grid-expanded' : '') : video ? 'exam-grid video-exam-grid' + (hideQuestion ? ' video-exam-expanded' : '') : 'exam-grid'}
      style={coding ? { '--question-width': questionWidth + '%' } : undefined}>
      <div className="exam-question-column" hidden={video && hideQuestion}>
        {coding && <button className="button small question-toggle" aria-expanded={!hideQuestion} aria-controls="exam-question-panel"
          onClick={() => setQuestionCollapsed(collapsed => !collapsed)}>{hideQuestion ? 'Show question' : 'Hide question'}</button>}
        <section className="question-panel" id="exam-question-panel" aria-labelledby="question-heading" hidden={hideQuestion}
          tabIndex={video && !hideQuestion ? 0 : undefined}>
          <div className="question-meta"><span>Question {position + 1} of {total}</span><span className="format">{formatLabel(question)}</span></div>
          <p className="domain">{question.domain.name}</p>
          {caseQuestions.length > 1 && <p className="domain">Case study question {caseQuestions.indexOf(question) + 1} of {caseQuestions.length}</p>}
          <CaseDetails study={question.caseStudy} />
          <Exhibits items={question.exhibits} />
          <h2 id="question-heading" tabIndex={-1} ref={heading}>{question.prompt}</h2>
          <p className="muted">{instructionFor(question)}</p>
          {coding ? <CodeExamples question={question} /> : !video &&
            <QuestionInput key={question.id} question={question} value={value}
            onChange={next => setAnswer(() => next)} />}
          {!video && questionActions}
        </section>
      </div>
      {video && <div className="video-exam-player">
        <VideoAnswer key={question.id} setId={set.id} draftId={attempt.draftId} question={question} value={value}
          disabled={busy || !examReady} onChange={answer => setAnswer(() => answer)} onRecording={setRecording} flushDraft={flushDraft} />
      </div>}
      {video && questionActions}
      {coding && examReady && <>
        {!hideQuestion && <ResizeHandle className="coding-columns-resizer" orientation="vertical" label="Resize question and editor"
          value={questionWidth} min={22} max={60} step={3} measure={handle => 100 / handle.parentElement.clientWidth}
          onChange={setQuestionWidth} />}
        <CodingQuestion key={question.id} question={question} setId={set.id} draftId={attempt.draftId}
          value={value} onChange={setAnswer} disabled={busy} useVsCode={useVsCode} />
      </>}
      {!video && <aside className="navigator" aria-label="Question navigator">
        <h2>Question navigator</h2>
        <div className="question-numbers">
          {set.questions.map((item, target) => {
            const status = questionStatus(item)
            const marked = flags.includes(item.id)
            return <button key={item.id} className={`question-number ${status}${marked ? ' flagged' : ''}`}
              disabled={recording} aria-current={target === position ? 'step' : undefined}
              aria-label={`Question ${target + 1}, ${status}${marked ? ', flagged' : ''}`} onClick={() => jump(target)}>{target + 1}</button>
          })}
        </div>
        <div className="legend"><span><i /> Answered</span><span><i /> Flagged</span><span><i /> Incomplete</span></div>
        <button className="text-button" disabled={!hasResponse(value)} onClick={() => update(previous => {
          const next = { ...previous.answers }
          delete next[question.id]
          return { ...previous, answers: next }
        })}>Clear current answer</button>
      </aside>}
    </div>
    <dialog className="submit-dialog" ref={dialog} onCancel={event => { if (busy) event.preventDefault(); else setConfirming(false) }} aria-labelledby="submit-title">
      <h2 id="submit-title">Submit {set.title.toLowerCase()}?</h2>
      <p>{answered} of {total} questions are fully answered. {answered < total && 'Unanswered or incomplete questions count as zero.'}</p>
      {submitError && <p role="alert">{submitError}</p>}
      <div className="dialog-actions">
        <button className="button secondary" disabled={busy} onClick={() => { setConfirming(false); setSubmitError('') }}>{candidate ? 'Continue exam' : 'Keep practicing'}</button>
        <button className="button primary" disabled={busy || !examReady || recording} onClick={async () => {
          if (!examReady || recording) return
          await clock.stop()
          const error = await submit()
          if (error) clock.restart()
          setSubmitError(error ?? '')
        }}>{busy ? 'Saving attempt…' : candidate ? 'Submit exam' : 'Submit and see results'}</button>
      </div>
    </dialog>
  </>
}
