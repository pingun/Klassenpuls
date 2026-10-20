import { useState } from 'react'
import { supabase, errorText } from '../supabase'

export default function PasswordBox({ onDone, recovery }) {
  const [pw, setPw] = useState('')
  const [msg, setMsg] = useState(null)
  async function save(e) {
    e.preventDefault()
    const { error } = await supabase.auth.updateUser({ password: pw })
    if (error) return setMsg({ ok: false, text: errorText(error) })
    setMsg({ ok: true, text: 'Passwort gespeichert.' })
    setTimeout(onDone, 1200)
  }
  return (
    <div className="container" style={{ paddingBottom: 0 }}>
      <form className="card row" onSubmit={save}>
        <b>{recovery ? 'Bitte lege ein neues Passwort fest:' : 'Neues Passwort:'}</b>
        <input className="grow" style={{ width: 'auto' }} type="password" minLength={6} required autoComplete="new-password" value={pw} onChange={(e) => setPw(e.target.value)} />
        <button className="btn mint">Speichern</button>
        <button type="button" className="btn ghost" onClick={onDone}>Abbrechen</button>
        {msg && <div className={`alert ${msg.ok ? 'ok' : ''}`} style={{ width: '100%' }}>{msg.text}</div>}
      </form>
    </div>
  )
}
