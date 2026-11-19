import assert from 'node:assert/strict'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { loadPlugins } from '../apps/server/plugins/runtime.mjs'
import { createPluginRegistry } from '../apps/server/plugins/registry.mjs'
import { listedGenerators, selectedGenerator } from '../apps/server/plugins/generation.mjs'
import { pluginServices } from '../apps/server/plugins/services.mjs'
import { generateSet } from '../scripts/generate-set.mjs'

const admin = { role: 'admin' }
const learner = { role: 'learner' }
const manifest = id => ({ id, name: id, version: '1.0.0', browser: true })

async function loadEnabled(t, enabled) {
  const directory = await mkdtemp(join(tmpdir(), 'quizeit-test-plugins-'))
  t.after(() => rm(directory, { recursive: true, force: true }))
  const configFile = join(directory, 'plugins.json')
  await writeFile(configFile, JSON.stringify({ enabled }))
  return loadPlugins(undefined, { configFile })
}

test('plugins declare independently extensible points, events and permissions', async t => {
  const registry = createPluginRegistry()
  const first = registry.register(manifest('first'))
  const second = registry.register(manifest('second'))
  const point = first.definePoint('transform', value => typeof value === 'function')
  const event = first.defineEvent('ready')
  const permission = first.permission('view')
  const publicToMembers = first.permission('browse', { access: 'signed-in' })
  const role = second.role('viewer', { label: 'Viewer', permissions: [permission] })
  first.page({ id: 'home', title: 'Home', permission })
  second.contribute(point, 'uppercase', value => value.toUpperCase())
  const logged = t.mock.method(console, 'error', () => {})
  second.on(event, payload => { payload.ready = false; throw new Error('Broken listener') })
  let received
  second.on(event, payload => { received = payload.ready })
  registry.seal()

  assert.deepEqual(registry.catalog(learner), [])
  assert.deepEqual(registry.catalog({ role: 'candidate' }), [])
  assert.equal(registry.can(learner, publicToMembers), true)
  assert.equal(registry.can({ role: 'candidate' }, publicToMembers), false)
  assert.equal(registry.catalog({ role })[0].pages[0].id, 'home')
  assert.equal(first.contributions(point)[0].value('sample'), 'SAMPLE')
  assert.throws(() => first.permission('late'), /closed/)
  assert.throws(() => second.emit(event, {}), /own events/)
  await first.emit(event, { ready: true })
  assert.equal(logged.mock.callCount(), 1)
  assert.equal(received, true)
})

test('startup rejects duplicate plugins, missing permissions and invalid extensions', async t => {
  await assert.rejects(loadEnabled(t, ['results-csv', 'results-csv']), /unique plugin IDs/)
  const registry = createPluginRegistry()
  const plugin = registry.register(manifest('test-plugin'))
  plugin.page({ id: 'home', title: 'Home', permission: 'test-plugin.missing' })
  assert.throws(() => registry.seal(), /Unknown permission/)

  const otherRegistry = createPluginRegistry()
  const otherPlugin = otherRegistry.register(manifest('other-plugin'))
  const point = otherPlugin.definePoint('numbers', Number.isFinite)
  otherPlugin.contribute(point, 'invalid', 'a string')
  assert.throws(() => otherRegistry.seal(), /Invalid contribution/)
})

test('CSV exporter reuses practice results and omits real exams and hidden data', async t => {
  const registry = await loadEnabled(t, ['results-csv'])
  assert.equal(registry.catalog(admin)[0].settings[0].type, 'boolean')
  assert.deepEqual(registry.catalog(learner), [])
  assert.ok(registry.can({ role: 'results-csv.exporter' }, 'results-csv.export'))
  const progress = { history: [
    { id: 'practice', title: '=1+1,"quoted"', snapshotIndex: 0, correct: 2, total: 3, passed: false, answers: { secret: true } },
    { id: 'exam', title: 'Real exam', snapshotIndex: 1, correct: 2, total: 3, passed: false },
    { id: 'missing', title: 'Missing snapshot', snapshotIndex: 2 },
    { id: 'pending', title: 'Pending video', snapshotIndex: 0, passed: null },
  ], snapshots: ['{}', '{"mode":"exam"}'] }
  const services = pluginServices({ progress: { read: async () => progress } })
  const plugin = registry.get('results-csv')
  const context = { settings: { 'include-pending': false }, services }
  const [row] = await plugin.actions.get('GET:results').handler(context)
  assert.equal(row.id, 'practice')
  assert.equal(row.pointsEarned, 2)
  assert.equal(Object.hasOwn(row, 'answers'), false)
  const download = await plugin.actions.get('GET:download').handler(context)
  assert.match(download.body, /"'=1\+1,""quoted"""/)
  assert.doesNotMatch(download.body, /Real exam|Missing snapshot|Pending video/)
  context.settings['include-pending'] = true
  const withPending = await plugin.actions.get('GET:results').handler(context)
  assert.deepEqual(withPending.map(entry => entry.id), ['practice', 'pending'])
})

test('a registered provider generates and saves a multi-batch set with built-in validation', async t => {
  const registry = await loadEnabled(t, ['demo-generator'])
  const [model] = listedGenerators(registry)
  assert.equal(model.id, 'plugin:demo-generator.sample')
  assert.equal(selectedGenerator(registry, 'not-a-plugin'), undefined)
  assert.equal(selectedGenerator(registry, 'plugin:missing.generator'), null)
  const generator = selectedGenerator(registry, model.id)
  let saved
  const result = await generateSet({ modelId: model.id, effort: '', prompt: 'Development fixtures', count: 12, types: ['single'] }, {
    catalog: { categories: [], sets: [] },
    signal: new AbortController().signal,
    ask: input => generator.generate(input),
    async saveQuestionSet(_proposal, document) {
      saved = document
      return { set: document, categories: [] }
    },
  })
  assert.equal(saved.questions.length, 12)
  assert.equal(new Set(saved.questions.map(question => question.prompt)).size, 12)
  assert.deepEqual(result.models, ['Demo generator'])
})
