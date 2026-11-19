import { formats } from '../../../src/questions/index.js'

export const questionGenerators = 'quizeit.question-generators'
const modelPrefix = 'plugin:'

export function validGenerator(value) {
  return Boolean(value && typeof value.name === 'string' && value.name.trim()
    && typeof value.generate === 'function' && Array.isArray(value.formats) && value.formats.length
    && new Set(value.formats).size === value.formats.length && value.formats.every(type => Object.hasOwn(formats, type)))
}

export function listedGenerators(plugins) {
  return plugins.listContributions(questionGenerators).map(({ id, value }) => ({
    id: modelPrefix + id, name: value.name, formats: value.formats, efforts: [], attachments: false,
  }))
}

export function selectedGenerator(plugins, modelId) {
  if (typeof modelId !== 'string' || !modelId.startsWith(modelPrefix)) return undefined
  return plugins.listContributions(questionGenerators).find(({ id }) => modelPrefix + id === modelId)?.value ?? null
}
