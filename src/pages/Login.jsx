import { useEffect, useState } from 'react'
import { Navigate, Link } from 'react-router-dom'
import { supabase, errorText, appBaseUrl, authProviders, signInWithMicrosoft, OAUTH_ERROR } from '../supabase'
import Logo from '../components/Logo'
import CornerLogo, { useLogoUrl } from '../components/CornerLogo'

export default function Login({ auth }) {
  const logoUrl = useLogoUrl(null)
  const [mode, setMode] = useState('login')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState(null)
  const [microsoft, setMicrosoft] = useState(false)

  useEffect(() => {
    authProviders().then((p) => setMicrosoft(!!p.azure))
    try {
      const err = sessionStorage.getItem(OAUTH_ERROR)
      if (err) {
        sessionStorage.removeItem(OAUTH_ERROR)
        setMsg({ ok: false, text: `Anmeldung mit Microsoft fehlgeschlagen: ${errorText({ message: err })}` })
      }
    } catch { /* ignorieren */ }
  }, [])

  async function microsoftLogin() {
    setBusy(true); setMsg(null)
    const { error } = await signInWithMicrosoft()
    if (error) { setBusy(false); setMsg({ ok: false, text: errorText(error) }) }
  }

  if (!auth.loading && auth.session) return <Navigate to="/dashboard" replace />

  async function submit(e) {
    e.preventDefault()
    setBusy(true); setMsg(null)
    try {
      if (mode === 'login') {
        const { error } = await supabase.auth.signInWithPassword({ email, password })
        if (error) throw error
      } else if (mode === 'register') {
        const { data: allowed, error: e1 } = await supabase.rpc('is_email_domain_allowed', { p_email: email })
        if (e1) throw e1
        if (!allowed) throw new Error('Diese E-Mail-Domain ist für die Registrierung nicht freigegeben. Bitte nutze deine dienstliche Adresse.')
        const { data, error } = await supabase.auth.signUp({ email, password, options: { emailRedirectTo: appBaseUrl(), data: { full_name: name.trim() } } })
        if (error) throw error
        if (!data.session) setMsg({ ok: true, text: 'Fast geschafft! Wir haben dir eine Bestätigungsmail geschickt. Klicke auf den Link darin und melde dich dann an.' })
      } else {
        const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: appBaseUrl() })
        if (error) throw error
        setMsg({ ok: true, text: 'Falls ein Konto existiert, wurde eine E-Mail zum Zurücksetzen verschickt.' })
      }
    } catch (err) {
      setMsg({ ok: false, text: errorText(err) })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="container narrow">
      <div className="hero" style={{ paddingBottom: 16 }}>
        <Link to="/" className="brand" style={{ justifyContent: 'center' }}><Logo /> Klassenpuls</Link>
        <p className="muted">Bereich für Lehrer</p>
      </div>
      <form className="card stack" onSubmit={submit}>
        {microsoft && mode !== 'reset' && (
          <>
            <button type="button" className="btn ms-btn big" onClick={microsoftLogin} disabled={busy}>
              <svg width="20" height="20" viewBox="0 0 21 21" aria-hidden="true"><rect x="1" y="1" width="9" height="9" fill="#f25022" /><rect x="11" y="1" width="9" height="9" fill="#7fba00" /><rect x="1" y="11" width="9" height="9" fill="#00a4ef" /><rect x="11" y="11" width="9" height="9" fill="#ffb900" /></svg>
              Mit Microsoft anmelden
            </button>
            <div className="or-line"><span>oder mit E-Mail und Passwort</span></div>
          </>
        )}
        <div className="tabs" style={{ margin: '0 auto' }}>
          <button type="button" className={mode === 'login' ? 'on' : ''} onClick={() => { setMode('login'); setMsg(null) }}>Anmelden</button>
          <button type="button" className={mode === 'register' ? 'on' : ''} onClick={() => { setMode('register'); setMsg(null) }}>Registrieren</button>
        </div>
        {mode === 'register' && (
          <label className="field"><span>Vor- und Nachname</span>
            <input type="text" required autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} />
          </label>
        )}
        <label className="field"><span>Dienstliche E-Mail</span>
          <input type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        </label>
        {mode !== 'reset' && (
          <label className="field"><span>Passwort</span>
            <input type="password" required minLength={6} autoComplete={mode === 'login' ? 'current-password' : 'new-password'} value={password} onChange={(e) => setPassword(e.target.value)} />
          </label>
        )}
        {msg && <div className={`alert ${msg.ok ? 'ok' : ''}`}>{msg.text}</div>}
        <button className="btn big" style={{ width: '100%', justifyContent: 'center' }} disabled={busy}>
          {busy ? '…' : mode === 'login' ? 'Anmelden' : mode === 'register' ? 'Konto anlegen' : 'Link senden'}
        </button>
        {mode === 'login' && <button type="button" className="btn ghost small" style={{ margin: '0 auto' }} onClick={() => setMode('reset')}>Passwort vergessen?</button>}
        {mode === 'register' && <p className="muted small center">Registrieren können sich nur Lehrer mit einer freigegebenen Schul-Domain.</p>}
      </form>
      <CornerLogo url={logoUrl} />
    </div>
  )
}
