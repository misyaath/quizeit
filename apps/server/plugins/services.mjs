import { resultSummary } from '../../../packages/assessment/results.js'

function isPracticeResult(entry, snapshots) {
  const snapshot = snapshots[entry.snapshotIndex]
  if (typeof snapshot !== 'string') return false
  try {
    const set = JSON.parse(snapshot)
    return set && (set.mode === 'practice' || set.mode === undefined)
  } catch {
    return false
  }
}

export function pluginServices(data) {
  return Object.freeze({
    attempts: Object.freeze({
      async listOwnPracticeResults() {
        const { history, snapshots } = await data.progress.read()
        return history.filter(entry => isPracticeResult(entry, snapshots))
          .map(entry => resultSummary(entry, 'practice'))
      },
    }),
  })
}
