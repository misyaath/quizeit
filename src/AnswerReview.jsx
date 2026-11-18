import React from 'react'
import { hasResponse } from './questions/index.js'
import { CodeBlock } from './CodingQuestion.jsx'
import { codingLanguages, codingSelection, projectFiles } from './coding.js'

export function FormattedAnswer({ question, value }) {
  if (!hasResponse(value)) return <p>No answer</p>
  if (question.type === 'match') return <ul>{question.labels.map((label, index) => <li key={label}><b>{label}</b> → {value[index] || '—'}</li>)}</ul>
  if (question.type === 'order') return <ol>{value.map(step => <li key={step}>{step}</li>)}</ol>
  if (question.type === 'multi') return <ul>{value.map(option => <li key={option}>{option}</li>)}</ul>
  return <p>{question.type === 'text' && Array.isArray(value) ? value.join(' / ') : value}</p>
}

export function ReferenceSolutions({ question, language }) {
  const matching = question.languages.filter(item => item.id === language)
  return (matching.length ? matching : question.languages).map(item => <div className="code-review-files" key={item.id}>
    <CodeBlock label={codingLanguages[item.id].label + ' · ' + codingLanguages[item.id].filename} text={item.solution} />
    {item.files?.map(file => <CodeBlock key={file.path} label={file.path} text={file.solution} />)}
  </div>)
}

export function SubmittedFiles({ question, value }) {
  if (!hasResponse(value)) return <p>No answer</p>
  const language = codingSelection(question, value.language)
  const { filename, label } = codingLanguages[value.language]
  return <div className="code-review-files">
    <CodeBlock label={label + ' · ' + filename} text={value.code?.[value.language] ?? language.starter} />
    {Object.entries(projectFiles(language, value)).map(([path, source]) => <CodeBlock key={path} label={path} text={source} />)}
  </div>
}

export function AnswerKey({ question }) {
  return <div className="answer-key">
    <h4>Correct answer</h4>
    {question.type === 'coding' ? <ReferenceSolutions question={question} /> : <FormattedAnswer question={question} value={question.answer} />}
    <h4>Explanation</h4>
    <p>{question.explanation}</p>
    {question.domain.source && <a href={question.domain.source} target="_blank" rel="noreferrer">Review this exam domain ↗</a>}
  </div>
}
