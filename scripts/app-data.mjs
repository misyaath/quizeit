import { randomUUID } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { emptyProgress } from '../src/attempts.js'
import { emptyExecutionSettings } from '../src/execution-settings.js'
import { mongoStore } from './mongo-store.mjs'
import { ApiError } from './openai.mjs'
import { currentUser } from './request-user.mjs'
import { loadCatalogSource, readCatalogSource, resolveCategory } from './question-files.mjs'

export async function initializeAppData(db, dataDir, questionsDir) {
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
  const userStore = (id, fallback, legacy) => {
    async function storeForRequest() {
      const user = currentUser()
      if (!user) throw new ApiError(401, 'Sign in to continue.')
      if (user.legacyOwner) return legacy
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
    return {
      read: async () => (await storeForRequest()).read(),
      update: async change => (await storeForRequest()).update(change),
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

  function visible(entry, user = currentUser()) {
    return !entry.archived && (!entry.ownerId || entry.ownerId === user?._id)
  }

  function canEdit(entry, user = currentUser()) {
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
    return loadCatalogSource({ categories: visibleCategories(source), documents: source.documents.filter(entry => visible(entry)) })
  }

  async function editableSets() {
    const source = await catalog.read()
    return {
      categories: visibleCategories(source),
      sets: source.documents.filter(entry => visible(entry) && canEdit(entry)).map(entry => ({
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
    let result
    await catalog.update(current => {
      const previous = id && current.documents.find(entry => entry.document.id === id)
      if (id) {
        editorDocument(previous)
        if ((previous.revision ?? null) !== revision) throw new ApiError(409, 'This set changed in another editor. Reopen it before saving.')
      }
      const destination = resolveCategory(current.categories, proposal)
      if (!destination) throw new ApiError(400, 'Choose a category and subcategory.')
      const { category: { providerId, examId } } = destination
      const ownerId = previous ? previous.ownerId : user && (generated || sharing !== 'shared' || user.role !== 'admin') ? user._id : undefined
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
      try {
        loadCatalogSource({ categories, documents: documents.filter(entry => !entry.archived) })
      } catch (error) {
        throw new ApiError(400, error.message)
      }
      result = { category: destination.category, categories: visibleCategories({ categories, documents }), ...(user && { saved: editorDocument(record) }) }
      return { categories, documents }
    })
    return result
  }

  async function archiveQuestionSet(id, revision) {
    await catalog.update(current => {
      const entry = current.documents.find(item => item.document.id === id)
      editorDocument(entry)
      if ((entry.revision ?? null) !== revision) throw new ApiError(409, 'This set changed in another editor. Reopen it before archiving.')
      return { ...current, documents: current.documents.map(item => item === entry ? { ...item, archived: true } : item) }
    })
  }

  async function saveQuestionSet(proposal, document) {
    const { category, categories } = await writeQuestionSet({ proposal, document, generated: true })
    return { category, categories }
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

  return { ...stores, initialized, readCatalog, saveQuestionSet, importQuestionFiles, editableSets, editQuestionSet, writeQuestionSet, archiveQuestionSet }
}
