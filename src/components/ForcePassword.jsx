import { useState } from 'react'
import { supabase, errorText } from '../supabase'
import Logo from './Logo'

// Wird statt der App angezeigt, solange ein Lehrer sein vorläufiges Passwort noch nicht geändert hat
export default function ForcePassword({ auth }) {
  const [pw, setPw] = useState('')
  const [pw2, setPw2] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  async function save(e) {
    e.preventDefault(); setErr('')
    if (pw.length < 8) return setErr('Bitte mindestens 8 Zeichen verwenden.')
    if (pw !== pw2) return setErr('Die beiden Passwörter stimmen nicht überein.')
    setBusy(true)
    const { error } = await supabase.auth.updateUser({ password: pw })
    if (error) { setBusy(false); return setErr(/different from the old/i.test(error.message) ? 'Bitte ein anderes als das vorläufige Passwort wählen.' : errorText(error)) }
    const { error: e2 } = await supabase.rpc('password_changed')
    setBusy(false)
    if (e2) return setErr(errorText(e2))
    await auth.refreshProfile()
  }

  const name = auth.profile?.full_name
  return (
    <div className="container narrow">
      <div className="hero" style={{ paddingBottom: 16 }}>
        <div className="brand" style={{ justifyContent: 'center' }}><Logo /> Klassenpuls</div>
      </div>
      <form className="card stack" onSubmit={save}>
        <h2>Willkommen{name ? `, ${name}` : ''}!</h2>
        <p className="muted" style={{ margin: 0 }}>Du hast dich mit einem vorläufigen Passwort angemeldet. Bitte lege jetzt dein eigenes Passwort fest.</p>
        <label className="field"><span>Neues Passwort</span>
          <input type="password" autoComplete="new-password" required value={pw} onChange={(e) => setPw(e.target.value)} autoFocus />
        </label>
        <label className="field"><span>Neues Passwort wiederholen</span>
          <input type="password" autoComplete="new-password" required value={pw2} onChange={(e) => setPw2(e.target.value)} />
        </label>
        {err && <div className="alert">{err}</div>}
        <button className="btn big" style={{ width: '100%', justifyContent: 'center' }} disabled={busy}>{busy ? '…' : 'Passwort speichern'}</button>
        <button type="button" className="btn ghost small" style={{ margin: '0 auto' }} onClick={() => supabase.auth.signOut()}>Abmelden</button>
      </form>
    </div>
  )
}
