import { createCipheriv, createDecipheriv, createHash, randomBytes, randomUUID } from 'node:crypto'
import { link, mkdir, readFile, unlink, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

async function readKey(dataDir) {
  const path = join(dataDir, 'exam-invitation.key')
  try { return await readFile(path) }
  catch (error) { if (error.code !== 'ENOENT') throw error }
  await mkdir(dataDir, { recursive: true, mode: 0o700 })
  const temporary = path + '.' + randomUUID()
  await writeFile(temporary, randomBytes(32), { flag: 'wx', mode: 0o600 })
  try { await link(temporary, path) }
  catch (error) { if (error.code !== 'EEXIST') throw error }
  finally { await unlink(temporary) }
  return readFile(path)
}

export async function createInvitationLinks(dataDir) {
  const key = await readKey(dataDir)
  if (key.length !== 32) throw new Error('The local exam invitation key is invalid.')
  const keyId = createHash('sha256').update(key).digest('hex').slice(0, 16)
  const canOpen = sealed => typeof sealed === 'string' && sealed.startsWith(keyId + '.')
  return {
    canOpen,
    seal(id, token) {
      const iv = randomBytes(12)
      const cipher = createCipheriv('aes-256-gcm', key, iv)
      cipher.setAAD(Buffer.from(id))
      const encrypted = Buffer.concat([cipher.update(token, 'utf8'), cipher.final()])
      return keyId + '.' + Buffer.concat([iv, cipher.getAuthTag(), encrypted]).toString('base64url')
    },
    open(id, sealed) {
      if (!canOpen(sealed)) return null
      try {
        const bytes = Buffer.from(sealed.slice(keyId.length + 1), 'base64url')
        const decipher = createDecipheriv('aes-256-gcm', key, bytes.subarray(0, 12))
        decipher.setAAD(Buffer.from(id))
        decipher.setAuthTag(bytes.subarray(12, 28))
        return Buffer.concat([decipher.update(bytes.subarray(28)), decipher.final()]).toString('utf8')
      } catch {
        return null
      }
    },
  }
}
