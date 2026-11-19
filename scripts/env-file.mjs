import { readFile } from 'node:fs/promises'
import { parseEnv } from 'node:util'

export async function readEnvText(path) {
  return readFile(path, 'utf8').catch(error => {
    if (error.code === 'ENOENT') return ''
    throw error
  })
}

export async function readEnvFile(path) {
  return parseEnv(await readEnvText(path))
}
