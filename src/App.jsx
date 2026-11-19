import React, { useEffect, useRef, useState } from 'react'
import { examExperience, isGeneratedSet, studyGuide } from './questions/index.js'
import GenerateSet from './GenerateSet.jsx'
import { newAttempt } from './attempts.js'
import { useAttemptProgress } from './useAttemptProgress.js'
import { localApi } from './local-api.js'
import OpenAISettings from './OpenAISettings.jsx'
import { readRoute, routePath } from './routes.js'
import ExecutionSettings from './ExecutionSettings.jsx'
import StudyDashboard from './StudyDashboard.jsx'
import AttemptHistory from './AttemptHistory.jsx'
import PracticeSets from './PracticeSets.jsx'
import Exam from './Exam.jsx'
import Results from './Results.jsx'
import QuestionBank from './QuestionBank.jsx'
import UserManagement from './UserManagement.jsx'
import QuestionSetEditor from './QuestionSetEditor.jsx'
import RouteLink from './RouteLink.jsx'
import RealExams from './RealExams.jsx'

const studyNavigation = [
  ['dashboard', '▥', 'Dashboard'],
  ['home', '▦', 'Practice exams'],
  ['bank', '☷', 'Question bank'],
  ['history', '◷', 'Attempt history'],
  ['authoring', '✎', 'Manage question sets'],
  ['exam-bank', '☷', 'Exam question bank', true],
  ['real-exams', '▣', 'Real exams', true],
  ['generate', '✦', 'Generate questions'],
  ['users', '♙', 'Users', true],
  ['settings', '⚙', 'Settings'],
]

export default function App({ user, onLogout, accountBusy, googleEnabled, connectGoogle, accountError, onAccountUpdated }) {
  const [route, setRoute] = useState(() => readRoute(window.location))
  const { screen, setId, historyId, questionId } = route
  const [signInOutcome, setSignInOutcome] = useState(() => new URLSearchParams(window.location.search).get('chatgpt'))
  const {
    progress, ready, busy, timings, saveError, loadError,
    loadProgress, acceptImportedProgress, updateAttempt, finishAttempt, keepExplanation, keepVideoGrade, clearSaveError, flushDraft,
  } = useAttemptProgress()
  const [catalog, setCatalog] = useState(null)
  const [catalogError, setCatalogError] = useState('')
  const [practiceFilters, setPracticeFilters] = useState({ providerId: '', examId: '' })
  const sets = catalog?.sets ?? []
  const { attempts, history, snapshots } = progress
  const mainRef = useRef(null)

  async function loadCatalog() {
    setCatalogError('')
    try {
      setCatalog(await localApi('catalog'))
    } catch (error) {
      setCatalogError(error.message)
    }
  }

  useEffect(() => {
    void loadCatalog()
    void loadProgress()
    const url = new URL(window.location.href)
    if (readRoute(url).screen === 'settings') {
      url.pathname = '/settings'
      url.searchParams.delete('view')
      url.searchParams.delete('chatgpt')
      window.history.replaceState(null, '', url)
    }
    const restoreRoute = () => {
      const next = readRoute(window.location)
      if (next.screen !== 'settings') setSignInOutcome(null)
      clearSaveError()
      setRoute(next)
    }
    window.addEventListener('popstate', restoreRoute)
    return () => window.removeEventListener('popstate', restoreRoute)
  }, [])

  function navigate(destination, { focus = true, replace = false } = {}) {
    const next = typeof destination === 'string' ? { screen: destination } : destination
    const path = routePath(next)
    if (next.screen !== 'settings') setSignInOutcome(null)
    if (path !== window.location.pathname) {
      if (replace) window.history.replaceState(null, '', path)
      else window.history.pushState(null, '', path)
    }
    setRoute(next)
    if (focus) {
      window.scrollTo(0, 0)
      requestAnimationFrame(() => mainRef.current?.focus({ preventScroll: true }))
    }
  }

  const currentSet = sets.find(item => item.id === setId)
  const attempt = attempts[setId] ?? newAttempt()
  const set = (!attempt.submitted && (attempt.practiceSet || timings[attempt.draftId]?.practiceSet)) || currentSet
  const requestedIndex = questionId && set?.questions.findIndex(item => item.id === questionId)
  const position = requestedIndex >= 0 ? requestedIndex : Math.min(attempt.index, (set?.questions.length ?? 1) - 1)
  const activeQuestion = set?.questions[position]
  const section = route.section === 'result' || attempt.submitted ? 'result' : 'questions'
  const result = history.find(entry => entry.id === (screen === 'history-result' ? historyId : attempt.resultId))
  const resultSet = React.useMemo(() => result ? JSON.parse(snapshots[result.snapshotIndex]) : null, [result, snapshots])

  useEffect(() => {
    if (screen !== 'exam' || !ready) return
    if (section === 'questions' && !activeQuestion) return
    const canonical = { screen, setId, section, questionId: section === 'questions' ? activeQuestion.id : undefined }
    const path = routePath(canonical)
    if (path === window.location.pathname) return
    window.history.replaceState(null, '', path)
    setRoute(canonical)
  }, [screen, setId, questionId, section, activeQuestion, ready])

  async function finish(action) {
    const originalPath = window.location.pathname
    const { saved, error } = await finishAttempt(action, setId, position)
    if (saved && window.location.pathname === originalPath) {
      navigate(action === 'submit' ? { screen: 'exam', setId, section: 'result' } : { screen: 'exam', setId })
    }
    return error
  }

  function openQuestion(index) {
    if (index === position || !updateAttempt(setId, previous => previous, index)) return
    navigate({ screen: 'exam', setId, section: 'questions', questionId: set.questions[index].id }, { focus: false })
  }

  const needsCatalog = ['home', 'dashboard', 'bank', 'generate'].includes(screen) || (screen === 'exam' && section === 'questions')
  const needsProgress = ['home', 'dashboard', 'history', 'history-result', 'exam'].includes(screen)
  const openAttempt = id => navigate({ screen: 'history-result', historyId: id })
  const reviewOwnerId = user.role === 'admin' ? user.id : undefined
  const questionType = screen === 'exam' && section === 'questions' ? activeQuestion?.type : undefined
  const activeNav = screen === 'exam' ? 'home' : screen === 'history-result' ? 'history' : screen

  return <div className="app">
    <a className="skip" href="#main">Skip to content</a>
    <aside className="sidebar">
      <RouteLink className="brand" to="dashboard" navigate={navigate}>
        <span className="brand-icon" aria-hidden="true">⌁</span>
        <span>quizeit<small>Certification practice</small></span>
      </RouteLink>
      <nav aria-label="Study navigation">
        {studyNavigation.filter(([, , , adminOnly]) => !adminOnly || user.role === 'admin').map(([page, icon, label]) =>
          <RouteLink key={page} to={page} navigate={navigate} className={activeNav === page ? 'nav-active' : undefined}
            aria-current={page === screen && !route.editorId && route.section !== 'new' ? 'page' : undefined}>
            <span aria-hidden="true">{icon}</span> {label}
          </RouteLink>)}
      </nav>
      <div className="sidebar-links">
        <span className="account-name">{user.firstName} {user.lastName}</span>
        <button className="button small secondary" disabled={busy || accountBusy} onClick={onLogout}>Sign out</button>
        <a href={studyGuide} target="_blank" rel="noreferrer">Microsoft study guide ↗</a>
        <a href={examExperience} target="_blank" rel="noreferrer">Official exam sandbox ↗</a>
      </div>
    </aside>

    <main id="main" tabIndex={-1} ref={mainRef} className={screen === 'generate' ? 'workspace generator-workspace'
      : questionType === 'coding' ? 'workspace coding-workspace'
      : questionType === 'video' ? 'workspace video-workspace' : 'workspace'}>
      {accountError && <p role="alert" className="notice">{accountError}</p>}
      {saveError && <p role="alert" className="notice">{saveError}</p>}
      {screen === 'settings' && <>
        <section className="question-panel settings-panel">
          <h2>Account</h2>
          <p>{user.firstName} {user.lastName} · {user.email}</p>
          {googleEnabled && (user.googleLinked ? <p>Google is connected.</p> : <button className="button secondary" disabled={accountBusy} onClick={connectGoogle}>Connect Google</button>)}
        </section>
        <OpenAISettings outcome={signInOutcome} onImport={user.owner ? acceptImportedProgress : undefined} />
        {user.role === 'admin' && <ExecutionSettings sets={sets.filter(set => !set.private)} />}
      </>}
      {screen === 'users' && (user.role === 'admin' ? <UserManagement user={user} onAccountUpdated={onAccountUpdated} /> : <p className="notice">Only administrators can manage users.</p>)}
      {screen === 'authoring' && <QuestionSetEditor user={user} onSaved={loadCatalog} navigate={navigate}
        editorId={route.editorId} creating={route.section === 'new'} />}
      {screen === 'exam-bank' && (user.role === 'admin'
        ? <QuestionSetEditor key="exam-bank" examBank user={user} onSaved={loadCatalog} navigate={navigate}
          editorId={route.editorId} creating={route.section === 'new'} />
        : <p className="notice">Only administrators can access the exam question bank.</p>)}
      {screen === 'real-exams' && (user.role === 'admin' ? <RealExams navigate={navigate} />
        : <p className="notice">Only administrators can manage real exams.</p>)}
      {!catalog && needsCatalog && (catalogError
        ? <div className="notice" role="alert">{catalogError} <button className="button secondary" onClick={loadCatalog}>Retry loading question sets</button></div>
        : <p role="status">Loading question sets…</p>)}
      {catalog && screen === 'bank' && <QuestionBank catalog={catalog} goSettings={() => navigate('settings')} />}
      {catalog && <div hidden={screen !== 'generate'}><GenerateSet active={screen === 'generate'} admin={user.role === 'admin'} savedSets={catalog.sets.filter(isGeneratedSet)} refreshCatalog={loadCatalog} onGenerated={(set, categories) => setCatalog(current => ({
        categories, sets: [...current.sets.filter(item => item.id !== set.id), set],
      }))} navigate={navigate} goSettings={() => navigate('settings')} /></div>}
      {!ready && needsProgress && (loadError
        ? <div className="notice" role="alert">{loadError} <button className="button secondary" onClick={loadProgress}>Retry loading attempts</button></div>
        : <p role="status">Loading saved attempts…</p>)}
      {ready && catalog && screen === 'home' && <PracticeSets catalog={{
        ...catalog, sets: [...catalog.sets, ...Object.values(attempts).filter(item => !item.submitted
          && item.practiceSet && !catalog.sets.some(set => set.id === item.practiceSet.id)).map(item => item.practiceSet)],
      }} attempts={attempts} history={history} navigate={navigate} filters={practiceFilters} onFilter={setPracticeFilters} />}
      {ready && catalog && screen === 'dashboard' && <StudyDashboard catalog={catalog} history={history} snapshots={snapshots}
        openAttempt={openAttempt} openHistory={() => navigate('history')} openPractice={() => navigate('home')} />}
      {ready && <div hidden={screen !== 'history'}><AttemptHistory history={history}
        openAttempt={openAttempt} reviewer={user.role === 'admin'} refreshOwnHistory={loadProgress} /></div>}
      {screen === 'history-result' && resultSet && <Results key={result.id} set={resultSet} attempt={result}
        reviewOwnerId={reviewOwnerId} onVideoGraded={keepVideoGrade} onExplain={keepExplanation}
        goSettings={() => navigate('settings')} backLabel="Attempt history" backTo="history" navigate={navigate} />}
      {screen === 'exam' && ready && section === 'result' && resultSet && <Results key={result.id} set={resultSet} attempt={result}
        reviewOwnerId={reviewOwnerId} onVideoGraded={keepVideoGrade}
        onExplain={keepExplanation} goSettings={() => navigate('settings')} restart={set ? () => finish('restart') : undefined}
        busy={busy} backLabel="Practice exams" backTo="home" navigate={navigate} />}
      {screen === 'exam' && ready && section === 'questions' && set && <Exam key={set.id} set={set} attempt={attempt} position={position} useVsCode={user.owner}
        timing={timings[attempt.draftId] ?? attempt.activity} flushDraft={flushDraft}
        pinned={Boolean(attempt.practiceSet || timings[attempt.draftId]?.practiceSet)}
        update={update => updateAttempt(setId, update, position)} openQuestion={openQuestion} navigate={navigate} busy={busy} submit={() => finish('submit')} />}
      {((screen === 'exam' && ready && (section === 'result' ? !resultSet : catalog && !set))
        || (screen === 'history-result' && ready && !resultSet) || screen === 'not-found') &&
        <div className="notice" role="alert">
          {screen === 'history-result' || section === 'result' ? 'This result is unavailable.' : 'This practice page is unavailable.'}{' '}
          <RouteLink className="button small secondary" to={screen === 'history-result' ? 'history' : 'home'} navigate={navigate}>
            {screen === 'history-result' ? 'Attempt history' : 'Practice exams'}
          </RouteLink>
        </div>}
    </main>
  </div>
}
