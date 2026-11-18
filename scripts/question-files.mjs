import { createHash, randomUUID } from 'node:crypto'
import { mkdir, readdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { loadQuestionSets } from '../src/questions/load.js'

export const questionFolder = resolve('questions')
const isId = value => typeof value === 'string' && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value)
const isName = value => typeof value === 'string' && value.trim().length > 0

async function readJson(path) {
  try {
    return JSON.parse(await readFile(path, 'utf8'))
  } catch (error) {
    throw new Error(path + ' — ' + error.message, { cause: error })
  }
}

async function directories(categories, folder) {
  const documents = []
  for (const { id: providerId, exams } of categories) {
    for (const { id: examId } of exams) {
      const directory = join(folder, providerId, examId)
      const entries = await readdir(directory, { withFileTypes: true }).catch(error => {
        if (error.code === 'ENOENT') return []
        throw error
      })
      const names = entries.filter(entry => entry.isFile() && entry.name.endsWith('.json')).map(entry => entry.name).sort()
      const files = await Promise.all(names.map(async name => {
        const file = join(providerId, examId, name)
        return { file, providerId, examId, document: await readJson(join(folder, file)) }
      }))
      documents.push(...files)
    }
  }
  return documents
}

async function readCategories(folder) {
  const categories = await readJson(join(folder, 'categories.json'))
  if (!Array.isArray(categories) || new Set(categories.map(item => item?.id)).size !== categories.length) {
    throw new Error('categories.json must contain an array of providers with unique IDs.')
  }
  for (const provider of categories) {
    if (!isId(provider?.id) || !isName(provider.name) || !Array.isArray(provider.exams)
      || new Set(provider.exams.map(item => item?.id)).size !== provider.exams.length
      || provider.exams.some(item => !isId(item?.id) || !isName(item.name))) {
      throw new Error('categories.json requires provider and exam names and unique lowercase IDs with optional hyphens.')
    }
  }
  return categories
}

export async function readCatalog(folder = questionFolder) {
  const categories = await readCategories(folder)
  const documents = await directories(categories, folder)
  const sets = loadQuestionSets(documents)
  return { categories, sets }
}

function displayName(value) {
  return typeof value === 'string' ? value.replace(/\s+/g, ' ').trim().slice(0, 100) : ''
}

function categoryId(name, entries, prefix) {
  const stem = name.normalize('NFKD').replace(/\p{Mark}/gu, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 52).replace(/-$/, '')
  const used = new Set(entries.map(item => item.id))
  if (stem && !used.has(stem)) return stem
  const digest = createHash('sha256').update(name.toLowerCase()).digest('hex').slice(0, 10)
  let id = (stem || prefix) + '-' + digest
  for (let suffix = 2; used.has(id); suffix++) id = (stem || prefix) + '-' + digest + '-' + suffix
  return id
}

function findCategory(entries, id, name) {
  return entries.find(item => item.id === id)
    ?? (name && entries.find(item => item.name.trim().toLowerCase() === name.toLowerCase()))
}

export function resolveCategory(categories, proposal) {
  const providerName = displayName(proposal.providerName)
  const examName = displayName(proposal.examName)
  const knownProvider = findCategory(categories, proposal.providerId, providerName)
  const provider = knownProvider || (providerName && { id: categoryId(providerName, categories, 'provider'), name: providerName, exams: [] })
  if (!provider) return null

  const knownExam = findCategory(provider.exams, proposal.examId, examName)
  const exam = knownExam || (examName && { id: categoryId(examName, provider.exams, 'exam'), name: examName })
  if (!exam) return null

  const updatedProvider = knownExam ? provider : { ...provider, exams: [...provider.exams, exam] }
  const updatedCategories = !knownProvider ? [...categories, updatedProvider]
    : knownExam ? categories : categories.map(item => item.id === provider.id ? updatedProvider : item)
  return {
    category: { providerId: provider.id, examId: exam.id, providerName: provider.name, examName: exam.name },
    categories: updatedCategories,
  }
}

async function writeJson(file, value) {
  const temporary = file + '.' + randomUUID() + '.tmp'
  try {
    await writeFile(temporary, JSON.stringify(value, null, 2) + '\n', { flag: 'wx' })
    await rename(temporary, file)
  } finally {
    await rm(temporary, { force: true })
  }
}

export async function saveQuestionSet(folder, proposal, document) {
  const current = await readCategories(folder)
  const destination = resolveCategory(current, proposal)
  if (!destination) throw new Error('The generated category no longer resolves.')
  const { category, categories } = destination
  const { providerId, examId } = category
  const directory = join(folder, providerId, examId)
  await mkdir(directory, { recursive: true })
  const file = join(directory, document.id + '.json')
  await writeJson(file, document)
  if (categories !== current) {
    try {
      await writeJson(join(folder, 'categories.json'), categories)
    } catch (error) {
      await rm(file, { force: true })
      throw error
    }
  }
  return destination
}
