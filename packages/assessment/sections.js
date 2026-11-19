export const firstVideoQuestion = set => set.questions.findIndex(question => question.type === 'video')

export function orderExamQuestions(set) {
  const written = set.questions.filter(question => question.type !== 'video')
  const videos = set.questions.filter(question => question.type === 'video')
  return { ...set, questions: [...written, ...videos] }
}

export function orderExamDraft(draft) {
  if (draft?.setSnapshot?.mode !== 'exam') return draft
  const setSnapshot = orderExamQuestions(draft.setSnapshot)
  const currentId = draft.setSnapshot.questions[draft.index]?.id
  const position = Math.max(0, setSnapshot.questions.findIndex(question => question.id === currentId))
  const videoIndex = firstVideoQuestion(setSnapshot)
  const index = videoIndex > 0 && draft.activity?.writtenSubmittedAt ? Math.max(videoIndex, position)
    : videoIndex > 0 && position >= videoIndex ? 0 : position
  return { ...draft, setSnapshot, index }
}
