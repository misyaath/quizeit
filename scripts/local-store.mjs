import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import { dirname } from 'node:path'

export function jsonFile(path, initialValue) {
  let pending = Promise.resolve()

  async function read() {
    try {
      return JSON.parse(await readFile(path, 'utf8'))
    } catch (error) {
      if (error.code === 'ENOENT') return initialValue()
      throw error
    }
  }

  function update(change) {
    const task = pending.then(async () => {
      const current = await read()
      const next = await change(current)
      await mkdir(dirname(path), { recursive: true, mode: 0o700 })
      const temporary = path + '.' + randomUUID() + '.tmp'
      try {
        await writeFile(temporary, JSON.stringify(next, null, 2) + '\n', { mode: 0o600 })
        await rename(temporary, path)
      } finally {
        await rm(temporary, { force: true })
      }
      return next
    })
    pending = task.catch(() => {})
    return task
  }

  return { read, update }
}
