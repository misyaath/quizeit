import { definePlugin, download } from '../../packages/plugin-sdk/index.js'

const columns = [
  ['Question set', row => row.title],
  ['Submitted at', row => row.submittedAt],
  ['Points earned', row => row.pointsEarned],
  ['Points possible', row => row.pointsPossible],
  ['Result', row => row.passed === null ? 'Pending review' : row.passed ? 'Passed' : 'Failed'],
]

function csvCell(value) {
  let text = String(value ?? '')
  // Text from an authored set can be interpreted as a spreadsheet formula.
  if (/^[\s]*[=+@-]|^[\t\r\n]/.test(text)) text = "'" + text
  return '"' + text.replaceAll('"', '""') + '"'
}

export default definePlugin(plugin => {
  const access = plugin.permission('export')
  plugin.role('exporter', { label: 'Practice results exporter', permissions: [access] })
  plugin.page({ id: 'results', title: 'Export practice results', permission: access })
  plugin.setting({ id: 'include-pending', label: 'Include attempts pending video review', type: 'boolean', default: false })
  const columnPoint = plugin.definePoint('columns', column => typeof column?.heading === 'string' && typeof column.value === 'function')

  async function results({ services, settings }) {
    const rows = await services.attempts.listOwnPracticeResults()
    return settings['include-pending'] ? rows : rows.filter(row => row.passed !== null)
  }

  plugin.action({ id: 'results', method: 'GET', permission: access, handler: results })
  plugin.action({ id: 'download', method: 'GET', permission: access, async handler(context) {
    const rows = await results(context)
    const extended = [...columns, ...plugin.contributions(columnPoint).map(({ value }) => [value.heading, value.value])]
    const content = [
      extended.map(([heading]) => csvCell(heading)).join(','),
      ...rows.map(row => extended.map(([, value]) => csvCell(value(row))).join(',')),
    ].join('\r\n') + '\r\n'
    return download('practice-results.csv', content, 'text/csv; charset=utf-8')
  } })
})
