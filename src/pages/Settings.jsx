import { useEffect, useState } from 'react'
import { supabase, errorText } from '../supabase'
import { notifyLogoChanged } from '../components/CornerLogo'
import ThemePreview from '../components/ThemePreview'
import { THEMES, DEFAULT_THEME, themeByKey, useSchoolTheme } from '../themes'

// Persönliche Einstellungen: eigenes Logo wählen und Passwort ändern
export default function Settings({ auth }) {
  const [logos, setLogos] = useState(null)
  const [defaultId, setDefaultId] = useState(null)
  const [msg, setMsg] = useState(null)
  const hidden = !!auth.profile?.hide_logo
  const current = hidden ? 'none' : auth.profile?.logo_id || null

  useEffect(() => {
    Promise.all([
      supabase.from('logos').select('*').order('title'),
      supabase.from('app_settings').select('value').eq('key', 'default_logo').maybeSingle(),
    ]).then(([l, d]) => { setLogos(l.data || []); setDefaultId(d.data?.value?.logo_id || null) })
  }, [])

  async function choose(id) {
    setMsg(null)
    const { error } = await supabase.rpc('set_my_logo', id === 'none' ? { p_logo: null, p_hide: true } : { p_logo: id, p_hide: false })
    if (error) return setMsg({ ok: false, text: errorText(error) })
    await auth.refreshProfile()
    notifyLogoChanged()
    setMsg({ ok: true, text: 'Logo gespeichert ✓' })
  }

  const defaultLogo = logos?.find((l) => l.id === defaultId)

  return (
    <div className="container stack" style={{ maxWidth: 900 }}>
      <h1>Einstellungen</h1>

      <div className="card stack">
        <h3 style={{ margin: 0 }}>Mein Logo</h3>
        <p className="muted small" style={{ margin: 0 }}>
          Das Logo erscheint mittig unten auf deinen Seiten, am Beamer und auf den Handys deiner Schüler.
          Ohne eigene Auswahl wird das Standardlogo der Schule verwendet – du kannst das Logo auch ganz ausblenden.
        </p>
        {msg && <div className={`alert ${msg.ok ? 'ok' : ''}`}>{msg.text}</div>}
        {logos === null ? <p className="muted">Lade …</p> : (
          <div className="logo-grid">
            <button className={`logo-tile ${!current ? 'on' : ''}`} onClick={() => choose(null)}>
              <div className="logo-box">{defaultLogo ? <img src={defaultLogo.url} alt="" /> : <span className="muted small">kein Logo</span>}</div>
              <b className="small">Standard verwenden</b>
              <span className="muted small">{defaultLogo ? defaultLogo.title : 'Es ist kein Standardlogo gesetzt.'}</span>
            </button>
            <button className={`logo-tile ${current === 'none' ? 'on' : ''}`} onClick={() => choose('none')}>
              <div className="logo-box"><span className="muted" style={{ fontSize: '1.6rem' }}>∅</span></div>
              <b className="small">Kein Logo</b>
              <span className="muted small">Auf deinen Seiten, am Beamer und bei deinen Schülern erscheint kein Logo.</span>
            </button>
            {logos.map((l) => (
              <button key={l.id} className={`logo-tile ${current === l.id ? 'on' : ''}`} onClick={() => choose(l.id)}>
                <div className="logo-box"><img src={l.url} alt="" /></div>
                <b className="small">{l.title}</b>
                {l.id === defaultId && <span className="muted small">Standardlogo</span>}
              </button>
            ))}
          </div>
        )}
        {logos?.length === 0 && <p className="muted small" style={{ margin: 0 }}>Es wurden noch keine Logos hochgeladen. Das kann ein Admin unter „Verwaltung“ erledigen.</p>}
      </div>

      <ThemeCard auth={auth} />

      <PasswordCard />
    </div>
  )
}

function PasswordCard() {
  const [pw, setPw] = useState('')
  const [pw2, setPw2] = useState('')
  const [msg, setMsg] = useState(null)
  async function save(e) {
    e.preventDefault(); setMsg(null)
    if (pw.length < 8) return setMsg({ ok: false, text: 'Bitte mindestens 8 Zeichen verwenden.' })
    if (pw !== pw2) return setMsg({ ok: false, text: 'Die beiden Passwörter stimmen nicht überein.' })
    const { error } = await supabase.auth.updateUser({ password: pw })
    if (error) return setMsg({ ok: false, text: errorText(error) })
    setPw(''); setPw2('')
    setMsg({ ok: true, text: 'Passwort geändert ✓' })
  }
  return (
    <form className="card stack" onSubmit={save}>
      <h3 style={{ margin: 0 }}>Passwort ändern</h3>
      <div className="row">
        <label className="field grow" style={{ minWidth: 200 }}><span>Neues Passwort</span>
          <input type="password" autoComplete="new-password" value={pw} onChange={(e) => setPw(e.target.value)} />
        </label>
        <label className="field grow" style={{ minWidth: 200 }}><span>Wiederholen</span>
          <input type="password" autoComplete="new-password" value={pw2} onChange={(e) => setPw2(e.target.value)} />
        </label>
      </div>
      {msg && <div className={`alert ${msg.ok ? 'ok' : ''}`}>{msg.text}</div>}
      <button className="btn" style={{ width: 'fit-content' }} disabled={!pw}>Passwort speichern</button>
    </form>
  )
}

function ThemeCard({ auth }) {
  const school = useSchoolTheme() || DEFAULT_THEME
  const current = auth.profile?.theme || null // null = Schulstandard
  const [msg, setMsg] = useState(null)
  async function choose(key) {
    setMsg(null)
    const { error } = await supabase.rpc('set_my_theme', { p_theme: key })
    if (error) return setMsg({ ok: false, text: errorText(error) })
    await auth.refreshProfile()
    setMsg({ ok: true, text: 'Stil gespeichert ✓' })
  }
  return (
    <div className="card stack">
      <h3 style={{ margin: 0 }}>Mein Stil</h3>
      <p className="muted small" style={{ margin: 0 }}>
        Der Stil gilt für deine Seiten, den Beamer und die Handys deiner Schüler. Im Editor kannst du
        für einzelne Umfragen einen anderen Stil wählen.
      </p>
      {msg && <div className={`alert ${msg.ok ? 'ok' : ''}`}>{msg.text}</div>}
      <div className="theme-grid">
        <button className={`theme-tile ${!current ? 'on' : ''}`} onClick={() => choose(null)}>
          <ThemePreview themeKey={school} />
          <b className="small">Schulstandard verwenden{!current ? ' ✓' : ''}</b>
          <span className="muted small">Zurzeit: {themeByKey(school).name}. Ändert sich mit, wenn der Admin den Schulstandard wechselt.</span>
        </button>
        {THEMES.map((t) => (
          <button key={t.key} className={`theme-tile ${current === t.key ? 'on' : ''}`} onClick={() => choose(t.key)}>
            <ThemePreview themeKey={t.key} />
            <b className="small">{t.name}{current === t.key ? ' ✓' : ''}</b>
            <span className="muted small">{t.desc}{t.key === school ? ' · Schulstandard' : ''}</span>
          </button>
        ))}
      </div>
    </div>
  )
}
