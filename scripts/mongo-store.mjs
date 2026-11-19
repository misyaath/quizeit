import { randomUUID } from 'node:crypto'
import { resolve } from 'node:path'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { BSON, GridFSBucket, MongoClient } from 'mongodb'
import { readEnvFile } from './env-file.mjs'

export async function connectMongo({ dataDir, mongoUri = process.env.MONGODB_URI, mongoDatabase = process.env.MONGODB_DATABASE || 'quizeit' }) {
  if (!mongoUri) {
    const local = process.env
    const legacy = local.MONGO_INITDB_ROOT_USERNAME && local.MONGO_INITDB_ROOT_PASSWORD && local.QUIZEIT_MONGO_PORT
      ? {} : await readEnvFile(resolve(dataDir, 'mongo.env'))
    const user = local.MONGO_INITDB_ROOT_USERNAME || legacy.MONGO_INITDB_ROOT_USERNAME
    const password = local.MONGO_INITDB_ROOT_PASSWORD || legacy.MONGO_INITDB_ROOT_PASSWORD
    const port = local.QUIZEIT_MONGO_PORT || legacy.QUIZEIT_MONGO_PORT || '27017'
    if (!user || !password) throw new Error('Start MongoDB with npm run mongo:up, or set MONGODB_URI in .env.')
    if (!/^\d{1,5}$/.test(port) || Number(port) < 1 || Number(port) > 65535) {
      throw new Error('Set a valid QUIZEIT_MONGO_PORT in .env.')
    }
    mongoUri = `mongodb://${encodeURIComponent(user)}:${encodeURIComponent(password)}@127.0.0.1:${port}/?authSource=admin`
  }
  const client = new MongoClient(mongoUri, { serverSelectionTimeoutMS: 5000 })
  try {
    await client.db(mongoDatabase).command({ ping: 1 })
    return { db: client.db(mongoDatabase), close: () => client.close() }
  } catch (error) {
    await client.close()
    throw new Error('Could not connect to MongoDB. Check the container and connection settings (' + error.name + ').')
  }
}

export function mongoStore(db, id) {
  const collection = db.collection('app_state')
  const bucket = new GridFSBucket(db, { bucketName: 'large_state' })
  let pending = Promise.resolve()

  async function readEntry() {
    // A reader can race the removal of the previous GridFS version after a write.
    let entry = await collection.findOne({ _id: id })
    while (entry?.fileId) {
      try {
        const stream = bucket.openDownloadStream(entry.fileId)
        stream.setEncoding('utf8')
        let text = ''
        for await (const chunk of stream) text += chunk
        return { ...entry, value: JSON.parse(text) }
      } catch (error) {
        const latest = await collection.findOne({ _id: id })
        if (latest?.revision === entry.revision) throw error
        entry = latest
      }
    }
    return entry
  }

  async function stage(value) {
    const text = JSON.stringify(value)
    const entry = { _id: id, revision: randomUUID(), value: JSON.parse(text) }
    if (BSON.calculateObjectSize(entry) < 15 * 1024 * 1024) return entry
    const stream = bucket.openUploadStream(id)
    await pipeline(Readable.from([text]), stream)
    return { _id: id, revision: entry.revision, fileId: stream.id }
  }

  async function discard(entry) {
    if (entry?.fileId) {
      await bucket.delete(entry.fileId).catch(error => {
        console.warn('Could not remove an old MongoDB state version:', error.name)
      })
    }
  }

  async function initialize(load) {
    if (await collection.findOne({ _id: id }, { projection: { _id: 1 } })) return false
    const entry = await stage(await load())
    try {
      await collection.insertOne(entry)
      return true
    } catch (error) {
      if (error.code !== 11000) throw error
      await discard(entry)
      return false
    }
  }

  function update(change) {
    const task = pending.then(async () => {
      const current = await readEntry()
      if (!current) throw new Error('MongoDB state is missing: ' + id)
      const value = await change(current.value)
      const entry = await stage(value)
      const { matchedCount } = await collection.replaceOne({ _id: id, revision: current.revision }, entry)
      if (!matchedCount) {
        await discard(entry)
        throw new Error('MongoDB state changed during a write. Retry the request.')
      }
      await discard(current)
      return value
    })
    pending = task.then(() => {}, () => {})
    return task
  }

  async function read() {
    const entry = await readEntry()
    if (!entry) throw new Error('MongoDB state is missing: ' + id)
    return entry.value
  }

  return { initialize, read, update }
}
