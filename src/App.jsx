import { useState } from 'react'
import { Routes, Route, Link } from 'react-router-dom'
import Page0 from './pages/F1'
import Page1 from './pages/F1'
import Page2 from './pages/F1'
import Page3 from './pages/F1'
import Page4 from './pages/F2'
import Page5 from './pages/F2'
import Page6 from './pages/F3'
import Page7 from './pages/F3'
import Page8 from './pages/F3'
import Page9 from './pages/F3'
import Page10 from './pages/F3'
import Page11 from './pages/F3'
import Page12 from './pages/F4'
import Page13 from './pages/F5'
import Page14 from './pages/F7'
import Page15 from './pages/F9'

export default function App() {
  const [navOpen, setNavOpen] = useState(false)

  return (
    <div className="min-h-screen bg-zinc-950">
      {/* Navigation */}
      <nav className="sticky top-0 z-50 backdrop-blur-xl bg-zinc-900/80 border-b border-white/5">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
          <span className="text-sm font-bold text-white">Motor Claims — FNOL & Triage Copilot (LLM...</span>
          <button
            onClick={() => setNavOpen(!navOpen)}
            className="md:hidden p-2 text-zinc-400 hover:text-white"
          >
            {navOpen ? '✕' : '☰'}
          </button>
          <div className="hidden md:flex items-center gap-1">
          <Link to="/" className="px-3 py-1.5 text-xs font-medium rounded-lg hover:bg-white/10 transition-colors text-zinc-300 hover:text-white">Multi-Channel FNOL Intake…</Link>
          <Link to="/f1" className="px-3 py-1.5 text-xs font-medium rounded-lg hover:bg-white/10 transition-colors text-zinc-300 hover:text-white">Multi-Channel FNOL Intake…</Link>
          <Link to="/f1" className="px-3 py-1.5 text-xs font-medium rounded-lg hover:bg-white/10 transition-colors text-zinc-300 hover:text-white">Multi-Channel FNOL Intake…</Link>
          <Link to="/f1" className="px-3 py-1.5 text-xs font-medium rounded-lg hover:bg-white/10 transition-colors text-zinc-300 hover:text-white">Multi-Channel FNOL Intake…</Link>
          <Link to="/f2" className="px-3 py-1.5 text-xs font-medium rounded-lg hover:bg-white/10 transition-colors text-zinc-300 hover:text-white">LLM-Powered Bilingual Dat…</Link>
          <Link to="/f2" className="px-3 py-1.5 text-xs font-medium rounded-lg hover:bg-white/10 transition-colors text-zinc-300 hover:text-white">Bilingual Thai-English LL…</Link>
          <Link to="/f3" className="px-3 py-1.5 text-xs font-medium rounded-lg hover:bg-white/10 transition-colors text-zinc-300 hover:text-white">Missing Information Detec…</Link>
          <Link to="/f3" className="px-3 py-1.5 text-xs font-medium rounded-lg hover:bg-white/10 transition-colors text-zinc-300 hover:text-white">Missing Information Detec…</Link>
          <Link to="/f3" className="px-3 py-1.5 text-xs font-medium rounded-lg hover:bg-white/10 transition-colors text-zinc-300 hover:text-white">Missing Information Detec…</Link>
          <Link to="/f3" className="px-3 py-1.5 text-xs font-medium rounded-lg hover:bg-white/10 transition-colors text-zinc-300 hover:text-white">Missing Information Detec…</Link>
          <Link to="/f3" className="px-3 py-1.5 text-xs font-medium rounded-lg hover:bg-white/10 transition-colors text-zinc-300 hover:text-white">Missing Information Detec…</Link>
          <Link to="/f3" className="px-3 py-1.5 text-xs font-medium rounded-lg hover:bg-white/10 transition-colors text-zinc-300 hover:text-white">Missing Information Detec…</Link>
          <Link to="/f4" className="px-3 py-1.5 text-xs font-medium rounded-lg hover:bg-white/10 transition-colors text-zinc-300 hover:text-white">Thai-Friendly Clarifying …</Link>
          <Link to="/f5" className="px-3 py-1.5 text-xs font-medium rounded-lg hover:bg-white/10 transition-colors text-zinc-300 hover:text-white">Policy Validation and Cov…</Link>
          <Link to="/f7" className="px-3 py-1.5 text-xs font-medium rounded-lg hover:bg-white/10 transition-colors text-zinc-300 hover:text-white">Comprehensive LLM Decisio…</Link>
          <Link to="/f9" className="px-3 py-1.5 text-xs font-medium rounded-lg hover:bg-white/10 transition-colors text-zinc-300 hover:text-white">LLM Service Fallback and …</Link>
          </div>
        </div>
        {navOpen && (
          <div className="md:hidden px-4 pb-3 flex flex-col gap-1">
          <Link to="/" className="px-3 py-1.5 text-xs font-medium rounded-lg hover:bg-white/10 transition-colors text-zinc-300 hover:text-white">Multi-Channel FNOL Intake…</Link>
          <Link to="/f1" className="px-3 py-1.5 text-xs font-medium rounded-lg hover:bg-white/10 transition-colors text-zinc-300 hover:text-white">Multi-Channel FNOL Intake…</Link>
          <Link to="/f1" className="px-3 py-1.5 text-xs font-medium rounded-lg hover:bg-white/10 transition-colors text-zinc-300 hover:text-white">Multi-Channel FNOL Intake…</Link>
          <Link to="/f1" className="px-3 py-1.5 text-xs font-medium rounded-lg hover:bg-white/10 transition-colors text-zinc-300 hover:text-white">Multi-Channel FNOL Intake…</Link>
          <Link to="/f2" className="px-3 py-1.5 text-xs font-medium rounded-lg hover:bg-white/10 transition-colors text-zinc-300 hover:text-white">LLM-Powered Bilingual Dat…</Link>
          <Link to="/f2" className="px-3 py-1.5 text-xs font-medium rounded-lg hover:bg-white/10 transition-colors text-zinc-300 hover:text-white">Bilingual Thai-English LL…</Link>
          <Link to="/f3" className="px-3 py-1.5 text-xs font-medium rounded-lg hover:bg-white/10 transition-colors text-zinc-300 hover:text-white">Missing Information Detec…</Link>
          <Link to="/f3" className="px-3 py-1.5 text-xs font-medium rounded-lg hover:bg-white/10 transition-colors text-zinc-300 hover:text-white">Missing Information Detec…</Link>
          <Link to="/f3" className="px-3 py-1.5 text-xs font-medium rounded-lg hover:bg-white/10 transition-colors text-zinc-300 hover:text-white">Missing Information Detec…</Link>
          <Link to="/f3" className="px-3 py-1.5 text-xs font-medium rounded-lg hover:bg-white/10 transition-colors text-zinc-300 hover:text-white">Missing Information Detec…</Link>
          <Link to="/f3" className="px-3 py-1.5 text-xs font-medium rounded-lg hover:bg-white/10 transition-colors text-zinc-300 hover:text-white">Missing Information Detec…</Link>
          <Link to="/f3" className="px-3 py-1.5 text-xs font-medium rounded-lg hover:bg-white/10 transition-colors text-zinc-300 hover:text-white">Missing Information Detec…</Link>
          <Link to="/f4" className="px-3 py-1.5 text-xs font-medium rounded-lg hover:bg-white/10 transition-colors text-zinc-300 hover:text-white">Thai-Friendly Clarifying …</Link>
          <Link to="/f5" className="px-3 py-1.5 text-xs font-medium rounded-lg hover:bg-white/10 transition-colors text-zinc-300 hover:text-white">Policy Validation and Cov…</Link>
          <Link to="/f7" className="px-3 py-1.5 text-xs font-medium rounded-lg hover:bg-white/10 transition-colors text-zinc-300 hover:text-white">Comprehensive LLM Decisio…</Link>
          <Link to="/f9" className="px-3 py-1.5 text-xs font-medium rounded-lg hover:bg-white/10 transition-colors text-zinc-300 hover:text-white">LLM Service Fallback and …</Link>
          </div>
        )}
      </nav>

      {/* Pages */}
      <main>
        <Routes>
        <Route path="/" element={<Page0 />} />
        <Route path="/f1" element={<Page1 />} />
        <Route path="/f1" element={<Page2 />} />
        <Route path="/f1" element={<Page3 />} />
        <Route path="/f2" element={<Page4 />} />
        <Route path="/f2" element={<Page5 />} />
        <Route path="/f3" element={<Page6 />} />
        <Route path="/f3" element={<Page7 />} />
        <Route path="/f3" element={<Page8 />} />
        <Route path="/f3" element={<Page9 />} />
        <Route path="/f3" element={<Page10 />} />
        <Route path="/f3" element={<Page11 />} />
        <Route path="/f4" element={<Page12 />} />
        <Route path="/f5" element={<Page13 />} />
        <Route path="/f7" element={<Page14 />} />
        <Route path="/f9" element={<Page15 />} />
        </Routes>
      </main>
    </div>
  )
}
