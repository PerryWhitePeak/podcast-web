import './styles.css'
import { lazy, Suspense } from 'react'
import { HomePage } from './pages/HomePage'
import { currentRoute } from './lib/paths'

const AgentPage = lazy(() => import('./pages/AgentPage').then((module) => ({ default: module.AgentPage })))
const TranscriptPage = lazy(() => import('./pages/TranscriptPage').then((module) => ({ default: module.TranscriptPage })))

export default function App() {
  const path = currentRoute()
  if (path === '/agent') return <Suspense fallback={<div className="route-loading">正在进入访谈 Agent…</div>}><AgentPage /></Suspense>
  if (path === '/transcript') return <Suspense fallback={<div className="route-loading">正在展开完整访谈…</div>}><TranscriptPage /></Suspense>
  return <HomePage />
}
