import { resolve } from 'node:path'
import { createAttemptMedia } from './attempt-media.mjs'
import { connectMongo } from './mongo-store.mjs'

const dataDir = resolve('local-data')
const mongo = await connectMongo({ dataDir })
try {
  const { migrated, bytes } = await createAttemptMedia(mongo.db, dataDir).migrateImages()
  console.log('Migrated ' + migrated + ' exam images (' + bytes + ' bytes).')
} finally {
  await mongo.close()
}
