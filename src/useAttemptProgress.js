import { useRef, useState } from 'react'
import { emptyProgress, newAttempt } from './attempts.js'
import { localApi } from './local-api.js'

export function useAttemptProgress() {
  const [progress, setProgress] = useState(emptyProgress)
  const progressRef = useRef(progress)
  const queue = useRef(Promise.resolve())
  const currentAction = useRef(false)
  const retryRestart = useRef(null)
  const [ready, setReady] = useState(false)
  const [busy, setBusy] = useState(false)
  const [timings, setTimings] = useState({})
  const [saveError, setSaveError] = useState('')
  const [loadError, setLoadError] = useState('')

  function showProgress(next) {
    progressRef.current = next
    setProgress(next)
  }

  async function loadProgress() {
    setLoadError('')
    setSaveError('')
    try {
      showProgress(await localApi('progress'))
      setReady(true)
    } catch (error) {
      setLoadError(error.message)
    }
  }

  function updateAttempt(setId, update, questionIndex) {
    if (currentAction.current) return false
    const previous = progressRef.current
    const existing = previous.attempts[setId] ?? newAttempt()
    const draft = { ...update(existing), index: questionIndex, draftId: existing.draftId ?? crypto.randomUUID() }
    showProgress({ ...previous, attempts: { ...previous.attempts, [setId]: draft } })

    queue.current = queue.current.then(async () => {
      // A newer draft already queued for this set supersedes this write.
      if (progressRef.current.attempts[setId] !== draft) return
      try {
        const timing = await localApi('progress', 'POST', { action: 'draft', setId, draft })
        setTimings(previous => previous[draft.draftId] ? previous : { ...previous, [draft.draftId]: timing })
        setSaveError('')
      } catch (error) {
        setSaveError('Draft could not be saved. ' + error.message)
      }
    })
    return true
  }

  async function finishAttempt(action, setId, position) {
    if (currentAction.current) return { saved: false }
    currentAction.current = true
    setBusy(true)
    setSaveError('')
    const existing = progressRef.current.attempts[setId] ?? newAttempt()
    if (action === 'restart' && retryRestart.current?.resultId !== existing.resultId) {
      // Reuse the draft ID when retrying a retake after a failed response.
      retryRestart.current = { resultId: existing.resultId, draftId: crypto.randomUUID() }
    }
    const draft = action === 'restart'
      ? { ...newAttempt(), draftId: retryRestart.current.draftId }
      : { ...existing, index: position, draftId: existing.draftId ?? crypto.randomUUID() }

    try {
      await queue.current
      if (action === 'submit' && !existing.draftId) {
        const previous = progressRef.current
        showProgress({ ...previous, attempts: { ...previous.attempts, [setId]: draft } })
      }
      showProgress(await localApi('progress', 'POST', { action, setId, draft, previousResultId: existing.resultId }))
      setSaveError('')
      return { saved: true }
    } catch (error) {
      setSaveError(error.message)
      return { saved: false, error: error.message }
    } finally {
      currentAction.current = false
      setBusy(false)
    }
  }

  function keepExplanation(attemptId, questionId, explanation) {
    const current = progressRef.current
    showProgress({
      ...current,
      history: current.history.map(item => item.id === attemptId
        ? { ...item, explanations: { ...item.explanations, [questionId]: explanation } }
        : item),
    })
  }

  function acceptImportedProgress(next) {
    showProgress(next)
    setReady(true)
    setLoadError('')
  }

  return {
    progress, ready, busy, timings, saveError, loadError,
    loadProgress, acceptImportedProgress, updateAttempt, finishAttempt, keepExplanation,
    clearSaveError: () => setSaveError(''),
  }
}
