import { useEffect, useMemo, useRef, useState, useCallback } from 'react'
import { useParams, Link } from 'react-router-dom'
import QRCode from 'qrcode'
import { supabase, joinUrl, errorText } from '../supabase'
import { QUESTION_TYPES } from '../questionTypes'
import Results, { QaStage } from '../components/Results'
import CornerLogo, { useLogoUrl } from '../components/CornerLogo'
import { useTheme } from '../themes'

export default function Present({ auth }) {
  const { sessionId } = useParams()
  const [session, setSession] = useState(null)
  const [questions, setQuestions] = useState([])
  const [responses, setResponses] = useState([])
  const [qr, setQr] = useState('')
  const [bigQr, setBigQr] = useState(false)
  const [online, setOnline] = useState(0)
  const [err, setErr] = useState('')
  const channelRef = useRef(null)
  const [ownerId, setOwnerId] = useState(null)
  const [hideLogo, setHideLogo] = useState(false)
  const ownerLogo = useLogoUrl(ownerId)
  const logoUrl = hideLogo ? null : ownerLogo
  const [pollTheme, setPollTheme] = useState(null)
  const [qaRows, setQaRows] = useState([])
  const [qaVotes, setQaVotes] = useState([])
  const [qaId, setQaId] = useState(null) // gerade gezeigte Q&A-Frage (bleibt beim Umsortieren stehen)
  const [moderating, setModerating] = useState(false)
  const [undoStack, setUndoStack] = useState([]) // zuletzt als beantwortet markierte Fragen
  useTheme(pollTheme || auth?.profile?.theme)

  // Laden
  useEffect(() => {
    (async () => {
      const { data: s, error } = await supabase.from('sessions').select('*, polls(title, hide_logo, theme)').eq('id', sessionId).single()
      if (error) return setErr(errorText(error))
      const { data: qs, error: e2 } = await supabase.from('questions').select('*').eq('poll_id', s.poll_id).order('position').order('id')
      if (e2) return setErr(errorText(e2))
      setSession(s); setQuestions(qs); setOwnerId(s.owner_id); setHideLogo(!!s.polls?.hide_logo); setPollTheme(s.polls?.theme || null)
    })()
  }, [sessionId])

  const sessionCode = session?.code
  useEffect(() => {
    if (!sessionCode) return
    QRCode.toDataURL(joinUrl(sessionCode), { width: 720, margin: 1, color: { dark: '#2d2e33', light: '#ffffff' } }).then(setQr)
  }, [sessionCode])

  const loadResponses = useCallback(async () => {
    const { data } = await supabase.from('responses').select('id, question_id, answer, participant_id, participant_name').eq('session_id', sessionId)
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

  // Q&A: eingereichte Fragen und Daumen (Realtime + Fallback-Polling)
  const loadQa = useCallback(async () => {
    const [{ data: rows }, { data: votes }] = await Promise.all([
      supabase.from('qa_questions').select('id, question_id, text, approved, answered, created_at').eq('session_id', sessionId),
      supabase.from('qa_votes').select('qa_question_id').eq('session_id', sessionId),
    ])
    if (rows) setQaRows(rows)
    if (votes) setQaVotes(votes)
  }, [sessionId])
  const hasQa = questions.some((x) => x.type === 'qa')
  useEffect(() => {
    if (!hasQa) return
    loadQa()
    let t
    const debounced = () => { clearTimeout(t); t = setTimeout(loadQa, 250) }
    const ch = supabase.channel(`qa-${sessionId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'qa_questions', filter: `session_id=eq.${sessionId}` }, debounced)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'qa_votes', filter: `session_id=eq.${sessionId}` }, debounced)
      .subscribe()
    const poll = setInterval(loadQa, 4000)
    return () => { clearTimeout(t); clearInterval(poll); supabase.removeChannel(ch) }
  }, [sessionId, hasQa, loadQa])

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
  const q = questions[idx]
  const isQa = q?.type === 'qa'
  // offene freigegebene Fragen, meiste Daumen zuerst, bei Gleichstand die ältere
  const qaItems = useMemo(() => {
    if (!isQa) return []
    const n = new Map()
    qaVotes.forEach((v) => n.set(v.qa_question_id, (n.get(v.qa_question_id) || 0) + 1))
    return qaRows.filter((r) => r.question_id === q.id && r.approved && !r.answered)
      .map((r) => ({ ...r, votes: n.get(r.id) || 0 }))
      .sort((a, b) => b.votes - a.votes || a.created_at.localeCompare(b.created_at))
  }, [isQa, q, qaRows, qaVotes])
  const qaAnswered = isQa ? qaRows.filter((r) => r.question_id === q.id && r.answered).length : 0
  const qaPending = useMemo(() => (isQa ? qaRows.filter((r) => r.question_id === q.id && !r.approved).sort((a, b) => a.created_at.localeCompare(b.created_at)) : []), [isQa, q, qaRows])
  const qaIndex = Math.max(0, qaItems.findIndex((r) => r.id === qaId))
  const setQaIndex = (i) => setQaId(qaItems[i]?.id ?? null)
  async function moderate(row, approve) {
    setErr('')
    const { error } = approve
      ? await supabase.from('qa_questions').update({ approved: true }).eq('id', row.id)
      : await supabase.from('qa_questions').delete().eq('id', row.id)
    if (error) return setErr(errorText(error))
    loadQa(); notify()
  }
  async function setAnswered(id, answered) {
    setErr('')
    setQaRows((rows) => rows.map((r) => (r.id === id ? { ...r, answered } : r)))
    const { error } = await supabase.from('qa_questions').update({ answered }).eq('id', id)
    if (error) { setErr(errorText(error)); loadQa(); return false }
    notify()
    return true
  }
  async function answer(it) {
    const i = qaItems.findIndex((r) => r.id === it.id)
    const next = qaItems[i + 1] || qaItems[i - 1]
    if (await setAnswered(it.id, true)) { setUndoStack((u) => [...u, it.id]); setQaId(next?.id ?? null) }
  }
  async function undoAnswer() {
    const id = undoStack[undoStack.length - 1]
    if (id && await setAnswered(id, false)) { setUndoStack((u) => u.slice(0, -1)); setQaId(id) }
  }
  const go = (d) => {
    const n = Math.min(Math.max(idx + d, 0), questions.length - 1)
    if (n !== idx) { setQaId(null); setUndoStack([]); setModerating(false); patch({ current_index: n }) }
  }
  const qaVisible = isQa && (session?.show_results || !live)
  const toggleResults = () => patch({ show_results: !session.show_results })
  async function reopen() {
    setErr('')
    const { data: code, error } = await supabase.rpc('reopen_session', { p_session: sessionId })
    if (error) return setErr(errorText(error))
    setSession((prev) => ({ ...prev, status: 'live', ended_at: null, code }))
  }
  const end = () => { if (confirm('Umfrage beenden? Schüler können danach nicht mehr abstimmen. Die Ergebnisse bleiben gespeichert.')) patch({ status: 'ended', ended_at: new Date().toISOString() }) }
  const fullscreen = () => (document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen?.())

  // Tastatur & Presenter-Fernbedienung
  const keyRef = useRef()
  keyRef.current = (e) => {
    if (!session || e.target.closest?.('input, textarea')) return
    if (['ArrowRight', 'PageDown', ' '].includes(e.key)) { e.preventDefault(); go(1) }
    else if (['ArrowLeft', 'PageUp'].includes(e.key)) { e.preventDefault(); go(-1) }
    // Q&A: ↑/↓ blättern durch die offenen Fragen, Eingabetaste markiert die gezeigte als beantwortet
    else if (qaVisible && e.key === 'ArrowDown') { e.preventDefault(); setQaIndex(Math.min(qaIndex + 1, qaItems.length - 1)) }
    else if (qaVisible && e.key === 'ArrowUp') { e.preventDefault(); setQaIndex(Math.max(qaIndex - 1, 0)) }
    else if (qaVisible && e.key === 'Enter' && !moderating) { e.preventDefault(); if (qaItems[qaIndex]) answer(qaItems[qaIndex]) }
    else if (e.key === 'r') toggleResults()
    else if (e.key === 'f') fullscreen()
    else if (e.key === 'q') setBigQr((v) => !v)
    else if (e.key === 'Escape') { setBigQr(false); setModerating(false) }
  }
  useEffect(() => {
    const h = (e) => keyRef.current(e)
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [])

  const answers = useMemo(() => responses.filter((r) => r.question_id === q?.id).map((r) => (r.participant_name ? { ...r.answer, _name: r.participant_name } : r.answer)), [responses, q])
  const participants = useMemo(() => new Set(responses.map((r) => r.participant_id)).size, [responses])
  const names = useMemo(() => [...new Set(responses.map((r) => r.participant_name).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'de')), [responses])

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
            <div className="muted small present-type">{QUESTION_TYPES[q.type].icon} {QUESTION_TYPES[q.type].label}</div>
            <h1>{q.prompt}</h1>
            {isQa && (session.show_results || !live)
              ? <QaStage items={qaItems} index={qaIndex} onIndex={setQaIndex} onAnswer={live ? answer : undefined}
                  onUndo={undoStack.length ? undoAnswer : undefined} answered={qaAnswered} showVotes={q.settings?.voting !== false} />
              : session.show_results || !live
                ? <Results question={q} answers={answers} />
                : <div className="empty-results"><div className="bounce">🙈</div><div>Ergebnisse sind verborgen – {isQa ? `${qaItems.length} Frage${qaItems.length === 1 ? '' : 'n'}` : `${answers.length} Antwort${answers.length === 1 ? '' : 'en'}`} eingegangen</div></div>}
          </>
        ) : <div className="empty-results">Diese Umfrage hat noch keine Fragen.</div>}
      </div>

      <div className="present-foot">
        <Link to="/dashboard" className="btn ghost small">← Übersicht</Link>
        {live && <span className="counter" title="Geräte, die gerade verbunden sind">👥 {online} online</span>}
        {isQa
          ? <span className="counter" title="Freigegebene Fragen aus dem Publikum">🙋 {qaItems.length} Fragen</span>
          : <span className="counter" title="Antworten auf diese Frage">✔ {answers.length} Antworten</span>}
        {isQa && (q.settings?.moderate || qaPending.length > 0) && (
          <button className={`btn small ${qaPending.length ? 'peach' : 'ghost'}`} onClick={() => setModerating(true)} title="Eingereichte Fragen freigeben oder ablehnen">
            ⏳ {qaPending.length} zur Freigabe
          </button>
        )}
        <span className="muted small" title={names.length ? `Mit Namen: ${names.join(', ')}` : 'Alle anonym'}>
          {participants} Teilnehmer insgesamt{names.length ? ` · ${names.length} mit Namen` : ''}
        </span>
        <div className="foot-center"><CornerLogo url={logoUrl} inline /></div>
        {err && <span className="alert small">{err}</span>}
        <button className="btn ghost" onClick={() => go(-1)} disabled={idx === 0} title="Vorherige Frage (←)">←</button>
        <span className="counter">{questions.length ? idx + 1 : 0} / {questions.length}</span>
        <button className="btn" onClick={() => go(1)} disabled={idx >= questions.length - 1} title="Nächste Frage (→ / Leertaste)">Nächste Frage →</button>
        {live && <button className="btn peach" onClick={toggleResults} title="Taste R">{session.show_results ? 'Ergebnisse verbergen' : 'Ergebnisse zeigen'}</button>}
        <button className="btn ghost" onClick={fullscreen} title="Vollbild (Taste F)">⛶</button>
        {live && <button className="btn danger" onClick={end}>Beenden</button>}
        {!live && <button className="btn mint" onClick={reopen} title="Schüler können wieder abstimmen; bisherige Antworten bleiben erhalten">↺ Wieder öffnen</button>}
      </div>

      {moderating && (
        <div className="qa-mod" onClick={(e) => { if (e.target === e.currentTarget) setModerating(false) }}>
          <div className="card stack">
            <div className="row spread">
              <h2 style={{ margin: 0 }}>Fragen zur Freigabe</h2>
              <button className="btn ghost small" onClick={() => setModerating(false)}>Schließen</button>
            </div>
            {!qaPending.length && <p className="muted" style={{ margin: 0 }}>Keine Fragen warten auf Freigabe.</p>}
            {qaPending.map((r) => (
              <div className="qa-mod-item" key={r.id}>
                <div className="grow">{r.text}</div>
                <button className="btn mint small" onClick={() => moderate(r, true)}>Freigeben</button>
                <button className="btn danger small" onClick={() => moderate(r, false)}>Ablehnen</button>
              </div>
            ))}
          </div>
        </div>
      )}

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
