import React, { useEffect } from 'react'
import ReactDOM from 'react-dom/client'
import { HashRouter, Routes, Route, Navigate, NavLink, Link, useLocation, useNavigate } from 'react-router-dom'
import './styles.css'
import { supabase, useAuth, takeOAuthPending, captureOAuthError, isGuest } from './supabase'
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
import CornerLogo, { useLogoUrl } from './components/CornerLogo'
import Settings from './pages/Settings'
import { useTheme } from './themes'

function TeacherShell({ auth, children, admin = false, noGuest = false }) {
  const loc = useLocation()
  const guest = isGuest(auth.session)
  const logoUrl = useLogoUrl(auth.session?.user.id, `${auth.profile?.logo_id}|${auth.profile?.hide_logo}`)
  useTheme(auth.profile?.theme)
  if (auth.loading) return <div className="container muted">Lade …</div>
  if (!auth.session) return <Navigate to="/login" replace state={{ from: loc.pathname }} />
  if (auth.profile?.must_change_password) return <ForcePassword auth={auth} />
  if (admin && !auth.profile?.is_admin) return <Navigate to="/dashboard" replace />
  if (noGuest && guest) return <Navigate to="/dashboard" replace />
  function endGuest() {
    if (confirm('Gastsitzung beenden? Nicht gespeicherte Abstimmungen sind danach nicht mehr erreichbar. Gespeicherte öffnest du mit ihrem 8-stelligen Code wieder.')) supabase.auth.signOut()
  }
  return (
    <>
      <header className="topbar">
        <Link to="/dashboard" className="brand"><Logo /> Klassenpuls</Link>
        {guest ? (
          <nav>
            <NavLink to="/dashboard">Meine Abstimmungen</NavLink>
            <span className="pill" title="Ohne Konto – Abstimmungen werden automatisch gelöscht">Gast</span>
            <Link to="/login" className="small">Lehrer-Login</Link>
            <button className="btn ghost small" onClick={endGuest}>Gastsitzung beenden</button>
          </nav>
        ) : (
        <nav>
          <NavLink to="/dashboard">Meine Umfragen</NavLink>
          {auth.profile?.is_admin && <NavLink to="/admin" end>Verwaltung</NavLink>}
          {auth.profile?.is_admin && <NavLink to="/admin/bilder">Bildbibliothek</NavLink>}
          <NavLink to="/einstellungen" className="user-link" title="Einstellungen: Logo und Passwort">⚙ {auth.profile?.full_name || auth.session.user.email}</NavLink>
          <button className="btn ghost small" onClick={() => supabase.auth.signOut()}>Abmelden</button>
        </nav>
        )}
      </header>
      {auth.recovery && <PasswordBox recovery onDone={() => auth.clearRecovery()} />}
      {children}
      <CornerLogo url={logoUrl} />
    </>
  )
}

function App() {
  const auth = useAuth()
  const nav = useNavigate()
  // Nach der Rückkehr von der Microsoft-Anmeldung direkt zu den Umfragen
  useEffect(() => {
    if (!auth.loading && auth.session && takeOAuthPending()) nav('/dashboard', { replace: true })
  }, [auth.loading, auth.session, nav])
  return (
    <Routes>
      <Route path="/" element={auth.recovery ? <Navigate to="/dashboard" replace /> : <Home auth={auth} />} />
      <Route path="/j/:code" element={<Join />} />
      <Route path="/login" element={<Login auth={auth} />} />
      <Route path="/dashboard" element={<TeacherShell auth={auth}><Dashboard auth={auth} /></TeacherShell>} />
      <Route path="/poll/:id" element={<TeacherShell auth={auth}><Editor auth={auth} /></TeacherShell>} />
      <Route path="/admin" element={<TeacherShell auth={auth} admin><Admin auth={auth} /></TeacherShell>} />
      <Route path="/admin/bilder" element={<TeacherShell auth={auth} admin><Library /></TeacherShell>} />
      <Route path="/einstellungen" element={<TeacherShell auth={auth} noGuest><Settings auth={auth} /></TeacherShell>} />
      <Route path="/present/:sessionId" element={auth.loading ? null : !auth.session ? <Navigate to="/login" replace /> : auth.profile?.must_change_password ? <ForcePassword auth={auth} /> : <Present auth={auth} />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

captureOAuthError()

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <HashRouter><App /></HashRouter>
  </React.StrictMode>,
)
