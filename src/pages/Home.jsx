import { useTheme } from '../themes'
import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import Logo from '../components/Logo'
import CornerLogo, { useLogoUrl } from '../components/CornerLogo'
import NameField from '../components/NameField'
import { getParticipantName, setParticipantName } from '../supabase'

export default function Home({ auth }) {
  useTheme(null)
  const logoUrl = useLogoUrl(null)
  const [code, setCode] = useState('')
  const [name, setName] = useState(getParticipantName)
  const nav = useNavigate()
  const clean = code.replace(/\D/g, '').slice(0, 6)

  return (
    <div className="container narrow">
      <div className="hero">
        <div className="row" style={{ justifyContent: 'center', marginBottom: 18 }}><Logo /><b style={{ fontSize: '1.3rem' }}>Klassenpuls</b></div>
        <h1>Mitmachen!</h1>
        <p className="muted">Gib den 6-stelligen Code von der Tafel ein – oder scanne einfach den QR-Code.</p>
      </div>
      <form className="card stack" onSubmit={(e) => { e.preventDefault(); if (clean.length === 6) { setParticipantName(name); nav(`/j/${clean}`) } }}>
        <input
          type="text" className="code-input" inputMode="numeric" autoComplete="off" placeholder="123 456" autoFocus
          value={clean} onChange={(e) => setCode(e.target.value)} aria-label="Umfrage-Code"
        />
        <NameField value={name} onChange={setName} />
        <button className="btn big mint" style={{ width: '100%', justifyContent: 'center' }} disabled={clean.length !== 6}>Los geht’s</button>
      </form>
      <p className="center muted small" style={{ marginTop: 28 }}>
        Lehrer? {auth.session ? <Link to="/dashboard">Zu meinen Umfragen</Link> : <Link to="/login">Anmelden oder registrieren</Link>}
      </p>
      <CornerLogo url={logoUrl} />
    </div>
  )
}
