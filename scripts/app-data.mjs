import { randomUUID } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { emptyProgress } from '../src/attempts.js'
import { emptyExecutionSettings } from '../src/execution-settings.js'
import { mongoStore } from './mongo-store.mjs'
import { ApiError } from './openai.mjs'
import { createAttemptMedia } from './attempt-media.mjs'
import { currentUser } from './request-user.mjs'
import { loadCatalogSource, readCatalogSource, resolveCategory } from './question-files.mjs'

export async function initializeAppData(db, dataDir, questionsDir, realExams) {
  const definitions = {
    progress: ['attempts.json', emptyProgress],
    executionSettings: ['execution-settings.json', emptyExecutionSettings],
    bankExplanations: ['bank-explanations.json', () => ({})],
    chatgptAuth: ['chatgpt-auth.json', () => ({ hostId: null, account: null })],
    platformTools: ['openai-platform.json', () => ({ apiKey: '', enabled: false, storeId: null, files: [] })],
  }
  const stores = {}
  const initialized = []
  const perAccount = new Map()
  const users = db.collection('users')
  const media = createAttemptMedia(db, dataDir)
  let progressStoreForUser
  async function reviewAccounts(includeCandidates = false) {
    const accounts = await users.find({}, { projection: { firstName: 1, lastName: 1, email: 1, role: 1, legacyOwner: 1 } }).toArray()
    return includeCandidates && realExams ? [...accounts, ...await realExams.reviewCandidates()] : accounts
  }
  async function reviewProgress(user) {
    if (currentUser()?.role !== 'admin') throw new ApiError(403, 'Only administrators can review other accounts.')
    const key = user.legacyOwner && user.role === 'admin' ? 'progress' : 'progress:' + user._id
    if (!await db.collection('app_state').findOne({ _id: key }, { projection: { _id: 1 } })) return emptyProgress()
    return (await progressStoreForUser(user)).read()
  }
  async function reviewAccount(id) {
    const user = await users.findOne({ _id: id }, { projection: { firstName: 1, lastName: 1, role: 1, legacyOwner: 1 } }) ?? await realExams?.reviewCandidate(id)
    if (!user) throw new ApiError(404, 'Account not found.')
    return { ...user, legacyOwner: user.role === 'admin' && user.legacyOwner === true }
  }
  const userStore = (id, fallback, legacy) => {
    async function storeForUser(user) {
      if (!user) throw new ApiError(401, 'Sign in to continue.')
      if (user.legacyOwner && user.role === 'admin') return legacy
      const key = id + ':' + user._id
      if (!perAccount.has(key)) {
        const store = mongoStore(db, key)
        perAccount.set(key, store.initialize(fallback).then(() => store).catch(error => {
          perAccount.delete(key)
          throw error
        }))
      }
      return perAccount.get(key)
    }
    if (id === 'progress') progressStoreForUser = storeForUser
    return {
      read: async () => (await storeForUser(currentUser())).read(),
      update: async change => (await storeForUser(currentUser())).update(change),
    }
  }
  for (const [id, [file, initialValue]] of Object.entries(definitions)) {
    const store = mongoStore(db, id)
    const created = await store.initialize(async () => {
      const text = await readFile(resolve(dataDir, file), 'utf8').catch(error => {
        if (error.code === 'ENOENT') return null
        throw error
      })
      if (text === null) return initialValue()
      try {
        return JSON.parse(text)
      } catch {
        throw new Error('Could not migrate invalid JSON in ' + file + '.')
      }
    })
    if (created) initialized.push(id)
    stores[id] = id === 'executionSettings' ? store : userStore(id, initialValue, store)
  }

  const catalog = mongoStore(db, 'catalog')
  if (await catalog.initialize(async () => {
    const source = await readCatalogSource(questionsDir)
    loadCatalogSource(source)
    return source
  })) initialized.push('catalog')

  const modeOf = entry => entry.document.mode === 'exam' ? 'exam' : 'practice'
  function visible(entry, user = currentUser()) {
    if (entry.archived) return false
    if (modeOf(entry) === 'exam') return user?.role === 'admin'
    return !entry.ownerId || entry.ownerId === user?._id
  }

  function canEdit(entry, user = currentUser()) {
    if (modeOf(entry) === 'exam') return user?.role === 'admin'
    return entry.ownerId ? entry.ownerId === user?._id : user?.role === 'admin'
  }

  function visibleCategories(source) {
    const user = currentUser()
    return source.categories.flatMap(({ exams, ...category }) => {
      const available = exams.filter(exam => !exam.privateOnly || source.documents.some(entry =>
        visible(entry, user) && entry.providerId === category.id && entry.examId === exam.id))
      return available.length || !exams.length ? [{ ...category, exams: available.map(({ id, name }) => ({ id, name })) }] : []
    })
  }

  async function readCatalog() {
    const source = await catalog.read()
    const documents = source.documents.filter(entry => modeOf(entry) === 'practice' && visible(entry))
    return loadCatalogSource({ categories: visibleCategories({ ...source, documents }), documents })
  }

  async function examSources() {
    if (currentUser()?.role !== 'admin') throw new ApiError(403, 'Only administrators can access the exam bank.')
    const source = await catalog.read()
    return loadCatalogSource({ ...source, documents: source.documents.filter(entry => modeOf(entry) === 'exam' && visible(entry)) }).sets
  }

  async function editableSets(mode = 'practice') {
    if (mode === 'exam' && currentUser()?.role !== 'admin') throw new ApiError(403, 'Only administrators can access the exam bank.')
    const source = await catalog.read()
    return {
      categories: visibleCategories({ ...source, documents: source.documents.filter(entry => modeOf(entry) === mode) }),
      sets: source.documents.filter(entry => modeOf(entry) === mode && visible(entry) && canEdit(entry)).map(entry => ({
        id: entry.document.id, title: entry.document.title, providerId: entry.providerId, examId: entry.examId,
        count: entry.document.questions.length, private: Boolean(entry.ownerId),
      })),
    }
  }

  function editorDocument(entry) {
    if (!entry || !visible(entry)) throw new ApiError(404, 'Question set not found.')
    if (!canEdit(entry)) throw new ApiError(403, 'Only the owner can edit this set.')
    return { document: entry.document, providerId: entry.providerId, examId: entry.examId,
      revision: entry.revision ?? null, private: Boolean(entry.ownerId) }
  }

  async function editQuestionSet(id) {
    return editorDocument((await catalog.read()).documents.find(entry => entry.document.id === id))
  }

  async function writeQuestionSet({ id, revision, proposal, document, sharing, generated = false }) {
    const user = currentUser()
    const exam = document.mode === 'exam'
    if (exam && user?.role !== 'admin') throw new ApiError(403, 'Only administrators can create real exam questions.')
    let result
    await catalog.update(current => {
      const previous = id && current.documents.find(entry => entry.document.id === id)
      if (id) {
        editorDocument(previous)
        if ((modeOf(previous) === 'exam') !== exam) throw new ApiError(400, 'A saved set belongs to its original bank.')
        if ((previous.revision ?? null) !== revision) throw new ApiError(409, 'This set changed in another editor. Reopen it before saving.')
      }
      const destination = resolveCategory(current.categories, proposal)
      if (!destination) throw new ApiError(400, 'Choose a category and subcategory.')
      const { category: { providerId, examId } } = destination
      const ownerId = previous ? previous.ownerId : user && (exam || generated || sharing !== 'shared' || user.role !== 'admin') ? user._id : undefined
      const oldExam = current.categories.find(item => item.id === providerId)?.exams.find(item => item.id === examId)
      const categories = destination.categories.map(provider => provider.id !== providerId ? provider : {
        ...provider, exams: provider.exams.map(exam => exam.id !== examId ? exam : {
          id: exam.id, name: exam.name, ...(ownerId && (!oldExam || oldExam.privateOnly) && { privateOnly: true }),
        }),
      })
      const record = {
        file: [providerId, examId, document.id + '.json'].join('/'), providerId, examId,
        ownerId, document, revision: randomUUID(),
      }
      const documents = previous ? current.documents.map(entry => entry === previous ? record : entry) : [...current.documents, record]
      let normalized
      try {
        normalized = loadCatalogSource({ categories, documents: documents.filter(entry => !entry.archived) })
      } catch (error) {
        throw new ApiError(400, error.message)
      }
      result = { category: destination.category, categories: visibleCategories({ categories, documents: documents.filter(entry => modeOf(entry) === modeOf(record)) }),
        ...(generated && { set: normalized.sets.find(set => set.id === document.id) }),
        ...(user && { saved: editorDocument(record) }),
      }
      return { categories, documents }
    })
    return result
  }

  async function archiveQuestionSet(id, revision) {
    await catalog.update(current => {
      const entry = current.documents.find(item => item.document.id === id)
      editorDocument(entry)
      if ((entry.revision ?? null) !== revision) throw new ApiError(409, 'This set changed in another editor. Reopen it before deleting.')
      return { ...current, documents: current.documents.map(item => item === entry ? { ...item, archived: true } : item) }
    })
  }

  async function saveQuestionSet(proposal, document) {
    const { category, categories, set } = await writeQuestionSet({ proposal, document, generated: true })
    return { category, categories, set }
  }

  async function importQuestionFiles() {
    const source = await readCatalogSource(questionsDir)
    await catalog.update(current => {
      const providers = new Map(current.categories.map(provider => [provider.id, provider]))
      for (const provider of source.categories) {
        const exams = new Map(providers.get(provider.id)?.exams.map(exam => [exam.id, exam]))
        for (const exam of provider.exams) exams.set(exam.id, exam)
        providers.set(provider.id, { ...provider, exams: [...exams.values()] })
      }
      const documents = new Map(current.documents.map(record => [record.document.id, record]))
      for (const record of source.documents) {
        const previous = documents.get(record.document.id)
        if (!previous?.revision && !previous?.archived) documents.set(record.document.id, record)
      }
      const next = { categories: [...providers.values()], documents: [...documents.values()] }
      loadCatalogSource({ ...next, documents: next.documents.filter(entry => !entry.archived) })
      return next
    })
  }

  return { ...stores, media, reviewAccounts, reviewAccount, reviewProgress, initialized, readCatalog, examSources, saveQuestionSet, importQuestionFiles, editableSets, editQuestionSet, writeQuestionSet, archiveQuestionSet }
}
