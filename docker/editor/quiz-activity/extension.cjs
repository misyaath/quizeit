const vscode = require('vscode')
const fs = require('node:fs/promises')
const { basename, dirname, join, relative, isAbsolute } = require('node:path')
const { randomUUID } = require('node:crypto')

function activate(context) {
  const folder = vscode.workspace.workspaceFolders?.[0]
  if (!folder || dirname(folder.uri.fsPath) !== '/quiz-workspaces' || !/^[a-f0-9]{32}$/.test(basename(folder.uri.fsPath))) return

  const root = folder.uri.fsPath
  const control = join(root, '.quiz')
  const session = randomUUID()
  const metricsFile = 'activity-' + session + '.json'
  const totals = { editEvents: 0, singleCharacterEdits: 0, insertedCharacters: 0, deletedCharacters: 0, saves: 0, activeMs: 0 }
  let lastEdit = 0
  let lastTick = Date.now()
  let lastPersisted = 0
  let focused = vscode.window.state.focused
  let handled
  let pending = false

  function tracks(document) {
    const path = relative(root, document.uri.fsPath)
    return path && !isAbsolute(path) && !path.startsWith('..') && !path.split('/').some(part => part.startsWith('.'))
  }

  function account() {
    const now = Date.now()
    if (focused && lastEdit) totals.activeMs += Math.max(0, Math.min(now, lastEdit + 30_000) - lastTick)
    lastTick = now
  }

  async function atomic(name, value) {
    const target = join(control, name)
    const temporary = target + '.' + session
    await fs.writeFile(temporary, JSON.stringify(value))
    await fs.rename(temporary, target)
  }

  async function tick() {
    if (pending) return
    pending = true
    try {
      account()
      const command = await fs.readFile(join(control, 'save.json'), 'utf8').then(JSON.parse, error => {
        if (error.code === 'ENOENT') return null
        throw error
      })
      if (command && command.id !== handled) {
        handled = command.id
        const ok = await vscode.workspace.saveAll(false)
        await atomic(metricsFile, { ...totals, updatedAt: Date.now() })
        await atomic('saved.json', { id: handled, ok })
        lastPersisted = Date.now()
      } else if (Date.now() - lastPersisted >= 2000) {
        await atomic(metricsFile, { ...totals, updatedAt: Date.now() })
        lastPersisted = Date.now()
      }
    } catch (error) {
      console.warn('Study Lab workspace activity:', error.code ?? error.name)
    } finally {
      pending = false
    }
  }

  context.subscriptions.push(
    vscode.workspace.onDidChangeTextDocument(event => {
      if (!tracks(event.document) || !event.contentChanges.length) return
      account()
      lastEdit = Date.now()
      totals.editEvents++
      for (const change of event.contentChanges) {
        totals.insertedCharacters += change.text.length
        totals.deletedCharacters += change.rangeLength
      }
      if (event.contentChanges.length === 1) {
        const change = event.contentChanges[0]
        if (change.text.length + change.rangeLength === 1) totals.singleCharacterEdits++
      }
    }),
    vscode.workspace.onDidSaveTextDocument(document => { if (tracks(document)) totals.saves++ }),
    vscode.window.onDidChangeWindowState(state => { account(); focused = state.focused }),
  )
  const timer = setInterval(() => void tick(), 300)
  context.subscriptions.push({ dispose() { clearInterval(timer); void tick() } })
  void tick()
}

module.exports = { activate }
