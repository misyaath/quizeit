import React from 'react'
import { createRoot } from 'react-dom/client'
import AccountGate from './AccountGate.jsx'
import CandidateExam, { ExamInvitation } from './CandidateExam.jsx'
import { readRoute } from './routes.js'
import './styles.css'

const route = readRoute(window.location)
createRoot(document.getElementById('root')).render(route.screen === 'invite' ? <ExamInvitation token={route.token} />
  : route.screen === 'candidate' ? <CandidateExam setId={route.setId} /> : <AccountGate />)
