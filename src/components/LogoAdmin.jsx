import { useCallback, useEffect, useState } from 'react'
import { supabase, errorText } from '../supabase'
import { uploadLogo, BUCKET } from '../images'
import { notifyLogoChanged } from './CornerLogo'

const titleFromFile = (name) => name.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').trim().slice(0, 80) || 'Logo'

// Admin: Logos hochladen, benennen, Standardlogo setzen, löschen
export default function LogoAdmin() {
  const [logos, setLogos] = useState([])
  const [defaultId, setDefaultId] = useState(null)
  const [usage, setUsage] = useState({})
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  const load = useCallback(async () => {
    const [l, d, p] = await Promise.all([
      supabase.from('logos').select('*').order('created_at'),
      supabase.from('app_settings').select('value').eq('key', 'default_logo').maybeSingle(),
      supabase.from('profiles').select('logo_id').not('logo_id', 'is', null),
    ])
    setLogos(l.data || [])
    setDefaultId(d.data?.value?.logo_id || null)
    const u = {}
    ;(p.data || []).forEach((r) => { u[r.logo_id] = (u[r.logo_id] || 0) + 1 })
    setUsage(u)
  }, [])
  useEffect(() => { load() }, [load])

  async function upload(e) {
    const files = [...(e.target.files || [])]
    e.target.value = ''
    if (!files.length) return
    setBusy(true); setErr('')
    const failed = []
    for (const file of files) {
      try {
        const img = await uploadLogo(file)
        const { error } = await supabase.from('logos').insert({ path: img.path, url: img.url, width: img.width, height: img.height, title: titleFromFile(file.name) })
        if (error) { await supabase.storage.from(BUCKET).remove([img.path]); throw error }
      } catch (e2) { failed.push(`${file.name}: ${errorText(e2)}`) }
    }
    setBusy(false)
    if (failed.length) setErr(`Nicht hochgeladen: ${failed.join(' · ')}`)
    load()
  }

  async function setDefault(id) {
    setErr('')
    const { error } = id
      ? await supabase.from('app_settings').upsert({ key: 'default_logo', value: { logo_id: id }, updated_at: new Date().toISOString() })
      : await supabase.from('app_settings').delete().eq('key', 'default_logo')
    if (error) return setErr(errorText(error))
    setDefaultId(id); notifyLogoChanged()
  }

  async function rename(logo, title) {
    const t = title.trim()
    if (!t || t === logo.title) return
    const { error } = await supabase.from('logos').update({ title: t }).eq('id', logo.id)
    if (error) setErr(errorText(error)); else load()
  }

  async function remove(logo) {
    const users = usage[logo.id] || 0
    const notes = []
    if (logo.id === defaultId) notes.push('Es ist das Standardlogo – danach gibt es kein Standardlogo mehr.')
    if (users) notes.push(`${users} Lehrer ${users === 1 ? 'nutzt' : 'nutzen'} es; sie sehen danach wieder das Standardlogo.`)
    if (!confirm(`Logo „${logo.title}“ löschen?${notes.length ? '\n\n' + notes.join('\n') : ''}`)) return
    if (logo.id === defaultId) await supabase.from('app_settings').delete().eq('key', 'default_logo')
    const { error } = await supabase.from('logos').delete().eq('id', logo.id)
    if (error) return setErr(errorText(error))
    await supabase.storage.from(BUCKET).remove([logo.path])
    notifyLogoChanged(); load()
  }

  return (
    <div className="card stack">
      <div className="row spread">
        <h3 style={{ margin: 0 }}>Logos</h3>
        <label className="btn mint" style={{ cursor: busy ? 'wait' : 'pointer' }}>
          {busy ? 'Lade hoch …' : '⬆ Logo hochladen'}
          <input type="file" accept="image/png,image/jpeg,image/webp" multiple onChange={upload} disabled={busy} style={{ display: 'none' }} />
        </label>
      </div>
      <p className="muted small" style={{ margin: 0 }}>
        Das Logo erscheint unten links auf allen Seiten. Das <b>Standardlogo</b> gilt für alle; Lehrer können unter
        „Einstellungen“ ein anderes Logo aus dieser Liste wählen. Ideal: PNG mit transparentem Hintergrund.
      </p>
      {err && <div className="alert">{err}</div>}
      {!logos.length && <p className="muted" style={{ margin: 0 }}>Noch keine Logos hochgeladen.</p>}
      <div className="logo-grid">
        {logos.map((l) => (
          <div key={l.id} className={`logo-tile ${l.id === defaultId ? 'on' : ''}`}>
            <div className="logo-box"><img src={l.url} alt="" /></div>
            <input type="text" defaultValue={l.title} aria-label="Name des Logos" style={{ fontWeight: 700 }}
              onBlur={(e) => rename(l, e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') e.target.blur() }} />
            <div className="small muted">{usage[l.id] ? `Gewählt von ${usage[l.id]} Lehrer${usage[l.id] === 1 ? '' : 'n'}` : ' '}</div>
            <div className="row" style={{ gap: 6 }}>
              {l.id === defaultId
                ? <><span className="pill live">★ Standard</span><button className="btn ghost small" onClick={() => setDefault(null)}>Aufheben</button></>
                : <button className="btn ghost small" onClick={() => setDefault(l.id)}>Als Standard</button>}
              <button className="btn danger small" onClick={() => remove(l)} title="Logo löschen">✕</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
