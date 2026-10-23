import { useEffect, useState } from 'react'
import { useParams, Link, useLocation } from 'react-router-dom'
import { supabase, errorText, isGuest } from '../supabase'
import { ExpiryNote } from './Dashboard'
import { QUESTION_TYPES, blankQuestion, MATRIX_COLORS } from '../questionTypes'
import { inkOn } from '../themes'
import StartButton from '../components/StartButton'
import TypePreview from '../components/TypePreview'
import { QaStage } from '../components/Results'
import PinImageSettings from '../components/PinImageSettings'
import ThemePreview from '../components/ThemePreview'
import { THEMES, DEFAULT_THEME, themeByKey, useSchoolTheme } from '../themes'

export default function Editor({ auth }) {
  const schoolTheme = useSchoolTheme()
  const myTheme = auth.profile?.theme || schoolTheme || DEFAULT_THEME
  const { id } = useParams()
  const [poll, setPoll] = useState(null)
  const [questions, setQuestions] = useState([])
  const [removed, setRemoved] = useState([])
  const [dirty, setDirty] = useState(false)
  const [msg, setMsg] = useState(null)
  const [saving, setSaving] = useState(false)
  const loc = useLocation()
  const guest = isGuest(auth.session)
  // neue Abstimmung von der Startseite: Fragetyp-Auswahl gleich öffnen
  const [adding, setAdding] = useState(!!loc.state?.pick)

  useEffect(() => {
    (async () => {
      const [{ data: p, error }, { data: qs }] = await Promise.all([
        supabase.from('polls').select('*').eq('id', id).single(),
        supabase.from('questions').select('*').eq('poll_id', id).order('position'),
      ])
      if (error) return setMsg({ ok: false, text: errorText(error) })
      setPoll(p)
      setQuestions((qs || []).map((q) => ({ ...q, key: q.id })))
    })()
  }, [id])

  useEffect(() => {
    const warn = (e) => { if (dirty) { e.preventDefault(); e.returnValue = '' } }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [dirty])

  const touch = () => { setDirty(true); setMsg(null) }
  const setPollField = (k, v) => { setPoll({ ...poll, [k]: v }); touch() }
  const updateQ = (i, patch) => { setQuestions(questions.map((q, j) => (j === i ? { ...q, ...patch } : q))); touch() }
  const moveQ = (i, d) => {
    const j = i + d
    if (j < 0 || j >= questions.length) return
    const next = [...questions];[next[i], next[j]] = [next[j], next[i]]
    setQuestions(next); touch()
  }
  const removeQ = (i) => {
    const q = questions[i]
    if (q.id && !confirm('Frage löschen? Bereits gesammelte Antworten zu dieser Frage gehen dabei verloren.')) return
    if (q.id) setRemoved([...removed, q.id])
    setQuestions(questions.filter((_, j) => j !== i)); touch()
  }
  const addQ = (type) => {
    setQuestions([...questions, { ...blankQuestion(type), key: crypto.randomUUID() }])
    setAdding(false); touch()
  }

  function validate() {
    if (!poll.title.trim()) return 'Bitte gib der Umfrage eine Überschrift.'
    for (const [i, q] of questions.entries()) {
      if (!q.prompt.trim()) return `Frage ${i + 1}: Bitte einen Fragetext eingeben.`
      const opts = q.options.map((o) => o.trim()).filter(Boolean)
      if (q.type === 'multiple_choice' && opts.length < 2) return `Frage ${i + 1}: Mindestens zwei Antwortmöglichkeiten.`
      if (q.type === 'ranking' && opts.length < 2) return `Frage ${i + 1}: Mindestens zwei Punkte zum Sortieren.`
      if (q.type === 'pin' && !q.settings?.image_url) return `Frage ${i + 1}: Bitte ein Bild hochladen.`
      if (q.type === 'matrix') {
        if (!q.settings?.xLabel?.trim() || !q.settings?.yLabel?.trim()) return `Frage ${i + 1}: Bitte beide Achsen benennen.`
        if (opts.length < 1) return `Frage ${i + 1}: Mindestens ein Item.`
      }
      if (q.type === 'scale') {
        if (opts.length < 1) return `Frage ${i + 1}: Mindestens eine Aussage.`
        const { min, max } = q.settings
        if (!(Number.isInteger(+min) && Number.isInteger(+max) && +max > +min && +max - +min <= 10)) return `Frage ${i + 1}: Die Skala muss von einer kleineren zu einer größeren ganzen Zahl gehen (max. 11 Stufen).`
      }
    }
    return null
  }

  async function save() {
    const problem = validate()
    if (problem) { setMsg({ ok: false, text: problem }); return false }
    setSaving(true)
    try {
      const { error: e1 } = await supabase.from('polls').update({
        title: poll.title.trim(), description: poll.description?.trim() || null, is_shared: poll.is_shared, hide_logo: poll.hide_logo, theme: poll.theme || null, updated_at: new Date().toISOString(),
      }).eq('id', id)
      if (e1) throw e1
      if (removed.length) {
        const { error } = await supabase.from('questions').delete().in('id', removed)
        if (error) throw error
      }
      const rows = questions.map((q, i) => {
        const row = {
          poll_id: id, position: i, type: q.type, prompt: q.prompt.trim(),
          options: q.type === 'open' ? [] : q.options.map((o) => o.trim()).filter(Boolean),
          settings: q.type === 'scale' ? { ...q.settings, min: +q.settings.min, max: +q.settings.max } : q.settings,
        }
        if (q.type === 'matrix') {
          // leere Items entfernen – ihre Farben gleich mit
          const keep = q.options.map((o, k) => [o.trim(), q.settings.colors?.[k] || MATRIX_COLORS[k % MATRIX_COLORS.length]]).filter(([o]) => o)
          row.options = keep.map(([o]) => o)
          row.settings = { ...q.settings, xLabel: q.settings.xLabel.trim(), yLabel: q.settings.yLabel.trim(), colors: keep.map(([, c]) => c) }
        }
        if (q.id) row.id = q.id
        return row
      })
      const existing = rows.filter((r) => r.id)
      const fresh = rows.filter((r) => !r.id)
      if (existing.length) {
        const { error } = await supabase.from('questions').upsert(existing)
        if (error) throw error
      }
      let inserted = []
      if (fresh.length) {
        const { data, error } = await supabase.from('questions').insert(fresh).select()
        if (error) throw error
        inserted = data
      }
      // neue IDs übernehmen
      let k = 0
      setQuestions(questions.map((q, i) => {
        const r = rows[i]
        const base = { ...q, prompt: r.prompt, options: q.type === 'open' ? [] : r.options, settings: r.settings }
        return q.id ? base : { ...base, id: inserted[k++].id }
      }))
      setRemoved([]); setDirty(false)
      setMsg({ ok: true, text: 'Gespeichert ✓' })
      return true
    } catch (e) {
      setMsg({ ok: false, text: errorText(e) })
      return false
    } finally {
      setSaving(false)
    }
  }

  if (!poll) return <div className="container">{msg ? <div className="alert">{msg.text}</div> : <p className="muted">Lade …</p>}</div>

  return (
    <div className="container stack" style={{ maxWidth: 820 }}>
      <div className="row spread">
        <Link to="/dashboard" className="muted" onClick={(e) => { if (dirty && !confirm('Ungespeicherte Änderungen verwerfen?')) e.preventDefault() }}>← Zurück</Link>
        <div className="row">
          <button className="btn" onClick={save} disabled={saving}>{saving ? 'Speichere …' : dirty ? 'Speichern' : 'Gespeichert'}</button>
          <StartButton pollId={id} disabled={saving || !questions.length} beforeStart={() => (dirty ? save() : true)} />
        </div>
      </div>
      {msg && <div className={`alert ${msg.ok ? 'ok' : ''}`}>{msg.text}</div>}
      {poll.expires_at && <GuestSaveBar poll={poll} onSaved={(r) => setPoll((p) => ({ ...p, guest_code: r.code, expires_at: r.expires_at }))} />}

      <div className="card stack">
        <label className="field"><span>Überschrift der Umfrage</span>
          <input type="text" value={poll.title} placeholder="Neue Umfrage" onChange={(e) => setPollField('title', e.target.value)} style={{ fontSize: '1.3rem', fontWeight: 800 }}
            onFocus={() => { if (poll.title === 'Neue Umfrage') setPollField('title', '') }} />
        </label>
        <label className="field"><span>Beschreibung (optional, nur für dich)</span>
          <input type="text" value={poll.description || ''} onChange={(e) => setPollField('description', e.target.value)} />
        </label>
        {!guest && (
          <label className="row" style={{ fontWeight: 700 }}>
            <input type="checkbox" checked={poll.is_shared} onChange={(e) => setPollField('is_shared', e.target.checked)} />
            Mit Kollegen teilen (sie können eine Kopie übernehmen oder die Umfrage selbst starten)
          </label>
        )}
        <label className="row" style={{ fontWeight: 700 }}>
          <input type="checkbox" checked={!!poll.hide_logo} onChange={(e) => setPollField('hide_logo', e.target.checked)} />
          Logo bei dieser Umfrage ausblenden
          <span className="muted small" style={{ fontWeight: 400 }}>(kein Logo am Beamer und auf den Schülerhandys)</span>
        </label>
        <div className="row" style={{ alignItems: 'flex-start', gap: 16 }}>
          <label className="field" style={{ minWidth: 240 }}><span>Stil dieser Umfrage</span>
            <select value={poll.theme || ''} onChange={(e) => setPollField('theme', e.target.value || null)}>
              <option value="">Mein Standard ({themeByKey(myTheme).name})</option>
              {THEMES.map((t) => <option key={t.key} value={t.key}>{t.name}</option>)}
            </select>
            <small className="muted" style={{ display: 'block', marginTop: 6, fontWeight: 400 }}>Gilt für Beamer und Schülerhandys.</small>
          </label>
          <div style={{ width: 220 }}><ThemePreview themeKey={poll.theme || myTheme} /></div>
        </div>
      </div>

      {questions.map((q, i) => (
        <QuestionEditor key={q.key} q={q} index={i} total={questions.length}
          onChange={(patch) => updateQ(i, patch)} onMove={(d) => moveQ(i, d)} onRemove={() => removeQ(i)} />
      ))}

      {adding ? (
        <div className="card stack">
          <div className="row spread"><b>Fragetyp wählen</b><button className="btn ghost small" onClick={() => setAdding(false)}>Abbrechen</button></div>
          <TypePicker onPick={addQ} />
        </div>
      ) : (
        <button className="btn ghost big" style={{ justifyContent: 'center' }} onClick={() => setAdding(true)}>＋ Frage hinzufügen</button>
      )}
    </div>
  )
}

// Gast-Abstimmung: Ablauf anzeigen und „Für 3 Tage speichern“ (8-stelliger Code zum Wiederöffnen)
function GuestSaveBar({ poll, onSaved }) {
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  async function keep() {
    setBusy(true); setErr('')
    const { data, error } = await supabase.rpc('save_guest_poll', { p_poll: poll.id })
    setBusy(false)
    if (error) return setErr(errorText(error))
    onSaved(data)
  }
  return (
    <div className="card guest-bar">
      {poll.guest_code ? (
        <div className="stack" style={{ gap: 6 }}>
          <div>Mit diesem Code öffnest du die Abstimmung auf jedem Gerät – auf der Startseite eingeben:</div>
          <div className="guest-code">{poll.guest_code.replace(/(\d{4})(\d{4})/, '$1 $2')}</div>
          <ExpiryNote poll={poll} />
        </div>
      ) : (
        <div className="row spread">
          <div className="stack" style={{ gap: 2 }}>
            <b>Abstimmung ohne Konto</b>
            <ExpiryNote poll={poll} />
          </div>
          <button className="btn" onClick={keep} disabled={busy}>{busy ? '…' : 'Für 3 Tage speichern'}</button>
        </div>
      )}
      {err && <div className="alert" style={{ marginTop: 8 }}>{err}</div>}
    </div>
  )
}

function QuestionEditor({ q, index, total, onChange, onMove, onRemove }) {
  const t = QUESTION_TYPES[q.type]
  const setOpt = (i, v) => onChange({ options: q.options.map((o, j) => (j === i ? v : o)) })
  const setSetting = (k, v) => onChange({ settings: { ...q.settings, [k]: v } })
  return (
    <div className={`card stack q-card t-${q.type}`}>
      <div className="row spread">
        <span className="pill">Frage {index + 1} · {t.icon} {t.label}</span>
        <div className="row">
          <button className="btn ghost icon small" onClick={() => onMove(-1)} disabled={index === 0} title="nach oben">↑</button>
          <button className="btn ghost icon small" onClick={() => onMove(1)} disabled={index === total - 1} title="nach unten">↓</button>
          <button className="btn danger icon small" onClick={onRemove} title="Frage löschen">✕</button>
        </div>
      </div>
      <input type="text" placeholder="Fragetext …" value={q.prompt} onChange={(e) => onChange({ prompt: e.target.value })} style={{ fontWeight: 700 }} />

      {t.optionLabel && (
        <div className="stack" style={{ marginTop: 10 }}>
          <span className="small" style={{ fontWeight: 700 }}>{t.optionLabel}</span>
          {q.options.map((o, i) => (
            <div className="row" key={i}>
              <input type="text" className="grow" style={{ width: 'auto' }} value={o} placeholder={`${q.type === 'scale' ? 'Aussage' : 'Option'} ${i + 1}`} onChange={(e) => setOpt(i, e.target.value)} />
              <button className="btn ghost icon small" onClick={() => onChange({ options: q.options.filter((_, j) => j !== i) })} disabled={q.options.length <= 1} title="entfernen">✕</button>
            </div>
          ))}
          <button className="btn ghost small" style={{ width: 'fit-content' }} onClick={() => onChange({ options: [...q.options, ''] })}>＋ hinzufügen</button>
        </div>
      )}

      {q.type === 'matrix' && <MatrixEditor q={q} onChange={onChange} />}

      {q.type === 'multiple_choice' && (
        <label className="row small" style={{ fontWeight: 700 }}>
          <input type="checkbox" checked={!!q.settings.multiple} onChange={(e) => setSetting('multiple', e.target.checked)} /> Mehrfachauswahl erlauben
        </label>
      )}
      {q.type === 'scale' && (
        <div className="row small">
          <label className="field" style={{ width: 80 }}><span>von</span><input type="number" value={q.settings.min} onChange={(e) => setSetting('min', e.target.value)} /></label>
          <label className="field grow"><span>Beschriftung unten</span><input type="text" value={q.settings.minLabel || ''} onChange={(e) => setSetting('minLabel', e.target.value)} /></label>
          <label className="field" style={{ width: 80 }}><span>bis</span><input type="number" value={q.settings.max} onChange={(e) => setSetting('max', e.target.value)} /></label>
          <label className="field grow"><span>Beschriftung oben</span><input type="text" value={q.settings.maxLabel || ''} onChange={(e) => setSetting('maxLabel', e.target.value)} /></label>
        </div>
      )}
      {q.type === 'pin' && (
        <PinImageSettings settings={q.settings} onChange={(settings) => onChange({ settings })} />
      )}
      {q.type === 'qa' && (
        <div className="stack">
          <QaStage items={[]} index={0} big={false} />
          <label className="row small" style={{ fontWeight: 700 }}>
            <input type="checkbox" checked={q.settings.voting !== false} onChange={(e) => setSetting('voting', e.target.checked)} /> Teilnehmer können eingereichte Fragen einsehen und positiv bewerten
          </label>
          <label className="row small" style={{ fontWeight: 700 }}>
            <input type="checkbox" checked={!!q.settings.moderate} onChange={(e) => setSetting('moderate', e.target.checked)} /> Eingereichte Fragen moderieren
          </label>
        </div>
      )}
      {q.type === 'open' && (
        <label className="field small" style={{ maxWidth: 300 }}><span>Darstellung am Beamer</span>
          <select value={q.settings.display || 'wall'} onChange={(e) => setSetting('display', e.target.value)}>
            <option value="wall">Pinnwand (Notizzettel)</option>
            <option value="cloud">Wortwolke</option>
          </select>
        </label>
      )}
    </div>
  )
}

// Fragetyp-Auswahl mit Mini-Vorschau; beim Überfahren erscheinen Erklärung und große Vorschau
function TypePicker({ onPick }) {
  const [hover, setHover] = useState(null)

  useEffect(() => {
    if (!hover) return
    const hide = () => setHover(null)
    window.addEventListener('scroll', hide, true)
    window.addEventListener('resize', hide)
    return () => { window.removeEventListener('scroll', hide, true); window.removeEventListener('resize', hide) }
  }, [hover])

  function show(type, el) {
    const r = el.getBoundingClientRect()
    const vw = window.innerWidth, vh = window.innerHeight, gap = 10, m = 12
    const clamp = (v, lo, hi) => Math.min(Math.max(v, lo), hi)
    let popW = Math.min(520, vw - 2 * m)
    const popH = (w) => (w - 28) * 450 / 800 + 150 // Vorschau + Text
    let top, left
    if (r.bottom + gap + popH(popW) <= vh - m) { // unterhalb
      top = r.bottom + gap; left = clamp(r.left + r.width / 2 - popW / 2, m, vw - popW - m)
    } else if (r.top - gap - popH(popW) >= m) { // oberhalb
      top = r.top - gap - popH(popW); left = clamp(r.left + r.width / 2 - popW / 2, m, vw - popW - m)
    } else { // seitlich, wo mehr Platz ist
      const right = vw - r.right - gap - m, leftSpace = r.left - gap - m
      popW = Math.min(popW, Math.max(right, leftSpace, 260))
      left = right >= leftSpace ? r.right + gap : r.left - gap - popW
      top = clamp(r.top + r.height / 2 - popH(popW) / 2, m, vh - popH(popW) - m)
    }
    setHover({ type, left, top, popW })
  }

  return (
    <>
      <div className="type-picker">
        {Object.entries(QUESTION_TYPES).map(([type, t]) => (
          <button key={type} onClick={() => onPick(type)}
            onMouseEnter={(e) => show(type, e.currentTarget)} onMouseLeave={() => setHover(null)}
            onMouseMove={(e) => { if (hover?.type !== type) show(type, e.currentTarget) }}
            onFocus={(e) => show(type, e.currentTarget)} onBlur={() => setHover(null)}>
            <TypePreview type={type} width={168} />
            <b>{t.icon} {t.label}</b><span className="muted small">{t.hint}</span>
          </button>
        ))}
      </div>
      {hover && (
        <div className="type-popover" style={{ left: hover.left, top: hover.top, width: hover.popW }} role="tooltip">
          <TypePreview type={hover.type} width={hover.popW - 28} />
          <b style={{ fontSize: '1.1rem' }}>{QUESTION_TYPES[hover.type].icon} {QUESTION_TYPES[hover.type].label}</b>
          <p className="small" style={{ margin: 0 }}>{QUESTION_TYPES[hover.type].explain}</p>
        </div>
      )}
    </>
  )
}

// 4-Felder: Achsenbezeichnungen und beliebig viele Items mit eigener Farbe
function MatrixEditor({ q, onChange }) {
  const colors = q.options.map((_, i) => q.settings.colors?.[i] || MATRIX_COLORS[i % MATRIX_COLORS.length])
  const set = (patch) => onChange({ settings: { ...q.settings, ...patch } })
  const setItem = (i, text) => onChange({ options: q.options.map((o, j) => (j === i ? text : o)) })
  const setColor = (i, c) => set({ colors: colors.map((x, j) => (j === i ? c : x)) })
  const remove = (i) => onChange({ options: q.options.filter((_, j) => j !== i), settings: { ...q.settings, colors: colors.filter((_, j) => j !== i) } })
  const add = () => {
    const next = MATRIX_COLORS.find((c) => !colors.includes(c)) || MATRIX_COLORS[q.options.length % MATRIX_COLORS.length]
    onChange({ options: [...q.options, ''], settings: { ...q.settings, colors: [...colors, next] } })
  }
  return (
    <div className="stack" style={{ marginTop: 10 }}>
      <div className="row" style={{ alignItems: 'flex-end' }}>
        <label className="field grow" style={{ minWidth: 180 }}><span>x-Achse (waagerecht →)</span>
          <input type="text" value={q.settings.xLabel || ''} placeholder="z. B. Aufwand" onChange={(e) => set({ xLabel: e.target.value })} />
        </label>
        <label className="field grow" style={{ minWidth: 180 }}><span>y-Achse (senkrecht ↑)</span>
          <input type="text" value={q.settings.yLabel || ''} placeholder="z. B. Wirkung" onChange={(e) => set({ yLabel: e.target.value })} />
        </label>
      </div>
      <span className="small" style={{ fontWeight: 700 }}>Items (Farbpunkt anklicken, um die Farbe zu ändern)</span>
      {q.options.map((o, i) => (
        <div className="row" key={i}>
          <label className="color-dot" style={{ background: colors[i], color: inkOn(colors[i]) }} title="Farbe wählen">
            <span>{i + 1}</span>
            <input type="color" value={colors[i]} onChange={(e) => setColor(i, e.target.value)} aria-label={`Farbe von Item ${i + 1}`} />
          </label>
          <input type="text" className="grow" style={{ width: 'auto' }} value={o} placeholder={`Item ${i + 1}`} onChange={(e) => setItem(i, e.target.value)} />
          <button className="btn ghost icon small" onClick={() => remove(i)} disabled={q.options.length <= 1} title="entfernen">✕</button>
        </div>
      ))}
      <button className="btn ghost small" style={{ width: 'fit-content' }} onClick={add}>＋ Item hinzufügen</button>
    </div>
  )
}
