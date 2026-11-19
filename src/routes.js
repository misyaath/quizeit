const pages = {
  dashboard: '/',
  home: '/practice',
  bank: '/question-bank',
  generate: '/generate',
  settings: '/settings',
  history: '/attempts',
  authoring: '/question-sets',
  login: '/login',
  signup: '/signup',
}

const setSegment = '[a-z0-9]+(?:-[a-z0-9]+)*'
const examPath = new RegExp('^/practice/(' + setSegment + ')(?:/(results)|/question/(' + setSegment + '))?$')
const attemptPath = /^\/attempts\/([a-z0-9-]+)$/

export function readRoute(location) {
  const path = location.pathname.replace(/\/$/, '') || '/'
  if ((path === '/' || path === '/index.html') && new URLSearchParams(location.search).get('view') === 'settings') {
    return { screen: 'settings' }
  }
  if (path === '/index.html' || path === '/dashboard') return { screen: 'dashboard' }
  for (const [screen, pathname] of Object.entries(pages)) {
    if (path === pathname) return { screen }
  }
  const exam = examPath.exec(path)
  if (exam) return { screen: 'exam', setId: exam[1], section: exam[2] ? 'result' : 'questions', questionId: exam[3] }
  const attempt = attemptPath.exec(path)
  if (attempt) return { screen: 'history-result', historyId: attempt[1] }
  return { screen: 'not-found' }
}

export function routePath({ screen, setId, section, questionId, historyId }) {
  if (screen === 'history-result') return '/attempts/' + historyId
  if (screen === 'exam') {
    const base = '/practice/' + setId
    if (section === 'result') return base + '/results'
    if (questionId) return base + '/question/' + questionId
    return base
  }
  return pages[screen]
}
