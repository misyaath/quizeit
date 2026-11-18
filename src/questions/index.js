import { hasCodingResponse } from '../coding.js'

export const studyGuide = 'https://learn.microsoft.com/en-us/credentials/certifications/resources/study-guides/ai-200'
export const examExperience = 'https://go.microsoft.com/fwlink/?linkid=2226877'

export const domains = [
  { id: 'containers', name: 'Containerized solutions', weight: '20–25%', source: studyGuide + '#develop-containerized-solutions-on-azure-2025' },
  { id: 'data', name: 'AI data management', weight: '25–30%', source: studyGuide + '#develop-ai-solutions-by-using-azure-data-management-services-2530' },
  { id: 'integration', name: 'Azure service integration', weight: '20–25%', source: studyGuide + '#connect-to-and-consume-azure-services-2025' },
  { id: 'operations', name: 'Security and monitoring', weight: '20–25%', source: studyGuide + '#secure-monitor-and-troubleshoot-azure-solutions-2025' },
]

export const generalDomain = { id: 'general', name: 'General practice' }

export const formats = {
  single: { label: 'Single choice', instruction: 'Choose one answer.' },
  multi: { label: 'Multiple select' },
  match: { label: 'Drag and drop', instruction: 'Drag each answer onto its match, or use the dropdowns.' },
  order: { label: 'Build list', instruction: 'Add each step in order. Use the arrows to rearrange your list.' },
  text: { label: 'Short answer', instruction: 'Type the requested term, command, or value.' },
  coding: { label: 'Coding', instruction: 'Write a solution and run the examples before submitting.' },
}

export function isAnswered(question, value) {
  if (question.type === 'coding') return hasCodingResponse(value)
  if (question.type === 'text') return typeof value === 'string' && Boolean(value.trim())
  if (question.type === 'multi') return Array.isArray(value) && value.length === question.answer.length
  if (question.type === 'order' || question.type === 'match') {
    return Array.isArray(value) && value.length === question.options.length && value.every(Boolean)
  }
  return Boolean(value)
}

export function isCorrect(question, value, codingResult) {
  if (!isAnswered(question, value)) return false
  if (question.type === 'coding') return codingResult?.passed === true
  if (question.type === 'text') {
    const normalize = text => text.trim().toLowerCase().replace(/\s+/g, ' ')
    return question.answer.some(answer => normalize(answer) === normalize(value))
  }
  if (question.type === 'multi') return question.answer.every(answer => value.includes(answer))
  if (Array.isArray(question.answer)) return question.answer.every((answer, index) => value[index] === answer)
  return value === question.answer
}

export function hasResponse(value) {
  if (value && typeof value === 'object' && !Array.isArray(value)) return hasCodingResponse(value)
  return Array.isArray(value) ? value.some(Boolean) : typeof value === 'string' && Boolean(value.trim())
}


export const isGeneratedSet = set => set.id.startsWith('generated-')
