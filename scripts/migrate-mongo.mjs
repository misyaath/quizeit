import { resolve } from 'node:path'
import { initializeAppData } from './app-data.mjs'
import { connectMongo } from './mongo-store.mjs'
import { questionFolder } from './question-files.mjs'

const dataDir = resolve('local-data')
const mongo = await connectMongo({ dataDir })
try {
  const data = await initializeAppData(mongo.db, dataDir, questionFolder)
  console.log(data.initialized.length
    ? 'Initialized MongoDB stores: ' + data.initialized.join(', ')
    : 'MongoDB stores already initialized.')
  if (process.argv.includes('--questions')) {
    await data.importQuestionFiles()
    console.log('Imported question files into MongoDB.')
  }
} finally {
  await mongo.close()
}
