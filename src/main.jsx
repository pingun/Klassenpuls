import React, { useState } from 'react'
import ReactDOM from 'react-dom/client'
import { HashRouter, Routes, Route, Navigate, NavLink, Link, useLocation } from 'react-router-dom'
import './styles.css'
import { supabase, useAuth } from './supabase'
import Home from './pages/Home'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import Editor from './pages/Editor'
import Present from './pages/Present'
import Join from './pages/Join'
import Admin from './pages/Admin'
import Library from './pages/Library'
import Logo from './components/Logo'
import PasswordBox from './components/PasswordBox'
import ForcePassword from './components/ForcePassword'

function TeacherShell({ auth, children, admin = false }) {
  const loc = useLocation()
  const [pwOpen, setPwOpen] = useState(false)
  if (auth.loading) return <div className="container muted">Lade …</div>
  if (!auth.session) return <Navigate to="/login" replace state={{ from: loc.pathname }} />
  if (auth.profile?.must_change_password) return <ForcePassword auth={auth} />
  if (admin && !auth.profile?.is_admin) return <Navigate to="/dashboard" replace />
  return (
    <>
      <header className="topbar">
        <Link to="/dashboard" className="brand"><Logo /> Klassenpuls</Link>
        <nav>
          <NavLink to="/dashboard">Meine Umfragen</NavLink>
          {auth.profile?.is_admin && <NavLink to="/admin" end>Verwaltung</NavLink>}
          {auth.profile?.is_admin && <NavLink to="/admin/bilder">Bildbibliothek</NavLink>}
          <button className="btn ghost small" title="Passwort ändern" onClick={() => setPwOpen(true)}>{auth.profile?.full_name || auth.session.user.email}</button>
          <button className="btn ghost small" onClick={() => supabase.auth.signOut()}>Abmelden</button>
        </nav>
      </header>
      {(pwOpen || auth.recovery) && <PasswordBox recovery={auth.recovery} onDone={() => { setPwOpen(false); auth.clearRecovery() }} />}
      {children}
    </>
  )
}

function App() {
  const auth = useAuth()
  return (
    <Routes>
      <Route path="/" element={auth.recovery ? <Navigate to="/dashboard" replace /> : <Home auth={auth} />} />
      <Route path="/j/:code" element={<Join />} />
      <Route path="/login" element={<Login auth={auth} />} />
      <Route path="/dashboard" element={<TeacherShell auth={auth}><Dashboard auth={auth} /></TeacherShell>} />
      <Route path="/poll/:id" element={<TeacherShell auth={auth}><Editor auth={auth} /></TeacherShell>} />
      <Route path="/admin" element={<TeacherShell auth={auth} admin><Admin auth={auth} /></TeacherShell>} />
      <Route path="/admin/bilder" element={<TeacherShell auth={auth} admin><Library /></TeacherShell>} />
      <Route path="/present/:sessionId" element={auth.loading ? null : !auth.session ? <Navigate to="/login" replace /> : auth.profile?.must_change_password ? <ForcePassword auth={auth} /> : <Present />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <HashRouter><App /></HashRouter>
  </React.StrictMode>,
)
