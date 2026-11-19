const pages = {
  dashboard: '/',
  home: '/practice',
  bank: '/question-bank',
  generate: '/generate',
  settings: '/settings',
  history: '/attempts',
  authoring: '/question-sets',
  'exam-bank': '/exam-bank',
  'real-exams': '/real-exams',
  users: '/users',
  login: '/login',
  signup: '/signup',
}

const setSegment = '[a-z0-9]+(?:-[a-z0-9]+)*'
const examPath = new RegExp('^/practice/(' + setSegment + ')(?:/(results)|/question/(' + setSegment + '))?$')
const editorPath = new RegExp('^/(question-sets|exam-bank)/(' + setSegment + ')/edit$')
const invitePath = /^\/exam-invite\/([A-Za-z0-9_-]{43})$/
const candidatePath = /^\/candidate\/(exam-[a-f0-9-]{36})$/
const attemptPath = /^\/attempts\/([a-z0-9-]+)$/

export function readRoute(location) {
  const path = location.pathname.replace(/\/$/, '') || '/'
  if ((path === '/' || path === '/index.html') && new URLSearchParams(location.search).get('view') === 'settings') {
    return { screen: 'settings' }
  }
  if (path === '/index.html' || path === '/dashboard') return { screen: 'dashboard' }
  if (path === '/question-sets/new') return { screen: 'authoring', section: 'new' }
  if (path === '/exam-bank/new') return { screen: 'exam-bank', section: 'new' }
  const editor = editorPath.exec(path)
  if (editor) return { screen: editor[1] === 'exam-bank' ? 'exam-bank' : 'authoring', editorId: editor[2] }
  const invite = invitePath.exec(path)
  if (invite) return { screen: 'invite', token: invite[1] }
  const candidate = candidatePath.exec(path)
  if (candidate) return { screen: 'candidate', setId: candidate[1] }
  for (const [screen, pathname] of Object.entries(pages)) {
    if (path === pathname) return { screen }
  }
  const exam = examPath.exec(path)
  if (exam) return { screen: 'exam', setId: exam[1], section: exam[2] ? 'result' : 'questions', questionId: exam[3] }
  const attempt = attemptPath.exec(path)
  if (attempt) return { screen: 'history-result', historyId: attempt[1] }
  return { screen: 'not-found' }
}

export function routePath({ screen, setId, section, questionId, historyId, editorId }) {
  if (screen === 'history-result') return '/attempts/' + historyId
  if (screen === 'authoring' || screen === 'exam-bank') {
    if (editorId) return pages[screen] + '/' + editorId + '/edit'
    if (section === 'new') return pages[screen] + '/new'
  }
  if (screen === 'exam') {
    const base = '/practice/' + setId
    if (section === 'result') return base + '/results'
    if (questionId) return base + '/question/' + questionId
    return base
  }
  return pages[screen]
}
