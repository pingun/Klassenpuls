import { useTheme } from '../themes'
import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import Logo from '../components/Logo'
import CornerLogo, { useLogoUrl } from '../components/CornerLogo'
import { supabase, errorText, ensureSession, isGuest, useGuestMode } from '../supabase'
import { createPoll } from './Dashboard'

// Minimalistische Startseite: ein Klick erstellt eine Abstimmung (ohne Konto, wenn der Gastmodus an ist).
// Ein Feld für beide Codes: 6 Ziffern = mitmachen, 8 Ziffern = gespeicherte Abstimmung öffnen.
export default function Home({ auth }) {
  useTheme(null)
  const logoUrl = useLogoUrl(null)
  const guestMode = useGuestMode()
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const nav = useNavigate()
  // Erst weiterleiten, wenn die App die (neue Gast-)Anmeldung kennt – sonst landet man beim Login
  const [pending, setPending] = useState(null)
  useEffect(() => {
    if (pending && auth.session) { nav(pending.path, { state: pending.state }); setPending(null) }
  }, [pending, auth.session, nav])
  const digits = code.replace(/\D/g, '').slice(0, guestMode ? 8 : 6)
  const loggedIn = !!auth.session
  const teacher = loggedIn && !isGuest(auth.session)
  const canCreate = guestMode || teacher

  async function run(fn) {
    setBusy(true); setErr('')
    try { await fn() } catch (e) { setErr(errorText(e)) } finally { setBusy(false) }
  }

  const create = () => run(async () => {
    const session = await ensureSession()
    const poll = await createPoll(null, session.user.id)
    setPending({ path: `/poll/${poll.id}`, state: { pick: true } })
  })

  const openSaved = () => run(async () => {
    await ensureSession()
    const { data, error } = await supabase.rpc('open_guest_poll', { p_code: digits })
    if (error) throw error
    setPending({ path: `/poll/${data}` })
  })

  function submit(e) {
    e.preventDefault()
    if (digits.length === 6) nav(`/j/${digits}`)
    else if (digits.length === 8) openSaved()
  }

  const pretty = digits.length > 6 ? digits.replace(/(\d{4})(\d{1,4})/, '$1 $2') : digits.replace(/(\d{3})(\d{1,3})/, '$1 $2')

  return (
    <div className="landing">
      <div className="landing-brand"><Logo /> Klassenpuls</div>
      {canCreate && (
        <button className="btn big landing-cta" onClick={create} disabled={busy}>
          {busy ? 'Einen Moment …' : 'Abstimmung erstellen'}
        </button>
      )}
      <form className="landing-code" onSubmit={submit}>
        <input
          type="text" className="code-input" inputMode="numeric" autoComplete="off" placeholder={guestMode ? 'Code eingeben' : '123 456'} autoFocus={!canCreate}
          value={pretty} onChange={(e) => setCode(e.target.value)} aria-label="Code zum Mitmachen oder Öffnen"
        />
        <button className="btn mint" disabled={busy || (digits.length !== 6 && digits.length !== 8)}>
          {digits.length === 8 ? 'Öffnen' : 'Mitmachen'}
        </button>
      </form>
      <p className="muted small center" style={{ margin: 0 }}>
        {guestMode ? '6-stelliger Code: mitmachen · 8-stelliger Code: gespeicherte Abstimmung öffnen' : 'Gib den 6-stelligen Code von der Tafel ein – oder scanne den QR-Code.'}
      </p>
      {err && <div className="alert" style={{ maxWidth: 480 }}>{err}</div>}
      <p className="landing-foot muted small">
        {loggedIn
          ? <Link to="/dashboard">{teacher ? 'Zu meinen Umfragen' : 'Zu meinen Abstimmungen'}</Link>
          : <>Lehrer? <Link to="/login">Anmelden</Link></>}
      </p>
      <CornerLogo url={logoUrl} />
    </div>
  )
}
