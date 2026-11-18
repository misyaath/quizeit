const runCounters = { examples: 'exampleRuns', custom: 'customRuns', submit: 'gradingRuns' }

export function summarizeLanguages(activities) {
  const rows = new Map()
  function get(id) {
    if (!rows.has(id)) rows.set(id, {})
    return rows.get(id)
  }
  for (const activity of activities) {
    for (const question of Object.values(activity?.questions ?? {})) {
      for (const [id, { editor }] of Object.entries(question.languages ?? {})) {
        const row = get(id)
        if (!editor) continue
        row.editor ??= {}
        for (const [key, value] of Object.entries(editor)) row.editor[key] = (row.editor[key] ?? 0) + value
      }
    }
    for (const entry of activity?.runs ?? []) {
      const counter = runCounters[entry.mode]
      if (!entry.language || !counter) continue
      const row = get(entry.language)
      row[counter] = (row[counter] ?? 0) + 1
    }
  }
  return [...rows]
}
