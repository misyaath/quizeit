const namespace = 'quiz_bank'
const lookupName = 'find_questions'

export const quizTools = [
  { type: 'web_search' },
  {
    type: 'namespace',
    name: namespace,
    description: 'Read-only lookup of questions in the local quiz bank.',
    tools: [{
      type: 'function',
      name: lookupName,
      description: 'Find existing question prompts on a topic to avoid duplicates. Returns relevant question prompts and their set titles.',
      strict: true,
      parameters: {
        type: 'object',
        properties: { query: { type: 'string', description: 'A few topic, exam, or technology keywords.' } },
        required: ['query'],
        additionalProperties: false,
      },
    }],
  },
]

const tokenize = value => value.toLowerCase().match(/[\p{L}\p{N}][\p{L}\p{N}+#-]*/gu) ?? []

export function runQuizTool(catalog, call) {
  if (call.name !== lookupName || (call.namespace && call.namespace !== namespace)) {
    return { error: 'Unknown quiz tool.' }
  }
  let query
  try {
    ;({ query } = JSON.parse(call.arguments))
  } catch {
    return { error: 'Supply a JSON object with a query string.' }
  }
  if (typeof query !== 'string' || !query.trim() || query.length > 240) return { error: 'Supply a nonempty query of up to 240 characters.' }
  const terms = new Set(tokenize(query).filter(term => term.length > 1))
  const candidates = []
  for (const set of catalog.sets) {
    const tags = new Set(tokenize([set.title, set.providerId, set.examId].filter(Boolean).join(' ')))
    for (const question of set.questions) {
      const words = new Set(tokenize(question.prompt + ' ' + (question.caseStudy?.title ?? '')))
      let score = 0
      for (const term of terms) {
        if (words.has(term)) score += 3
        else if (tags.has(term)) score += 1
      }
      if (score > 1) candidates.push({ score, set: set.title, prompt: question.prompt.slice(0, 350), type: question.type })
    }
  }
  candidates.sort((a, b) => b.score - a.score)
  return { matches: candidates.slice(0, 8).map(({ set, prompt, type }) => ({ set, prompt, type })) }
}
