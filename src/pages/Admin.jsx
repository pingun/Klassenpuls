import { useCallback, useEffect, useState } from 'react'
import { supabase, errorText, invokeFunction, appBaseUrl } from '../supabase'

export default function Admin({ auth }) {
  const [domains, setDomains] = useState([])
  const [teachers, setTeachers] = useState([])
  const [input, setInput] = useState('')
  const [err, setErr] = useState('')
  const [form, setForm] = useState({ full_name: '', email: '', is_admin: false })
  const [busy, setBusy] = useState(false)
  const [credentials, setCredentials] = useState(null)

  const load = useCallback(async () => {
    const [d, t] = await Promise.all([
      supabase.from('allowed_domains').select('*').order('domain'),
      supabase.from('profiles').select('*').order('full_name', { nullsFirst: false }).order('email'),
    ])
    setDomains(d.data || []); setTeachers(t.data || [])
  }, [])
  useEffect(() => { load() }, [load])

  async function addDomain(e) {
    e.preventDefault(); setErr('')
    const domain = input.trim().toLowerCase().replace(/^@/, '')
    if (!/^[a-z0-9.-]+\.[a-z]{2,}$/.test(domain)) return setErr('Bitte eine gültige Domain wie „meine-schule.de“ eingeben.')
    const { error } = await supabase.from('allowed_domains').insert({ domain })
    if (error) return setErr(error.code === '23505' ? 'Diese Domain ist bereits freigegeben.' : errorText(error))
    setInput(''); load()
  }

  async function removeDomain(domain) {
    if (!confirm(`Domain „${domain}“ entfernen? Bestehende Konten bleiben erhalten, neue Registrierungen sind nicht mehr möglich.`)) return
    const { error } = await supabase.from('allowed_domains').delete().eq('domain', domain)
    if (error) setErr(errorText(error)); else load()
  }

  async function createTeacher(e) {
    e.preventDefault(); setErr(''); setBusy(true)
    try {
      const res = await invokeFunction('manage-teachers', { action: 'create', ...form })
      setCredentials({ ...res, isNew: true })
      setForm({ full_name: '', email: '', is_admin: false })
      load()
    } catch (e2) { setErr(e2.message) } finally { setBusy(false) }
  }

  async function resetPassword(t) {
    if (!confirm(`Neues vorläufiges Passwort für ${t.full_name || t.email} erzeugen? Das bisherige Passwort funktioniert dann nicht mehr.`)) return
    setErr('')
    try {
      const res = await invokeFunction('manage-teachers', { action: 'reset', user_id: t.id })
      setCredentials({ ...res, isNew: false })
      load()
    } catch (e2) { setErr(e2.message) }
  }

  async function deleteTeacher(t) {
    if (!confirm(`Konto von ${t.full_name || t.email} endgültig löschen? Alle Umfragen und Ergebnisse dieses Lehrers werden mitgelöscht.`)) return
    setErr('')
    try { await invokeFunction('manage-teachers', { action: 'delete', user_id: t.id }); load() } catch (e2) { setErr(e2.message) }
  }

  async function toggleAdmin(t) {
    const { error } = await supabase.from('profiles').update({ is_admin: !t.is_admin }).eq('id', t.id)
    if (error) setErr(errorText(error)); else load()
  }

  return (
    <div className="container stack" style={{ maxWidth: 900 }}>
      <h1>Verwaltung</h1>
      {err && <div className="alert">{err}</div>}

      <div className="card stack">
        <h3>Lehrer anlegen</h3>
        <form className="row" onSubmit={createTeacher} style={{ alignItems: 'flex-end' }}>
          <label className="field grow" style={{ minWidth: 200 }}><span>Vor- und Nachname</span>
            <input type="text" required value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} />
          </label>
          <label className="field grow" style={{ minWidth: 220 }}><span>E-Mail-Adresse</span>
            <input type="email" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          </label>
          <label className="row small" style={{ fontWeight: 600, paddingBottom: 12 }}>
            <input type="checkbox" checked={form.is_admin} onChange={(e) => setForm({ ...form, is_admin: e.target.checked })} /> Admin
          </label>
          <button className="btn mint" disabled={busy} style={{ marginBottom: 2 }}>{busy ? 'Lege an …' : 'Anlegen'}</button>
        </form>
        <p className="muted small" style={{ margin: 0 }}>Es wird ein vorläufiges Passwort erzeugt. Bei der ersten Anmeldung muss der Lehrer ein eigenes Passwort festlegen. Hier angelegte Konten sind unabhängig von den freigegebenen Domains.</p>
      </div>

      {credentials && <CredentialsCard c={credentials} onClose={() => setCredentials(null)} />}

      <div className="card">
        <h3>Lehrer ({teachers.length})</h3>
        <div style={{ overflowX: 'auto' }}>
          <table className="simple">
            <thead><tr><th>Name</th><th>E-Mail</th><th>Status</th><th></th></tr></thead>
            <tbody>
              {teachers.map((t) => {
                const self = t.id === auth.session.user.id
                return (
                  <tr key={t.id}>
                    <td><NameCell t={t} onSaved={load} onError={setErr} /></td>
                    <td>{t.email}</td>
                    <td className="row" style={{ gap: 6 }}>
                      {t.is_admin && <span className="pill">Admin</span>}
                      {t.must_change_password && <span className="pill" style={{ background: '#fdf1dc', color: '#8a5a12' }} title="Hat sich noch nicht angemeldet bzw. das vorläufige Passwort noch nicht geändert">wartet auf 1. Login</span>}
                    </td>
                    <td>
                      {!self && (
                        <div className="row" style={{ justifyContent: 'flex-end', gap: 6, flexWrap: 'nowrap' }}>
                          <button className="btn ghost small" onClick={() => resetPassword(t)} title="Neues vorläufiges Passwort erzeugen">Passwort neu</button>
                          <button className="btn ghost small" onClick={() => toggleAdmin(t)}>{t.is_admin ? 'Admin entziehen' : 'Zum Admin'}</button>
                          <button className="btn danger small" onClick={() => deleteTeacher(t)} title="Konto löschen">✕</button>
                        </div>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card stack">
        <h3>Selbstregistrierung: zugelassene E-Mail-Domains</h3>
        <p className="muted small" style={{ margin: 0 }}>Lehrer mit einer E-Mail-Adresse dieser Domains können sich auch selbst registrieren.</p>
        <form className="row" onSubmit={addDomain}>
          <input type="text" className="grow" style={{ width: 'auto' }} placeholder="z. B. meine-schule.de" value={input} onChange={(e) => setInput(e.target.value)} />
          <button className="btn mint">Freigeben</button>
        </form>
        {!domains.length && <div className="alert info">Noch keine Domain freigegeben – Selbstregistrierung ist derzeit nicht möglich.</div>}
        <div className="row">
          {domains.map((d) => (
            <span key={d.domain} className="pill" style={{ fontSize: '.95rem', padding: '6px 6px 6px 14px', background: 'var(--accent-soft)' }}>
              @{d.domain} <button className="btn ghost icon small" style={{ padding: '2px 8px', border: 0 }} onClick={() => removeDomain(d.domain)} title="entfernen">✕</button>
            </span>
          ))}
        </div>
      </div>
    </div>
  )
}

function NameCell({ t, onSaved, onError }) {
  const [editing, setEditing] = useState(false)
  const [value, setValue] = useState(t.full_name || '')
  async function save() {
    setEditing(false)
    const name = value.trim()
    if (name === (t.full_name || '')) return
    const { error } = await supabase.from('profiles').update({ full_name: name || null }).eq('id', t.id)
    if (error) onError(errorText(error)); else onSaved()
  }
  if (editing) {
    return <input type="text" autoFocus value={value} style={{ padding: '6px 10px', minWidth: 160 }}
      onChange={(e) => setValue(e.target.value)} onBlur={save}
      onKeyDown={(e) => { if (e.key === 'Enter') e.target.blur(); if (e.key === 'Escape') { setValue(t.full_name || ''); setEditing(false) } }} />
  }
  return (
    <button className="name-edit" title="Namen bearbeiten" onClick={() => { setValue(t.full_name || ''); setEditing(true) }}>
      {t.full_name ? <b>{t.full_name}</b> : <span className="muted">Name eintragen</span>} <span className="muted small">✎</span>
    </button>
  )
}

function CredentialsCard({ c, onClose }) {
  const [copied, setCopied] = useState('')
  const loginUrl = `${appBaseUrl()}#/login`
  const firstName = (c.full_name || '').split(' ')[0]
  const text = [
    `Hallo ${firstName || c.full_name},`,
    '',
    c.isNew
      ? 'für dich wurde ein Zugang zu Klassenpuls (Live-Abstimmungen im Unterricht) eingerichtet.'
      : 'dein Passwort für Klassenpuls wurde zurückgesetzt.',
    '',
    `Adresse: ${loginUrl}`,
    `E-Mail: ${c.email}`,
    `Vorläufiges Passwort: ${c.password}`,
    '',
    'Bei der ersten Anmeldung wirst du gebeten, ein eigenes Passwort festzulegen.',
  ].join('\n')

  async function copy(what, value) {
    try { await navigator.clipboard.writeText(value) } catch {
      const ta = document.createElement('textarea'); ta.value = value; document.body.appendChild(ta); ta.select(); document.execCommand('copy'); ta.remove()
    }
    setCopied(what); setTimeout(() => setCopied(''), 1800)
  }

  const subject = 'Dein Zugang zu Klassenpuls'
  const mailto = `mailto:${encodeURIComponent(c.email)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(text)}`
  const teams = `https://teams.microsoft.com/l/chat/0/0?users=${encodeURIComponent(c.email)}&message=${encodeURIComponent(text)}`

  return (
    <div className="card stack" style={{ border: '2px solid var(--accent)', background: '#fbfdfc' }}>
      <div className="row spread">
        <h3 style={{ margin: 0 }}>✓ {c.isNew ? 'Lehrer angelegt' : 'Passwort zurückgesetzt'}: {c.full_name}</h3>
        <button className="btn ghost small" onClick={onClose}>Schließen</button>
      </div>
      <div className="alert info small">Das vorläufige Passwort wird nur jetzt angezeigt. Leite die Zugangsdaten gleich weiter.</div>
      <table className="simple">
        <tbody>
          <tr><td className="muted">Adresse</td><td><code>{loginUrl}</code></td></tr>
          <tr><td className="muted">E-Mail</td><td><code>{c.email}</code></td></tr>
          <tr><td className="muted">Vorläufiges Passwort</td><td className="row" style={{ gap: 10 }}><code style={{ fontSize: '1.2rem', fontWeight: 700, letterSpacing: '.05em' }}>{c.password}</code>
            <button className="btn ghost small" onClick={() => copy('pw', c.password)}>{copied === 'pw' ? 'Kopiert ✓' : 'Kopieren'}</button></td></tr>
        </tbody>
      </table>
      <label className="field"><span>Nachricht zum Weiterleiten</span>
        <textarea readOnly value={text} rows={9} style={{ fontFamily: 'inherit' }} onFocus={(e) => e.target.select()} />
      </label>
      <div className="row">
        <button className="btn" onClick={() => copy('text', text)}>{copied === 'text' ? 'Kopiert ✓' : 'Nachricht kopieren'}</button>
        <a className="btn sky" href={mailto}>✉ Per E-Mail senden</a>
        <a className="btn sky" href={teams} target="_blank" rel="noreferrer">In Teams öffnen</a>
      </div>
    </div>
  )
}
