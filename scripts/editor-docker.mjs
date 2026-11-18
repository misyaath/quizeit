import { randomBytes } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { copyFile, mkdir, writeFile } from 'node:fs/promises'
import { constants } from 'node:fs'

if (process.getuid?.() === undefined || process.getuid() === 0) {
  throw new Error('Start the local editor from your regular Linux user account.')
}
const directory = 'local-data/editor'
await mkdir(directory + '/workspaces', { recursive: true, mode: 0o700 })
await mkdir(directory + '/user-data/User', { recursive: true, mode: 0o700 })
async function createOnce(operation) {
  try { await operation() } catch (error) { if (error.code !== 'EEXIST') throw error }
}
await createOnce(() => copyFile('docker/editor/settings.json', directory + '/user-data/User/settings.json', constants.COPYFILE_EXCL))
const envFile = 'local-data/editor.env'
await createOnce(() => writeFile(envFile, [
  'EDITOR_UID=' + process.getuid(), 'EDITOR_GID=' + process.getgid(), 'EDITOR_PORT=8180',
  'EDITOR_PASSWORD=' + randomBytes(32).toString('hex'), '',
].join('\n'), { mode: 0o600, flag: 'wx' }))

const args = process.argv.includes('--stop') ? ['stop'] : ['up', '--build', '-d']
const result = spawnSync('docker', ['compose', '--env-file', envFile, '-f', 'compose.editor.yml', ...args], { stdio: 'inherit' })
if (result.error) throw result.error
process.exitCode = result.status ?? 1
