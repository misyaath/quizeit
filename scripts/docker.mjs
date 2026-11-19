import { randomBytes, randomUUID } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { constants } from 'node:fs'
import { copyFile, mkdir, readFile, rename, rm, rmdir, writeFile } from 'node:fs/promises'
import { parseEnv } from 'node:util'
import { readEnvFile, readEnvText } from './env-file.mjs'

const envFile = '.env'
const projects = [
  { service: 'mongo', name: 'quizeit-mongo', file: 'compose.mongo.yml' },
  { service: 'judge0', name: 'azure-study-judge0', file: 'compose.judge0.yml' },
  { service: 'editor', name: 'azure-study-editor', file: 'compose.editor.yml' },
]
const [service = 'all'] = process.argv.slice(2).filter(arg => arg !== '--stop')
const stopping = process.argv.includes('--stop')
const selected = service === 'all' ? projects : projects.filter(project => project.service === service)
if (!selected.length) throw new Error('Choose mongo, judge0, editor, or all.')
if (!stopping && selected.some(project => project.service === 'editor') && !process.getuid?.()) {
  throw new Error('Start the local editor from your regular Linux user account.')
}

function docker(args, capture = false) {
  const result = spawnSync('docker', args, { encoding: 'utf8', stdio: capture ? ['ignore', 'pipe', 'inherit'] : 'inherit' })
  if (result.error) throw result.error
  if (result.status !== 0) process.exit(result.status ?? 1)
  return result.stdout?.trim()
}

function envValue(key, value) {
  if (/^[\w.-]+$/.test(value)) return value
  if (!/['\r\n]/.test(value)) return "'" + value + "'"
  if (!/["$\\\r\n]/.test(value)) return '"' + value + '"'
  throw new Error('Set ' + key + ' directly in .env.')
}

async function prepareEnv() {
  const password = () => randomBytes(32).toString('hex')
  const defaults = {
    QUIZEIT_MONGO_PORT: () => '27017',
    MONGO_INITDB_ROOT_USERNAME: () => 'quizeit',
    MONGO_INITDB_ROOT_PASSWORD: password,
    JUDGE0_TOKEN: password,
    JUDGE0_POSTGRES_PASSWORD: password,
    JUDGE0_REDIS_PASSWORD: password,
    EDITOR_PORT: () => '8180',
    EDITOR_UID: () => String(process.getuid?.() ?? 1000),
    EDITOR_GID: () => String(process.getgid?.() ?? 1000),
    EDITOR_PASSWORD: password,
  }
  const current = await readEnvText(envFile)
  let text = current || await readFile('.env.example', 'utf8')
  const settings = parseEnv(text)
  const missing = Object.entries(defaults).filter(([key]) => !settings[key])
  if (!missing.length) return

  const legacy = Object.assign({}, ...await Promise.all(
    projects.map(({ service }) => readEnvFile('local-data/' + service + '.env')),
  ))
  for (const [key, initialValue] of missing) {
    const value = process.env[key] || legacy[key] || initialValue()
    const line = key + '=' + envValue(key, value)
    const assignment = new RegExp('^[ \\t]*(?:export[ \\t]+)?' + key + '[ \\t]*=.*$', 'gm')
    text = assignment.test(text) ? text.replace(assignment, () => line) : text.trimEnd() + '\n' + line + '\n'
  }

  const temporary = '.env.' + randomUUID() + '.tmp'
  try {
    await writeFile(temporary, text, { mode: 0o600, flag: 'wx' })
    await rename(temporary, envFile)
  } finally {
    await rm(temporary, { force: true })
  }
}

async function prepareEditor() {
  const directory = 'local-data/editor'
  await mkdir(directory + '/workspaces', { recursive: true, mode: 0o700 })
  await mkdir(directory + '/user-data/User', { recursive: true, mode: 0o700 })
  await copyFile('docker/editor/settings.json', directory + '/user-data/User/settings.json', constants.COPYFILE_EXCL)
    .catch(error => { if (error.code !== 'EEXIST') throw error })
}

const envLock = '.env.lock'
await mkdir(envLock, { mode: 0o700 }).catch(error => {
  if (error.code === 'EEXIST') throw new Error('Another startup is preparing .env. Retry when it finishes.')
  throw error
})
try {
  await prepareEnv()
} finally {
  await rmdir(envLock)
}

for (const project of stopping ? selected.slice().reverse() : selected) {
  const compose = ['compose', '--env-file', envFile, '-p', project.name, '-f', project.file]
  if (stopping) {
    docker([...compose, 'stop'])
    continue
  }
  if (project.service === 'judge0' && docker(['info', '--format', '{{.CgroupVersion}}'], true) === '2') {
    compose.push('-f', 'compose.judge0.cgroup-v2.yml')
    docker([...compose, 'build', 'server'])
  }
  if (project.service === 'editor') await prepareEditor()
  const build = project.service === 'editor' ? '--build' : '--no-build'
  docker([...compose, 'up', '-d', build, '--wait', '--wait-timeout', '120'])
}
