export const maxCodeLength = 12_000
export const maxRunOutput = 2_000
export const maxProjectFiles = 6

export const codingLanguages = {
  python: { label: 'Python', filename: 'solution.py', runtime: /^Python \(3/ },
  javascript: { label: 'JavaScript', filename: 'solution.js', runtime: /^JavaScript \(Node/ },
  typescript: { label: 'TypeScript', filename: 'solution.ts', runtime: /^TypeScript \(/ },
  csharp: { label: 'C#', filename: 'Main.cs', runtime: /^C# \(/ },
  java: { label: 'Java', filename: 'Main.java', runtime: /^Java \(/ },
  go: { label: 'Go', filename: 'main.go', runtime: /^Go \(/ },
  rust: { label: 'Rust', filename: 'main.rs', runtime: /^Rust \(/ },
  c: { label: 'C', filename: 'main.c', runtime: /^C \((?:GCC|Clang)/i, preferred: /GCC/i },
  cpp: { label: 'C++', filename: 'main.cpp', runtime: /^C\+\+ \((?:GCC|Clang)/i, preferred: /GCC/i },
  php: { label: 'PHP', filename: 'solution.php', runtime: /^PHP \(/ },
  ruby: { label: 'Ruby', filename: 'solution.rb', runtime: /^Ruby \(/ },
  bash: { label: 'Bash', filename: 'solution.sh', runtime: /^Bash \(/ },
  lua: { label: 'Lua', filename: 'solution.lua', runtime: /^Lua \(/ },
  assembly: { label: 'Assembly (NASM)', filename: 'solution.asm', runtime: /^Assembly \(NASM/i },
  basic: { label: 'Basic', filename: 'solution.bas', runtime: /^Basic \(/i },
  clojure: { label: 'Clojure', filename: 'solution.clj', runtime: /^Clojure \(/ },
  cobol: { label: 'COBOL', filename: 'solution.cob', runtime: /^COBOL \(/ },
  'common-lisp': { label: 'Common Lisp', filename: 'solution.lisp', runtime: /^Common Lisp \(/ },
  d: { label: 'D', filename: 'solution.d', runtime: /^D \(/ },
  elixir: { label: 'Elixir', filename: 'solution.exs', runtime: /^Elixir \(/ },
  erlang: { label: 'Erlang', filename: 'main.erl', runtime: /^Erlang \(/ },
  fsharp: { label: 'F#', filename: 'Main.fs', runtime: /^F# \(/ },
  fortran: { label: 'Fortran', filename: 'solution.f90', runtime: /^Fortran \(/ },
  groovy: { label: 'Groovy', filename: 'solution.groovy', runtime: /^Groovy \(/ },
  haskell: { label: 'Haskell', filename: 'Main.hs', runtime: /^Haskell \(/ },
  kotlin: { label: 'Kotlin', filename: 'Main.kt', runtime: /^Kotlin \(/ },
  'objective-c': { label: 'Objective-C', filename: 'main.m', runtime: /^Objective-C \(/ },
  ocaml: { label: 'OCaml', filename: 'solution.ml', runtime: /^OCaml \(/ },
  octave: { label: 'Octave', filename: 'solution.m', runtime: /^Octave \(/ },
  pascal: { label: 'Pascal', filename: 'solution.pas', runtime: /^Pascal \(/ },
  perl: { label: 'Perl', filename: 'solution.pl', runtime: /^Perl \(/ },
  prolog: { label: 'Prolog', filename: 'solution.pro', runtime: /^Prolog \(/ },
  'python-2': { label: 'Python 2', filename: 'solution.py', runtime: /^Python \(2/ },
  r: { label: 'R', filename: 'solution.r', runtime: /^R \(/ },
  scala: { label: 'Scala', filename: 'Main.scala', runtime: /^Scala \(/ },
  sql: { label: 'SQL (SQLite)', filename: 'solution.sql', runtime: /^SQL \(SQLite/ },
  swift: { label: 'Swift', filename: 'main.swift', runtime: /^Swift \(/ },
  'visual-basic': { label: 'Visual Basic .NET', filename: 'Main.vb', runtime: /^Visual Basic\.Net \(/i },
}

export const projectLanguages = ['python', 'javascript', 'php']

export function codingSelection(question, language) {
  if (!Object.hasOwn(codingLanguages, language)) return null
  return question.languages.find(item => item.id === language) ?? { id: language, starter: '' }
}

export function codingOptions() {
  return Object.entries(codingLanguages).map(([id, { label }]) => ({ id, label }))
    .sort((a, b) => a.label.localeCompare(b.label))
}

export function validProjectPath(path, extension) {
  return typeof path === 'string' && path.length <= 100 && path.endsWith(extension)
    && /^(?:[a-z_][a-z_0-9-]*\/){0,3}[a-z_][a-z_0-9-]*\.[a-z]+$/i.test(path)
}

export function projectFiles(language, value) {
  return Object.fromEntries((language.files ?? []).map(file =>
    [file.path, value?.files?.[language.id]?.[file.path] ?? file.starter]))
}

export function activeCode(value) {
  const source = value?.code?.[value.language]
  return typeof source === 'string' ? source : ''
}

export function hasCodingResponse(value) {
  return Boolean(activeCode(value).trim() || Object.values(value?.files?.[value?.language] ?? {})
    .some(source => typeof source === 'string'))
}

export function publicCodingCatalog(catalog) {
  return { ...catalog, sets: catalog.sets.map(publicCodingSet) }
}

export function publicCodingSet(set) {
  return {
    ...set,
    questions: set.questions.map(question => question.type === 'coding'
      ? { ...question, tests: question.tests.filter(test => !test.hidden) }
      : question),
  }
}

export function practiceSet(set) {
  return {
    ...set,
    questions: publicCodingSet(set).questions.map(({ answer, explanation, ...question }) => ({
      ...question,
      ...(question.type === 'multi' && { answerCount: answer?.length ?? question.answerCount }),
      ...(['match', 'order'].includes(question.type) && { options: [...question.options].sort() }),
      ...(question.type === 'coding' && {
        languages: question.languages.map(({ id, starter, files }) => ({
          id, starter, ...(files && { files: files.map(({ path, starter }) => ({ path, starter })) }),
        })),
      }),
    })),
  }
}

export function practiceProgress(progress) {
  const attempts = Object.fromEntries(Object.entries(progress.attempts).map(([setId, { setSnapshot, ...attempt }]) => {
    const { clock, ...activity } = attempt.activity ?? {}
    return [setId, {
      ...attempt, ...(attempt.activity && { activity }),
      ...(!attempt.submitted && setSnapshot && { practiceSet: practiceSet(setSnapshot) }),
    }]
  }))
  return { ...progress, attempts }
}
