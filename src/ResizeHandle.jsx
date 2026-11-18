import React, { useRef } from 'react'

export default function ResizeHandle({ orientation, label, value, min, max, step, onChange, measure, className = '' }) {
  const drag = useRef(null)
  const vertical = orientation === 'vertical'

  function resize(next) {
    onChange(Math.min(max, Math.max(min, next)))
  }

  return <div className={'resize-handle ' + className} role="separator" tabIndex={0}
    aria-label={label} aria-orientation={orientation} aria-valuemin={min} aria-valuemax={max} aria-valuenow={Math.round(value)}
    onPointerDown={event => {
      if (event.button !== 0) return
      event.preventDefault()
      event.currentTarget.focus({ preventScroll: true })
      event.currentTarget.setPointerCapture(event.pointerId)
      drag.current = { value, start: vertical ? event.clientX : event.clientY, scale: measure(event.currentTarget) }
    }}
    onPointerMove={event => {
      if (!drag.current) return
      const { value: initial, start, scale } = drag.current
      resize(initial + ((vertical ? event.clientX : event.clientY) - start) * scale)
    }}
    onLostPointerCapture={() => { drag.current = null }}
    onKeyDown={event => {
      if (event.key === 'Home' || event.key === 'End') resize(event.key === 'Home' ? min : max)
      else if (event.key === (vertical ? 'ArrowLeft' : 'ArrowDown')) resize(value - step)
      else if (event.key === (vertical ? 'ArrowRight' : 'ArrowUp')) resize(value + step)
      else return
      event.preventDefault()
    }} />
}
