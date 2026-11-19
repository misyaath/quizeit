import { domains, formats, generalDomain } from './index.js'
import { codingLanguages, maxCodeLength, maxProjectFiles, maxRunOutput, projectLanguages, validProjectPath } from '../coding.js'

import { questionLimitFields, setLimitFields, validLimitOverrides } from '../execution-settings.js'

import { defaultVideoSeconds, maxVideoSeconds, defaultWebcamPhotoSeconds, minWebcamPhotoSeconds, maxWebcamPhotoSeconds } from '../exam-media.js'

const validText = value => typeof value === 'string' && value.trim().length > 0
const validId = value => validText(value) && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value)
  && !Object.hasOwn(Object.prototype, value)
const exhibitsValid = exhibits => exhibits === undefined || (Array.isArray(exhibits) &&
  exhibits.every(item => validText(item?.title) && validText(item?.code)))
const textList = (values, min) => Array.isArray(values) && values.length >= min
  && values.every(validText) && new Set(values).size === values.length

export function loadQuestionSets(documents) {
  const sets = []
  const setIds = new Set()
  const questionIds = new Set()
  for (const { file, document, providerId, examId, ownerId } of documents) {
    const fail = message => { throw new Error(file + ' — ' + message) }
    if (!document || typeof document !== 'object') fail('Expected a JSON object.')
    const { id, title, questions, difficulty } = document
    const studyFiles = Array.isArray(document.studyFiles) ? document.studyFiles.filter(validText) : []
    const attachmentNames = Array.isArray(document.attachmentNames) ? document.attachmentNames.filter(validText) : []
    const sources = Array.isArray(document.sources) ? document.sources.filter(source => {
      try {
        const url = new URL(source?.url)
        return validText(source.title) && ['https:', 'http:'].includes(url.protocol) && !url.username && !url.password
      } catch {
        return false
      }
    }) : []
    if (!validId(id)) fail('Set id must use lowercase letters, digits, and hyphens.')
    if (difficulty !== undefined && (!Number.isInteger(difficulty) || difficulty < 1 || difficulty > 10)) fail('Difficulty must be an integer from 1 to 10.')
    if (!validLimitOverrides(document.limits, setLimitFields)) fail('Set limits are invalid.')
    if (document.mode !== undefined && !['practice', 'exam'].includes(document.mode)) fail('Choose Practice or Exam mode.')
    const webcamPhotoSeconds = document.webcamPhotoSeconds ?? defaultWebcamPhotoSeconds
    if (document.mode === 'exam' && (!Number.isInteger(webcamPhotoSeconds) || webcamPhotoSeconds < minWebcamPhotoSeconds
      || webcamPhotoSeconds > maxWebcamPhotoSeconds)) fail('Webcam photo interval must be from 5 to 300 seconds.')
    if (!validText(title)) fail('Set title is required.')
    if (!Array.isArray(questions) || questions.length === 0) fail('Add at least one question to the questions array.')

    const normalized = questions.map((question, index) => {
      const check = (condition, message) => {
        if (!condition) fail('Question ' + (index + 1) + ' — ' + message)
      }
      check(question && typeof question === 'object', 'Expected an object.')
      const { id, domain: domainId, type, prompt, answer, explanation, options, labels, caseStudy, exhibits, languages, tests } = question
      const domain = domainId === generalDomain.id ? generalDomain : domains.find(domain => domain.id === domainId)
      check(validId(id), 'Question id must use lowercase letters, digits, and hyphens.')
      check(!questionIds.has(id), 'Use a unique question id across all files.')
      check(domain, 'Use a supported domain.')
      check(Object.hasOwn(formats, type), 'Use a supported question type.')
      check(validLimitOverrides(question.limits, type === 'coding' ? questionLimitFields : questionLimitFields.slice(-1)), 'Question limits are invalid.')
      check(question.difficulty === undefined || (Number.isInteger(question.difficulty) && question.difficulty >= 1 && question.difficulty <= 10),
        'Question difficulty must be from 1 to 10.')
      check(validText(prompt) && validText(explanation), 'Prompt and explanation are required.')
      if (caseStudy !== undefined) check(validText(caseStudy?.title) && validText(caseStudy?.background), 'Case study needs a title and background.')

      check(exhibitsValid(exhibits) && exhibitsValid(caseStudy?.exhibits), 'Code exhibits require a title and code.')

      let choices = options
      if (type === 'single' || type === 'multi') {
        check(textList(choices, 2), 'Provide at least two distinct options.')
        if (type === 'single') check(choices.includes(answer), 'Answer must exactly match an option.')
        else check(textList(answer, 2) && answer.length < choices.length && answer.every(item => choices.includes(item)), 'Provide at least two correct options and one distractor.')
      }
      if (type === 'text') check(textList(answer, 1), 'Provide an array of accepted answers.')
      if (type === 'video' && question.videoSeconds !== undefined) {
        check(Number.isInteger(question.videoSeconds) && question.videoSeconds >= 5 && question.videoSeconds <= maxVideoSeconds,
          'Maximum recording duration must be from 5 to ' + maxVideoSeconds + ' seconds.')
      }
      if (type === 'coding') {
        check(Array.isArray(languages) && languages.length > 0 && new Set(languages.map(item => item?.id)).size === languages.length
          && languages.every(item => Object.hasOwn(codingLanguages, item?.id)
            && typeof item.starter === 'string' && item.starter.length <= maxCodeLength
            && validText(item.solution) && item.solution.length <= maxCodeLength), 'Provide distinct supported languages with starter code and a reference solution.')
        for (const language of languages) {
          if (language.files === undefined) continue
          const { filename } = codingLanguages[language.id]
          const extension = filename.slice(filename.lastIndexOf('.'))
          check(projectLanguages.includes(language.id) && Array.isArray(language.files)
            && language.files.length > 0 && language.files.length < maxProjectFiles
            && language.files.every(file => validProjectPath(file?.path, extension) && file.path.toLowerCase() !== filename
              && [file.starter, file.solution].every(source => typeof source === 'string' && source.length <= maxCodeLength))
            && new Set(language.files.map(file => file.path.toLowerCase())).size === language.files.length,
          'Provide up to five distinct project files for Python, JavaScript, or PHP.')
        }
        check(Array.isArray(tests) && tests.length >= 1 && tests.length <= 6 && tests.some(test => test && !test.hidden)
          && textList(tests.map(test => test?.label), 1) && tests.every(test => test.label.length <= 100
            && typeof test.stdin === 'string' && test.stdin.length <= maxRunOutput
            && typeof test.expected === 'string' && test.expected.length <= maxRunOutput
            && (test.hidden === undefined || typeof test.hidden === 'boolean')), 'Provide one to six distinct tests including at least one visible example.')
      }
      if (type === 'match' || type === 'order') {
        check(textList(answer, 2), 'Provide at least two distinct answer values.')
        if (type === 'match') check(textList(labels, 2) && labels.length === answer.length, 'Provide a label for each answer, in matching order.')
        if (choices === undefined) choices = [...answer.slice(1), answer[0]]
        check(textList(choices, answer.length) && choices.length === answer.length && answer.every(item => choices.includes(item)), 'Options must contain the same items as the answer.')
      }
      questionIds.add(id)
      return { id, domain, type, prompt, answer, ...(question.limits && { limits: question.limits }), explanation, options: choices, labels, caseStudy, exhibits,
        ...(question.difficulty !== undefined && { difficulty: question.difficulty }),
        ...(type === 'video' && { videoSeconds: question.videoSeconds ?? defaultVideoSeconds }),
        ...(type === 'coding' && {
          languages: languages.map(({ id, starter, solution, files }) => ({
            id, starter, solution, ...(files && { files: files.map(({ path, starter, solution }) => ({ path, starter, solution })) }),
          })),
          tests: tests.map(({ label, stdin, expected, hidden }) => ({ label, stdin, expected, hidden })),
        }),
      }
    })
    for (let offset = 0; offset < normalized.length; offset += 60) {
      const part = offset / 60 + 1
      const setId = part === 1 ? id : id + '-part-' + part
      if (setIds.has(setId)) fail('Duplicate set id ' + setId + '.')
      setIds.add(setId)
      sets.push({ id: setId, sourceId: id, ...(document.mode === 'exam' && { mode: 'exam', webcamPhotoSeconds }),
        ...(ownerId && { private: true }), ...(document.limits && { limits: document.limits }), ...(providerId && { providerId, examId }),
        difficulty, title: part === 1 ? title : title + ' · Part ' + part, ...(sources.length && { sources }),
        ...(studyFiles.length && { studyFiles }), ...(attachmentNames.length && { attachmentNames }), questions: normalized.slice(offset, offset + 60) })
    }
  }
  return sets
}
