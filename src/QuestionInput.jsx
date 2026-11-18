import React, { useRef } from 'react'
import { formats } from './questions/index.js'

export function instructionFor(question) {
  return question.type === 'multi'
    ? `Choose ${question.answer.length} answers.`
    : formats[question.type].instruction
}

export default function QuestionInput({ question, value, onChange }) {
  const dragged = useRef(null)
  const answerList = Array.isArray(value) ? value : []
  const { type, options } = question
  if (type === 'text') return <label className="typed-label">Your answer
    <input className="typed" value={value ?? ''} onChange={event => onChange(event.target.value)} autoComplete="off" spellCheck={false} maxLength={4000} />
  </label>

  if (type === 'single' || type === 'multi') return <div className="choices" role="group" aria-label={instructionFor(question)}>
    {options.map((option, index) => {
      const checked = type === 'single' ? value === option : answerList.includes(option)
      return <label className={'option' + (checked ? ' selected' : '')} key={option}>
        <input type={type === 'single' ? 'radio' : 'checkbox'} name={question.id} checked={checked}
          disabled={type === 'multi' && !checked && answerList.length >= question.answer.length}
          onChange={() => onChange(type === 'single' ? option : checked ? answerList.filter(answer => answer !== option) : [...answerList, option])} />
        <span className="letter" aria-hidden="true">{String.fromCharCode(65 + index)}</span><span>{option}</span>
      </label>
    })}
  </div>

  if (type === 'match') {
    function assign(index, option) {
      const matches = question.labels.map((_, position) => position === index ? option : answerList[position] === option ? '' : answerList[position] ?? '')
      onChange(matches)
    }
    return <div className="match">
      <div className="tile-list" aria-label="Draggable answers">
        {options.map(option => <span className="tile" draggable key={option}
          onDragStart={event => {
            dragged.current = option
            event.dataTransfer.effectAllowed = 'move'
            event.dataTransfer.setData('text/plain', option)
          }} onDragEnd={() => { dragged.current = null }}>⠿ {option}</span>)}
      </div>
      {question.labels.map((label, index) => <label className="match-row" key={label}
        onDragOver={event => { if (dragged.current) event.preventDefault() }}
        onDrop={event => {
          event.preventDefault()
          const option = event.dataTransfer.getData('text/plain')
          if (dragged.current === option && options.includes(option)) assign(index, option)
          dragged.current = null
        }}>
        <span>{label}</span>
        <select value={answerList[index] ?? ''} onChange={event => assign(index, event.target.value)}>
          <option value="">Choose a match</option>
          {options.map(option => <option key={option}>{option}</option>)}
        </select>
      </label>)}
    </div>
  }

  function move(index, direction) {
    const reordered = [...answerList]
    const [item] = reordered.splice(index, 1)
    reordered.splice(index + direction, 0, item)
    onChange(reordered)
  }

  return <div className="build-list">
    <div><h3>Available steps</h3>
      <div className="build-options">
        {options.filter(option => !answerList.includes(option)).map(option => <button className="button secondary step-button" key={option} onClick={() => onChange([...answerList, option])}>+ {option}</button>)}
        {answerList.length === options.length && <p className="muted">All steps added.</p>}
      </div>
    </div>
    <div><h3>Your sequence</h3>
      {answerList.length === 0 && <p className="muted">Select a step to begin.</p>}
      <ol className="sequence">
        {answerList.map((option, index) => <li key={option}><span>{option}</span><div className="step-controls">
          <button className="button icon-button" onClick={() => move(index, -1)} disabled={index === 0} aria-label={`Move step ${index + 1} up`}>↑</button>
          <button className="button icon-button" onClick={() => move(index, 1)} disabled={index === answerList.length - 1} aria-label={`Move step ${index + 1} down`}>↓</button>
          <button className="button icon-button" onClick={() => onChange(answerList.filter(step => step !== option))} aria-label={`Remove step ${index + 1}`}>×</button>
        </div></li>)}
      </ol>
    </div>
  </div>
}
