import { resolve } from 'node:path'
import { connectMongo, mongoStore } from './mongo-store.mjs'
import { createAccounts } from './accounts.mjs'

function mergeProgress(legacy, account) {
  const snapshots = [...legacy.snapshots]
  const indexes = account.snapshots.map(snapshot => {
    const known = snapshots.indexOf(snapshot)
    if (known !== -1) return known
    snapshots.push(snapshot)
    return snapshots.length - 1
  })
  const ids = new Set(legacy.history.map(entry => entry.id))
  const history = [...legacy.history, ...account.history.filter(entry => !ids.has(entry.id)).map(entry => ({
    ...entry, snapshotIndex: indexes[entry.snapshotIndex],
  }))].sort((a, b) => (a.submittedAt ?? '').localeCompare(b.submittedAt ?? ''))
  const attempts = { ...legacy.attempts }
  for (const [id, attempt] of Object.entries(account.attempts)) {
    if (!attempts[id] || (attempt.activity?.startedAt ?? 0) >= (attempts[id].activity?.startedAt ?? 0)) attempts[id] = attempt
  }
  return { ...legacy, attempts, history, snapshots }
}

const email = process.argv[2]?.trim().toLowerCase()
if (!email) throw new Error('Usage: npm run account:owner -- your-account-email')
const mongo = await connectMongo({ dataDir: resolve('local-data') })
try {
  await createAccounts(mongo.db)
  const users = mongo.db.collection('users')
  const user = await users.findOne({ email }, { projection: { role: 1, legacyOwner: 1 } })
  if (!user) throw new Error('Create your quizeit account before assigning it the existing data.')
  const existing = await users.findOne({ legacyOwner: true }, { projection: { _id: 1 } })
  if (existing && existing._id !== user._id) throw new Error('The existing data already belongs to another owner account.')

  if (!user.legacyOwner || user.role !== 'admin') {
    // Reserve the unique owner slot before copying any account data.
    try { await users.updateOne({ _id: user._id }, { $set: { legacyOwner: true } }) }
    catch (error) {
      if (error.code === 11000) throw new Error('The existing data already belongs to another owner account.')
      throw error
    }
    const collections = mongo.db.collection('app_state')
    const mergers = {
      progress: mergeProgress,
      bankExplanations: (legacy, account) => ({ ...legacy, ...account }),
      chatgptAuth: (legacy, account) => legacy.account ? legacy : account,
      platformTools: (legacy, account) => legacy.apiKey ? legacy : account,
    }
    for (const [name, merge] of Object.entries(mergers)) {
      const accountId = name + ':' + user._id
      if (!await collections.findOne({ _id: accountId }, { projection: { _id: 1 } })) continue
      const value = await mongoStore(mongo.db, accountId).read()
      await mongoStore(mongo.db, name).update(legacy => merge(legacy, value))
    }
    await users.updateOne({ _id: user._id, legacyOwner: true }, { $set: { role: 'admin' } })
  }
  console.log('The owner account now has access to the shared catalog and existing practice data.')
} finally {
  await mongo.close()
}
