import React, { useState } from 'react'
import { mediaUrl } from './exam-media.js'
import { formatDate } from './AttemptDisplay.jsx'

const eventLabels = { started: 'Screen sharing started', stopped: 'Screen sharing stopped', interrupted: 'Screen sharing interrupted', finished: 'Exam submitted' }

function EvidenceGallery({ frames, questionNumbers, kind, events }) {
  const [open, setOpen] = useState(false)
  const [visible, setVisible] = useState(24)
  const label = kind === 'webcam' ? 'webcam photo' : 'screenshot'
  return <details className="question-panel" onToggle={event => setOpen(event.currentTarget.open)}>
    <summary>{frames.length} {label}{frames.length !== 1 && 's'}{events && ' · ' + events.length + ' sharing events'}</summary>
    {open && <>
      {events && <ul className="capture-events">
        {events.map((event, index) => <li key={index}>{formatDate(event.at)} · {eventLabels[event.type]}</li>)}
      </ul>}
      <div className="capture-gallery">
        {frames.slice(0, visible).map(frame => <figure className="set-card" key={frame.id}>
          <a href={mediaUrl(frame.id)} target="_blank" rel="noreferrer">
            <img src={mediaUrl(frame.id)} alt={'Exam ' + label + ' for question ' + questionNumbers.get(frame.questionId)} loading="lazy" />
          </a>
          <figcaption>Question {questionNumbers.get(frame.questionId)} · {formatDate(frame.at)}
            {frame.surface === 'window' && ' · Exam page from shared window'}
            {frame.recording && ' · Video recording in progress'}</figcaption>
        </figure>)}
      </div>
      {visible < frames.length && <button className="button secondary" onClick={() => setVisible(value => value + 24)}>Show more {label}s</button>}
    </>}
  </details>
}

export function CaptureEvidence({ capture, questions }) {
  if (!capture) return null
  const questionNumbers = new Map(questions.map(({ id }, index) => [id, index + 1]))
  return <section className="dashboard-section" aria-labelledby="capture-evidence">
    <div className="section-heading"><h2 id="capture-evidence">Exam evidence</h2></div>
    <EvidenceGallery frames={capture.screenshots} questionNumbers={questionNumbers} kind="screen" events={capture.events} />
    {capture.webcamPhotos?.length > 0 && <EvidenceGallery frames={capture.webcamPhotos} questionNumbers={questionNumbers} kind="webcam" />}
  </section>
}

