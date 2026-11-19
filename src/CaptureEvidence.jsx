import React, { useEffect, useRef, useState } from 'react'
import { mediaUrl } from './exam-media.js'
import { formatDate } from './AttemptDisplay.jsx'

const eventLabels = { started: 'Screen sharing started', stopped: 'Screen sharing stopped', interrupted: 'Screen sharing interrupted', finished: 'Exam submitted',
  away: 'Left exam tab or window', returned: 'Returned to exam' }
const pageSize = 24

function ImageDetails({ frame, question }) {
  return <>
    <strong>{question}</strong>
    <span>{formatDate(frame.at)}</span>
    {frame.surface === 'window' && <span>Exam page from shared window</span>}
    {frame.recording && <span>Video recording in progress</span>}
    {(frame.reason === 'away' || frame.reason === 'returned') && <span>{eventLabels[frame.reason]}</span>}
  </>
}

export function CaptureEvidence({ capture, questions }) {
  const screenshots = capture?.screenshots ?? []
  const photos = capture?.webcamPhotos ?? []
  const [type, setType] = useState(() => screenshots.length || !photos.length ? 'screen' : 'webcam')
  const [visible, setVisible] = useState(pageSize)
  const [selected, setSelected] = useState(null)
  const dialog = useRef(null)
  const thumbnail = useRef(null)
  const gallery = type === 'screen' ? screenshots : photos
  const imageName = type === 'screen' ? 'screenshot' : 'webcam photo'
  const frame = gallery[selected]
  const viewerOpen = Boolean(frame)
  const questionNumbers = new Map(questions.map(({ id }, index) => [id, index + 1]))

  useEffect(() => {
    if (viewerOpen && !dialog.current?.open) dialog.current?.showModal()
  }, [viewerOpen])

  if (!capture) return null
  const departures = capture.events?.filter(event => event.type === 'away').length ?? 0

  function selectGallery(next) {
    if (next === type) return
    setType(next)
    setVisible(pageSize)
  }

  function move(offset) {
    setSelected(index => Math.max(0, Math.min(index + offset, gallery.length - 1)))
  }

  const questionLabel = frame => questionNumbers.has(frame.questionId) ? 'Question ' + questionNumbers.get(frame.questionId) : 'Exam setup'

  return <section className="dashboard-section" aria-labelledby="capture-evidence">
    <div className="section-heading"><h2 id="capture-evidence">Exam evidence</h2>
      {departures > 0 && <span className="format">Left exam {departures} {departures === 1 ? 'time' : 'times'}</span>}
    </div>
    <div className="question-panel evidence-panel">
      <div className="evidence-controls" role="group" aria-label="Evidence gallery">
        <button className="button secondary" aria-pressed={type === 'screen'} onClick={() => selectGallery('screen')}>
          Screenshots ({screenshots.length})
        </button>
        <button className="button secondary" aria-pressed={type === 'webcam'} onClick={() => selectGallery('webcam')}>
          Webcam photos ({photos.length})
        </button>
      </div>
      {gallery.length ? <ul className="capture-gallery" aria-label={type === 'screen' ? 'Exam screenshots' : 'Exam webcam photos'}>
        {gallery.slice(0, visible).map((item, index) => <li key={item.id}>
          <button className="evidence-thumbnail" type="button"
            aria-label={'View ' + imageName + ' ' + (index + 1) + ' for ' + questionLabel(item).toLowerCase()}
            onClick={event => {
              thumbnail.current = event.currentTarget
              setSelected(index)
            }}>
            <img src={mediaUrl(item.id)} alt={'Exam ' + imageName + ' for ' + questionLabel(item).toLowerCase()} loading="lazy" />
            <span className="evidence-image-details"><ImageDetails frame={item} question={questionLabel(item)} /></span>
          </button>
        </li>)}
      </ul> : <p className="muted evidence-empty">No {imageName}s were saved for this attempt.</p>}
      {visible < gallery.length && <button className="button secondary" onClick={() => setVisible(value => value + pageSize)}>Show more {imageName}s</button>}
      {capture.events?.length > 0 && <details className="evidence-timeline">
        <summary>Sharing timeline ({capture.events.length})</summary>
        <ul className="capture-events">
          {capture.events.map((event, index) => <li key={index}>{formatDate(event.at)} · {eventLabels[event.type]}
            {event.questionId && ' · ' + questionLabel(event)}</li>)}
        </ul>
      </details>}
    </div>
    <dialog ref={dialog} className="evidence-viewer" aria-labelledby="evidence-viewer-title"
      onClose={() => { setSelected(null); thumbnail.current?.focus({ preventScroll: true }) }}
      onKeyDown={event => {
        if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
          event.preventDefault()
          move(event.key === 'ArrowLeft' ? -1 : 1)
        }
      }}>
      {frame && <>
        <div className="evidence-viewer-header">
          <h3 id="evidence-viewer-title">{type === 'screen' ? 'Screenshot' : 'Webcam photo'}</h3>
          <button className="button small secondary" onClick={() => dialog.current.close()}>Close</button>
        </div>
        <figure>
          <img src={mediaUrl(frame.id)} alt={'Exam ' + imageName + ' for ' + questionLabel(frame).toLowerCase()} />
          <figcaption className="evidence-image-details" aria-live="polite">
            <ImageDetails frame={frame} question={questionLabel(frame)} />
          </figcaption>
        </figure>
        <div className="evidence-viewer-actions">
          <button className="button small secondary" disabled={selected === 0} onClick={() => move(-1)}>← Previous</button>
          <span aria-live="polite">{selected + 1} / {gallery.length}</span>
          <button className="button small secondary" disabled={selected === gallery.length - 1} onClick={() => move(1)}>Next →</button>
          <a href={mediaUrl(frame.id)} target="_blank" rel="noreferrer">Open image in new tab ↗</a>
        </div>
      </>}
    </dialog>
  </section>
}
