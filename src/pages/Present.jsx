import { useEffect, useMemo, useRef, useState, useCallback } from 'react'
import { useParams, Link } from 'react-router-dom'
import QRCode from 'qrcode'
import { supabase, joinUrl, errorText } from '../supabase'
import { QUESTION_TYPES } from '../questionTypes'
import Results from '../components/Results'

export default function Present() {
  const { sessionId } = useParams()
  const [session, setSession] = useState(null)
  const [questions, setQuestions] = useState([])
  const [responses, setResponses] = useState([])
  const [qr, setQr] = useState('')
  const [bigQr, setBigQr] = useState(false)
  const [online, setOnline] = useState(0)
  const [err, setErr] = useState('')
  const channelRef = useRef(null)

  // Laden
  useEffect(() => {
    (async () => {
      const { data: s, error } = await supabase.from('sessions').select('*, polls(title)').eq('id', sessionId).single()
      if (error) return setErr(errorText(error))
      const { data: qs, error: e2 } = await supabase.from('questions').select('*').eq('poll_id', s.poll_id).order('position').order('id')
      if (e2) return setErr(errorText(e2))
      setSession(s); setQuestions(qs)
      setQr(await QRCode.toDataURL(joinUrl(s.code), { width: 720, margin: 1, color: { dark: '#2d2e33', light: '#ffffff' } }))
    })()
  }, [sessionId])

  const loadResponses = useCallback(async () => {
    const { data } = await supabase.from('responses').select('id, question_id, answer, participant_id').eq('session_id', sessionId)
    if (data) setResponses(data)
  }, [sessionId])

  // Live-Antworten (Realtime + Fallback-Polling)
  useEffect(() => {
    loadResponses()
    let t
    const debounced = () => { clearTimeout(t); t = setTimeout(loadResponses, 250) }
    const ch = supabase.channel(`responses-${sessionId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'responses', filter: `session_id=eq.${sessionId}` }, debounced)
      .subscribe()
    const poll = setInterval(loadResponses, 5000)
    return () => { clearTimeout(t); clearInterval(poll); supabase.removeChannel(ch) }
  }, [sessionId, loadResponses])

  // Kanal zu den Schülergeräten: Fragewechsel pushen + Teilnehmer zählen
  const code = session?.code
  const live = session?.status === 'live'
  useEffect(() => {
    if (!code || !live) return
    const ch = supabase.channel(`live-${code}`, { config: { presence: { key: 'teacher', enabled: true } } })
    ch.on('presence', { event: 'sync' }, () => {
      const state = ch.presenceState()
      setOnline(Object.keys(state).filter((k) => k !== 'teacher').length)
    }).subscribe()
    channelRef.current = ch
    return () => { channelRef.current = null; supabase.removeChannel(ch) }
  }, [code, live])

  const notify = () => channelRef.current?.send({ type: 'broadcast', event: 'state', payload: {} })

  async function patch(fields) {
    const prev = session
    setSession({ ...session, ...fields })
    const { error } = await supabase.from('sessions').update(fields).eq('id', sessionId)
    if (error) { setSession(prev); setErr(errorText(error)); return }
    notify()
  }

  const idx = session?.current_index ?? 0
  const go = (d) => {
    const n = Math.min(Math.max(idx + d, 0), questions.length - 1)
    if (n !== idx) patch({ current_index: n })
  }
  const toggleResults = () => patch({ show_results: !session.show_results })
  const end = () => { if (confirm('Umfrage beenden? Schüler können danach nicht mehr abstimmen. Die Ergebnisse bleiben gespeichert.')) patch({ status: 'ended', ended_at: new Date().toISOString() }) }
  const fullscreen = () => (document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen?.())

  // Tastatur & Presenter-Fernbedienung
  const keyRef = useRef()
  keyRef.current = (e) => {
    if (!session || e.target.closest?.('input, textarea')) return
    if (['ArrowRight', 'PageDown', ' '].includes(e.key)) { e.preventDefault(); go(1) }
    else if (['ArrowLeft', 'PageUp'].includes(e.key)) { e.preventDefault(); go(-1) }
    else if (e.key === 'r') toggleResults()
    else if (e.key === 'f') fullscreen()
    else if (e.key === 'q') setBigQr((v) => !v)
    else if (e.key === 'Escape') setBigQr(false)
  }
  useEffect(() => {
    const h = (e) => keyRef.current(e)
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [])

  const q = questions[idx]
  const answers = useMemo(() => responses.filter((r) => r.question_id === q?.id).map((r) => r.answer), [responses, q])
  const participants = useMemo(() => new Set(responses.map((r) => r.participant_id)).size, [responses])

  if (err && !session) return <div className="container"><div className="alert">{err}</div><p><Link to="/dashboard">← Zurück</Link></p></div>
  if (!session) return <div className="container muted">Lade …</div>

  const joinAddress = joinUrl(session.code).replace(/^https?:\/\//, '').replace(/#\/j\/\d+$/, '')

  return (
    <div className="present">
      <div className="present-head">
        <div className="grow">
          <div className="muted" style={{ fontWeight: 800 }}>{session.polls?.title}{session.label ? ` · ${session.label}` : ''}</div>
          {!live && <span className="pill ended">Beendet – Ergebnisansicht</span>}
        </div>
        {live && (
          <div className="join-hint">
            {qr && <img src={qr} alt="QR-Code zum Mitmachen" onClick={() => setBigQr(true)} title="Klicken zum Vergrößern (Taste Q)" />}
            <div>
              <div className="small muted">Mitmachen auf <b>{joinAddress}</b> mit Code</div>
              <div className="code">{session.code.replace(/(\d{3})(\d{3})/, '$1 $2')}</div>
            </div>
          </div>
        )}
      </div>

      <div className="present-main">
        {q ? (
          <>
            <div className="muted small" style={{ fontWeight: 800 }}>{QUESTION_TYPES[q.type].icon} {QUESTION_TYPES[q.type].label}</div>
            <h1>{q.prompt}</h1>
            {session.show_results || !live
              ? <Results question={q} answers={answers} />
              : <div className="empty-results"><div className="bounce">🙈</div><div>Ergebnisse sind verborgen – {answers.length} Antwort{answers.length === 1 ? '' : 'en'} eingegangen</div></div>}
          </>
        ) : <div className="empty-results">Diese Umfrage hat noch keine Fragen.</div>}
      </div>

      <div className="present-foot">
        <Link to="/dashboard" className="btn ghost small">← Übersicht</Link>
        {live && <span className="counter" title="Geräte, die gerade verbunden sind">👥 {online} online</span>}
        <span className="counter" title="Antworten auf diese Frage">✔ {answers.length} Antworten</span>
        <span className="muted small">{participants} Teilnehmer insgesamt</span>
        <div className="grow" />
        {err && <span className="alert small">{err}</span>}
        <button className="btn ghost" onClick={() => go(-1)} disabled={idx === 0} title="Vorherige Frage (←)">←</button>
        <span className="counter">{questions.length ? idx + 1 : 0} / {questions.length}</span>
        <button className="btn" onClick={() => go(1)} disabled={idx >= questions.length - 1} title="Nächste Frage (→ / Leertaste)">Nächste Frage →</button>
        {live && <button className="btn peach" onClick={toggleResults} title="Taste R">{session.show_results ? 'Ergebnisse verbergen' : 'Ergebnisse zeigen'}</button>}
        <button className="btn ghost" onClick={fullscreen} title="Vollbild (Taste F)">⛶</button>
        {live && <button className="btn danger" onClick={end}>Beenden</button>}
      </div>

      {bigQr && live && (
        <div className="qr-overlay" onClick={() => setBigQr(false)}>
          <div>
            <img src={qr} alt="QR-Code zum Mitmachen" />
            <p style={{ fontSize: '1.4rem', fontWeight: 800 }}>{joinAddress}</p>
            <div className="code">{session.code.replace(/(\d{3})(\d{3})/, '$1 $2')}</div>
          </div>
        </div>
      )}
    </div>
  )
}
