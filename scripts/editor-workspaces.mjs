import { createHash, randomUUID } from 'node:crypto'
import { constants } from 'node:fs'
import { mkdir, mkdtemp, open, readFile, readdir, rename, rm, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import { parseEnv } from 'node:util'
import { codingLanguages, maxCodeLength, projectFiles } from '../src/coding.js'
import { ApiError } from './openai.mjs'

export const editorCounters = ['editEvents', 'singleCharacterEdits', 'insertedCharacters', 'deletedCharacters', 'saves', 'activeMs']
const directoryFlags = constants.O_DIRECTORY | constants.O_NOFOLLOW
const fileFlags = constants.O_NOFOLLOW | constants.O_NONBLOCK
const fdPath = handle => '/proc/self/fd/' + handle.fd
const activityPattern = /^activity-[a-f0-9-]{36}\.json$/
const offline = () => new ApiError(503, 'Start the VS Code container with npm run editor:up, then retry.')
const keyFor = ({ setId, questionId, draftId, language }) =>
  createHash('sha256').update(JSON.stringify([setId, questionId, draftId, language])).digest('hex').slice(0, 32)

async function directories(root, parts, callback, create = false) {
  const handles = []
  try {
    let current = await open(root, directoryFlags)
    handles.push(current)
    for (const part of parts) {
      const path = fdPath(current) + '/' + part
      if (create) await mkdir(path, { mode: 0o700 }).catch(error => { if (error.code !== 'EEXIST') throw error })
      current = await open(path, directoryFlags)
      handles.push(current)
    }
    return await callback(fdPath(current))
  } finally {
    for (const handle of handles.reverse()) await handle.close()
  }
}

async function readSafe(root, path, limit) {
  const parts = path.split('/')
  const name = parts.pop()
  return directories(root, parts, async directory => {
    const handle = await open(directory + '/' + name, fileFlags)
    try {
      const info = await handle.stat()
      if (!info.isFile() || info.nlink !== 1 || info.size > limit) throw new ApiError(422, 'A workspace file is invalid or too large.')
      const buffer = Buffer.alloc(limit + 1)
      const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0)
      if (bytesRead > limit) throw new ApiError(422, 'A workspace file is too large.')
      return buffer.toString('utf8', 0, bytesRead)
    } finally {
      await handle.close()
    }
  })
}

const readOptional = (root, path, limit) => readSafe(root, path, limit).catch(error => {
  if (error.code === 'ENOENT') return null
  throw error
})
async function readJson(root, path) {
  const text = await readOptional(root, path, 8192)
  try { return JSON.parse(text ?? 'null') } catch { return null }
}

export function createEditorWorkspaces(dataDir, root = resolve(dataDir, 'editor/workspaces')) {
  const pendingCreation = new Map()
  const pendingSave = new Map()

  async function config() {
    const contents = await readFile(resolve(dataDir, 'editor.env'), 'utf8').catch(error => {
      if (error.code === 'ENOENT') throw offline()
      throw error
    })
    const { EDITOR_PASSWORD, EDITOR_PORT = '8180' } = parseEnv(contents)
    if (!EDITOR_PASSWORD || !/^\d{1,5}$/.test(EDITOR_PORT) || Number(EDITOR_PORT) > 65535) throw offline()
    return { password: EDITOR_PASSWORD, port: EDITOR_PORT }
  }

  async function connect(hostname) {
    const { password, port } = await config()
    const base = 'http://127.0.0.1:' + port
    try {
      const response = await fetch(base + '/login', {
        method: 'POST', body: new URLSearchParams({ password }), redirect: 'manual', signal: AbortSignal.timeout(3500),
      })
      const cookie = response.headers.getSetCookie()[0]?.split(';', 1)[0]
      if (!cookie || ![302, 303].includes(response.status)) throw new Error('Code-server sign-in failed')
      await response.body?.cancel()
      return { base: 'http://' + hostname + ':' + port, cookie: cookie + '; Path=/; HttpOnly; SameSite=Strict' }
    } catch {
      throw offline()
    }
  }

  async function create(key, selection, value) {
    await mkdir(root, { recursive: true, mode: 0o700 })
    await directories(root, [], async directory => {
      const exists = await directories(directory + '/.', [key], () => true).catch(error => {
        if (error.code === 'ENOENT') return false
        throw error
      })
      if (exists) return
      const staging = await mkdtemp(directory + '/.init-')
      try {
        const filename = codingLanguages[selection.id].filename
        const files = { [filename]: value?.code?.[selection.id] ?? selection.starter, ...projectFiles(selection, value) }
        files['.vscode/settings.json'] = JSON.stringify({ 'files.autoSave': 'afterDelay', 'files.autoSaveDelay': 350, 'files.exclude': { '.quiz': true } })
        await mkdir(staging + '/.quiz', { mode: 0o700 })
        for (const [path, source] of Object.entries(files)) {
          const parts = path.split('/')
          const name = parts.pop()
          await directories(staging, parts, parent => writeFile(parent + '/' + name, source, { flag: 'wx', mode: 0o600 }), true)
        }
        await rename(staging, directory + '/' + key)
      } finally {
        await rm(staging, { recursive: true, force: true })
      }
    })
  }

  async function openWorkspace(identity, selection, value, hostname) {
    const connection = await connect(hostname)
    const key = keyFor(identity)
    if (!pendingCreation.has(key)) pendingCreation.set(key, create(key, selection, value).finally(() => pendingCreation.delete(key)))
    await pendingCreation.get(key)
    const folder = '/quiz-workspaces/' + key
    const entry = codingLanguages[selection.id].filename
    const payload = [['openFile', 'vscode-remote://' + new URL(connection.base).host + folder + '/' + entry]]
    const params = new URLSearchParams({ folder, payload: JSON.stringify(payload) })
    return { editorUrl: connection.base + '/?' + params, cookie: connection.cookie }
  }

  async function sessionStats(workspace) {
    const names = await directories(workspace, ['.quiz'], directory => readdir(directory))
    const totals = Object.fromEntries(editorCounters.map(key => [key, 0]))
    let online = false
    for (const name of names.filter(name => activityPattern.test(name))) {
      const entry = await readJson(workspace, '.quiz/' + name)
      if (!entry) continue
      if (Number.isFinite(entry.updatedAt) && Date.now() - entry.updatedAt < 7000) online = true
      for (const counter of editorCounters) {
        if (Number.isSafeInteger(entry[counter]) && entry[counter] >= 0) totals[counter] += entry[counter]
      }
    }
    return { totals, online }
  }

  async function saveEditors(key, workspace) {
    if (pendingSave.has(key)) return pendingSave.get(key)
    const task = (async () => {
      const id = randomUUID()
      await directories(workspace, ['.quiz'], async control => {
        const temporary = control + '/request-' + id
        try {
          await writeFile(temporary, JSON.stringify({ id }), { flag: 'wx', mode: 0o600 })
          await rename(temporary, control + '/save.json')
        } finally {
          await rm(temporary, { force: true })
        }
      })
      for (let tries = 0; tries < 25; tries++) {
        const reply = await readJson(workspace, '.quiz/saved.json')
        if (reply?.id === id) {
          if (!reply.ok) throw new ApiError(409, 'VS Code could not save every file. Resolve the save error in the editor and retry.')
          return
        }
        await delay(140)
      }
      throw new ApiError(503, 'VS Code did not confirm the save. Reload the editor and try again.')
    })().finally(() => pendingSave.delete(key))
    pendingSave.set(key, task)
    return task
  }

  async function readWorkspace(identity, selection, { flush = false, requireEditor = false } = {}) {
    const key = keyFor(identity)
    try {
      return await directories(root, [key], async path => {
        const workspace = path + '/.'
        let stats = await sessionStats(workspace)
        if (requireEditor || (flush && stats.online)) {
          await saveEditors(key, workspace)
          stats = await sessionStats(workspace)
        }
        const readSource = async name => {
          const source = await readOptional(workspace, name, maxCodeLength * 4)
          if (source === null) throw new ApiError(422, name + ' is missing from the VS Code workspace.')
          if (source.length > maxCodeLength) throw new ApiError(422, name + ' exceeds the coding question size limit.')
          return source
        }
        const code = await readSource(codingLanguages[selection.id].filename)
        const files = {}
        for (const file of selection.files ?? []) files[file.path] = await readSource(file.path)
        const edited = code !== selection.starter || (selection.files ?? []).some(file => files[file.path] !== file.starter)
        return { code, files, edited, stats: stats.totals, editorOnline: stats.online }
      })
    } catch (error) {
      if (error.code === 'ENOENT' && !requireEditor) return null
      if (['ENOENT', 'ENOTDIR', 'ELOOP'].includes(error.code)) throw new ApiError(422, 'Restore the regular files in this VS Code workspace before running.')
      throw error
    }
  }

  return { openWorkspace, readWorkspace }
}
