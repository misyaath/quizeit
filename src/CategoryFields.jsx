import React, { useId } from 'react'

export function matchesCategory(set, providerId, examId) {
  return (!providerId || set.providerId === providerId) && (!examId || set.examId === examId)
}

export default function CategoryFields({ categories, providerId, examId, onChange, required = false, disabled = false }) {
  const id = useId()
  const exams = categories.find(provider => provider.id === providerId)?.exams ?? []
  return <div className="category-fields">
    <div className="filter-label">
      <label htmlFor={id + '-provider'}>Provider</label>
      <select id={id + '-provider'} value={providerId} disabled={disabled} required={required} onChange={event => {
        const next = event.target.value
        onChange(next, required ? categories.find(provider => provider.id === next)?.exams[0]?.id ?? '' : '')
      }}>
        <option value="">{required ? 'Choose a provider' : 'All providers'}</option>
        {categories.map(provider => <option value={provider.id} key={provider.id}>{provider.name}</option>)}
      </select>
    </div>
    <div className="filter-label">
      <label htmlFor={id + '-exam'}>Exam</label>
      <select id={id + '-exam'} value={examId} disabled={disabled || !providerId} required={required}
        onChange={event => onChange(providerId, event.target.value)}>
        <option value="">{required ? 'Choose an exam' : 'All exams'}</option>
        {exams.map(exam => <option value={exam.id} key={exam.id}>{exam.name}</option>)}
      </select>
    </div>
  </div>
}
