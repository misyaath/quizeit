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

export default function App() {
  const [route, setRoute] = useState(() => readRoute(window.location))
  const { screen, setId, historyId, questionId } = route
  const [signInOutcome, setSignInOutcome] = useState(() => new URLSearchParams(window.location.search).get('chatgpt'))
  const {
    progress, ready, busy, timings, saveError, loadError,
    loadProgress, acceptImportedProgress, updateAttempt, finishAttempt, keepExplanation, clearSaveError,
  } = useAttemptProgress()
  const [catalog, setCatalog] = useState(null)
  const [catalogError, setCatalogError] = useState('')
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

  function navigate(destination, { focus = true } = {}) {
    const next = typeof destination === 'string' ? { screen: destination } : destination
    const path = routePath(next)
    if (next.screen !== 'settings') setSignInOutcome(null)
    if (path !== window.location.pathname) window.history.pushState(null, '', path)
    setRoute(next)
    if (focus) {
      window.scrollTo(0, 0)
      requestAnimationFrame(() => mainRef.current?.focus({ preventScroll: true }))
    }
  }

  const set = sets.find(item => item.id === setId)
  const attempt = attempts[setId] ?? newAttempt()
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

  function openSet(id) {
    navigate({ screen: 'exam', setId: id })
  }

  function openQuestion(index) {
    if (index === position || !updateAttempt(setId, previous => previous, index)) return
    navigate({ screen: 'exam', setId, section: 'questions', questionId: set.questions[index].id }, { focus: false })
  }

  const needsCatalog = ['home', 'dashboard', 'bank', 'generate'].includes(screen) || (screen === 'exam' && section === 'questions')
  const needsProgress = ['home', 'dashboard', 'history', 'history-result', 'exam'].includes(screen)
  const openAttempt = id => navigate({ screen: 'history-result', historyId: id })

  return <div className="app">
    <a className="skip" href="#main">Skip to content</a>
    <aside className="sidebar">
      <button className="brand" disabled={busy} onClick={() => navigate('dashboard')}>
        <span className="brand-icon" aria-hidden="true">⌁</span>
        <span>quizeit<small>Certification practice</small></span>
      </button>
      <nav aria-label="Study navigation">
        <button disabled={busy} className={screen === 'dashboard' ? 'nav-active' : ''} aria-current={screen === 'dashboard' ? 'page' : undefined} onClick={() => navigate('dashboard')}><span aria-hidden="true">▥</span> Dashboard</button>
        <button disabled={busy} className={screen === 'home' || screen === 'exam' ? 'nav-active' : ''} aria-current={screen === 'home' ? 'page' : undefined} onClick={() => navigate('home')}><span aria-hidden="true">▦</span> Practice exams</button>
        <button disabled={busy} className={screen === 'bank' ? 'nav-active' : ''} aria-current={screen === 'bank' ? 'page' : undefined} onClick={() => navigate('bank')}><span aria-hidden="true">☷</span> Question bank</button>
        <button disabled={busy} className={screen.startsWith('history') ? 'nav-active' : ''} aria-current={screen === 'history' ? 'page' : undefined} onClick={() => navigate('history')}><span aria-hidden="true">◷</span> Attempt history</button>
        <button disabled={busy} className={screen === 'generate' ? 'nav-active' : ''} aria-current={screen === 'generate' ? 'page' : undefined} onClick={() => navigate('generate')}><span aria-hidden="true">✦</span> Generate questions</button>
        <button disabled={busy} className={screen === 'settings' ? 'nav-active' : ''} aria-current={screen === 'settings' ? 'page' : undefined} onClick={() => navigate('settings')}><span aria-hidden="true">⚙</span> Settings</button>
      </nav>
      <div className="sidebar-links">
        <a href={studyGuide} target="_blank" rel="noreferrer">Microsoft study guide ↗</a>
        <a href={examExperience} target="_blank" rel="noreferrer">Official exam sandbox ↗</a>
      </div>
    </aside>

    <main id="main" tabIndex={-1} ref={mainRef} className={screen === 'generate' ? 'workspace generator-workspace'
      : screen === 'exam' && section !== 'result' && activeQuestion?.type === 'coding'
        ? 'workspace coding-workspace' : 'workspace'}>
      {saveError && <p role="alert" className="notice">{saveError}</p>}
      {screen === 'settings' && <>
        <OpenAISettings outcome={signInOutcome} onImport={acceptImportedProgress} />
        <ExecutionSettings sets={sets} />
      </>}
      {!catalog && needsCatalog && (catalogError
        ? <div className="notice" role="alert">{catalogError} <button className="button secondary" onClick={loadCatalog}>Retry loading question sets</button></div>
        : <p role="status">Loading question sets…</p>)}
      {catalog && screen === 'bank' && <QuestionBank catalog={catalog} goSettings={() => navigate('settings')} />}
      {catalog && <div hidden={screen !== 'generate'}><GenerateSet active={screen === 'generate'} savedSets={catalog.sets.filter(isGeneratedSet)} refreshCatalog={loadCatalog} onGenerated={(set, categories) => setCatalog(current => ({
        categories, sets: [...current.sets.filter(item => item.id !== set.id), set],
      }))} openSet={openSet} goSettings={() => navigate('settings')} /></div>}
      {!ready && needsProgress && (loadError
        ? <div className="notice" role="alert">{loadError} <button className="button secondary" onClick={loadProgress}>Retry loading attempts</button></div>
        : <p role="status">Loading saved attempts…</p>)}
      {ready && catalog && screen === 'home' && <PracticeSets catalog={catalog} goGenerate={() => navigate('generate')} attempts={attempts} history={history} openSet={openSet} />}
      {ready && catalog && screen === 'dashboard' && <StudyDashboard catalog={catalog} history={history} snapshots={snapshots}
        openAttempt={openAttempt} openHistory={() => navigate('history')} openPractice={() => navigate('home')} />}
      {ready && <div hidden={screen !== 'history'}><AttemptHistory history={history}
        openAttempt={openAttempt} /></div>}
      {screen === 'history-result' && resultSet && <Results key={result.id} set={resultSet} attempt={result} onExplain={keepExplanation} goSettings={() => navigate('settings')} backLabel="Attempt history" goBack={() => navigate('history')} />}
      {screen === 'exam' && ready && section === 'result' && resultSet && <Results key={result.id} set={resultSet} attempt={result}
        onExplain={keepExplanation} goSettings={() => navigate('settings')} restart={set ? () => finish('restart') : undefined}
        busy={busy} backLabel="Practice exams" goBack={() => navigate('home')} />}
      {screen === 'exam' && ready && section === 'questions' && set && <Exam key={set.id} set={set} attempt={attempt} position={position}
        timing={attempt.activity ?? timings[attempt.draftId]}
        update={update => updateAttempt(setId, update, position)} openQuestion={openQuestion} goHome={() => navigate('home')} busy={busy} submit={() => finish('submit')} />}
      {((screen === 'exam' && ready && (section === 'result' ? !resultSet : catalog && !set))
        || (screen === 'history-result' && ready && !resultSet) || screen === 'not-found') &&
        <div className="notice" role="alert">
          {screen === 'history-result' || section === 'result' ? 'This result is unavailable.' : 'This practice page is unavailable.'}{' '}
          <button className="button small secondary" onClick={() => navigate(screen === 'history-result' ? 'history' : 'home')}>
            {screen === 'history-result' ? 'Attempt history' : 'Practice exams'}
          </button>
        </div>}
    </main>
  </div>
}
