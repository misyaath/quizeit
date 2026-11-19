import { editor, languages, Uri } from 'monaco-editor/editor/editor.main'

globalThis.MonacoEnvironment = {
  getWorker(_moduleId, label) {
    const typescript = label === 'javascript' || label === 'typescript'
    const filename = typescript ? 'code-typescript-worker.js' : 'code-worker.js'
    return new Worker(new URL(filename, import.meta.url), { name: label, type: 'module' })
  },
}

const pythonBuiltins = [
  'abs', 'all', 'any', 'bool', 'dict', 'enumerate', 'filter', 'float', 'input', 'int', 'len',
  'list', 'map', 'max', 'min', 'open', 'print', 'range', 'round', 'set', 'sorted', 'str', 'sum', 'tuple', 'zip',
]

languages.registerCompletionItemProvider('python', {
  provideCompletionItems(model, position) {
    const word = model.getWordUntilPosition(position)
    const range = {
      startLineNumber: position.lineNumber, endLineNumber: position.lineNumber,
      startColumn: word.startColumn, endColumn: word.endColumn,
    }
    return {
      suggestions: pythonBuiltins.map(name => ({
        label: name, kind: languages.CompletionItemKind.Function, insertText: name, range, detail: 'Python built-in',
      })),
    }
  },
})

const languageAliases = { bash: 'shell', c: 'cpp', 'python-2': 'python', 'visual-basic': 'vb' }
const installedLanguages = new Set(languages.getLanguages().map(language => language.id))

export function editorLanguage(id) {
  const language = languageAliases[id] ?? id
  return installedLanguages.has(language) ? language : 'plaintext'
}

export { editor, Uri }
