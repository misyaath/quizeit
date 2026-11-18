import React from 'react'
import { formats } from './questions/index.js'

export function formatLabel(question) {
  const label = formats[question.type].label
  return question.caseStudy ? 'Case study · ' + label : label
}

export function Exhibits({ items }) {
  return items?.map((item, index) => <figure className="code-exhibit" key={index}>
    <figcaption>{item.title}</figcaption><pre tabIndex={0}><code>{item.code}</code></pre>
  </figure>)
}

export function CaseDetails({ study }) {
  if (!study) return null
  return <div className="case-details"><h3>{study.title}</h3><p>{study.background}</p><Exhibits items={study.exhibits} /></div>
}
