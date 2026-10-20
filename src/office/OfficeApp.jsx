import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import QRCode from 'qrcode'
import { supabase, useAuth, errorText, joinUrl } from '../supabase'
import { useTheme } from '../themes'
import { QUESTION_TYPES } from '../questionTypes'
import Results from '../components/Results'
import Logo from '../components/Logo'
import { loadConfig, saveConfig, getActiveView, onActiveViewChanged, getCurrentSlideId } from './officeBridge'

const sessionKey = (pollId) => `klassenpuls.ppt.session.${pollId}`

export default function OfficeApp() {
  const auth = useAuth()
  const [config, setConfig] = useState(loadConfig)
  const [view, setView] = useState('edit')
  const [editing, setEditing] = useState(false)

  useEffect(() => {
    getActiveView().then(setView)
    return onActiveViewChanged(setView)
  }, [])

  if (auth.loading) return <div className="office-center muted">Lade …</div>
  if (!auth.session) return <OfficeLogin />
  if (!config || editing) {
    return <Configure initial={config} auth={auth} onDone={(c) => { setConfig(c); setEditing(false) }} onCancel={config ? () => setEditing(false) : null} />
  }
  return <SlideView config={config} view={view} auth={auth} onEdit={() => setEditing(true)} />
}

// ---------------------------------------------------------------- Anmeldung
function OfficeLogin() {
  useTheme(null)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  async function submit(e) {
    e.preventDefault(); setErr(''); setBusy(true)
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    setBusy(false)
    if (error) setErr(errorText(error))
  }
  return (
    <div className="office-center">
      <form className="card stack office-card" onSubmit={submit}>
        <div className="row"><Logo /><b>Klassenpuls für PowerPoint</b></div>
        <p className="muted small" style={{ margin: 0 }}>Melde dich einmal mit deinem Klassenpuls-Konto an. Die Anmeldung bleibt auf diesem Gerät gespeichert.</p>
        <label className="field"><span>E-Mail</span><input type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} /></label>
        <label className="field"><span>Passwort</span><input type="password" required autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} /></label>
        {err && <div className="alert">{err}</div>}
        <button className="btn" disabled={busy}>{busy ? '…' : 'Anmelden'}</button>
      </form>
    </div>
  )
}

// ---------------------------------------------------------------- Einrichten: Umfrage + Frage wählen
function Configure({ initial, auth, onDone, onCancel }) {
  useTheme(auth.profile?.theme)
  const [polls, setPolls] = useState(null)
  const [pollId, setPollId] = useState(initial?.pollId || '')
  const [questions, setQuestions] = useState([])
  const [questionId, setQuestionId] = useState(initial?.questionId || '')
  const [showJoin, setShowJoin] = useState(initial?.showJoin ?? true)
  const [err, setErr] = useState('')

  useEffect(() => {
    supabase.from('polls').select('id, title, owner_id').order('updated_at', { ascending: false })
      .then(({ data, error }) => { if (error) setErr(errorText(error)); setPolls(data || []) })
  }, [])

  useEffect(() => {
    if (!pollId) { setQuestions([]); return }
    supabase.from('questions').select('id, type, prompt').eq('poll_id', pollId).order('position').order('id')
      .then(({ data }) => {
        setQuestions(data || [])
        if (!data?.some((q) => q.id === questionId)) setQuestionId(data?.[0]?.id || '')
      })
  }, [pollId]) // eslint-disable-line react-hooks/exhaustive-deps

  async function apply() {
    setErr('')
    if (!pollId || !questionId) return setErr('Bitte Umfrage und Frage wählen.')
    const slideId = await getCurrentSlideId()
    const config = { pollId, questionId, showJoin, slideId }
    try { await saveConfig(config); onDone(config) } catch (e) { setErr(errorText(e)) }
  }

  const mine = (polls || []).filter((p) => p.owner_id === auth.session.user.id)
  const shared = (polls || []).filter((p) => p.owner_id !== auth.session.user.id)

  return (
    <div className="office-center">
      <div className="card stack office-card">
        <div className="row spread"><div className="row"><Logo /><b>Klassenpuls auf dieser Folie</b></div>
          <button className="btn ghost small" onClick={() => supabase.auth.signOut()}>Abmelden</button></div>
        {polls === null ? <p className="muted">Lade Umfragen …</p> : (
          <>
            <label className="field"><span>Umfrage</span>
              <select value={pollId} onChange={(e) => setPollId(e.target.value)}>
                <option value="">– bitte wählen –</option>
                {mine.length > 0 && <optgroup label="Meine Umfragen">{mine.map((p) => <option key={p.id} value={p.id}>{p.title}</option>)}</optgroup>}
                {shared.length > 0 && <optgroup label="Von Kollegen geteilt">{shared.map((p) => <option key={p.id} value={p.id}>{p.title}</option>)}</optgroup>}
              </select>
            </label>
            {pollId && (
              <label className="field"><span>Frage auf dieser Folie</span>
                <select value={questionId} onChange={(e) => setQuestionId(e.target.value)}>
                  {questions.map((q, i) => <option key={q.id} value={q.id}>{i + 1}. {q.prompt}</option>)}
                </select>
              </label>
            )}
            <label className="row small" style={{ fontWeight: 600 }}>
              <input type="checkbox" checked={showJoin} onChange={(e) => setShowJoin(e.target.checked)} />
              Code und QR-Code zum Mitmachen auf dieser Folie zeigen
            </label>
            <p className="muted small" style={{ margin: 0 }}>
              Tipp: Für die nächste Frage die Folie duplizieren und hier die Frage umstellen.
              In der Bildschirmpräsentation schaltet die Abstimmung beim Folienwechsel automatisch mit.
            </p>
          </>
        )}
        {err && <div className="alert">{err}</div>}
        <div className="row">
          <button className="btn mint" onClick={apply} disabled={!questionId}>Auf Folie übernehmen</button>
          {onCancel && <button className="btn ghost" onClick={onCancel}>Abbrechen</button>}
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------- Folie: Frage + Live-Ergebnisse
function SlideView({ config, view, auth, onEdit }) {
  const [poll, setPoll] = useState(null)
  const [questions, setQuestions] = useState([])
  const [session, setSession] = useState(null)
  const [responses, setResponses] = useState([])
  const [qr, setQr] = useState('')
  const [status, setStatus] = useState('')
  const channelRef = useRef(null)
  const activeRef = useRef(false)
  useTheme(poll?.theme || auth.profile?.theme)

  // Umfrage und Fragen laden
  useEffect(() => {
    let alive = true
    Promise.all([
      supabase.from('polls').select('id, title, theme').eq('id', config.pollId).maybeSingle(),
      supabase.from('questions').select('*').eq('poll_id', config.pollId).order('position').order('id'),
    ]).then(([p, q]) => {
      if (!alive) return
      if (!p.data) setStatus('Die Umfrage wurde nicht gefunden. Klicke auf ⚙, um eine andere zu wählen.')
      setPoll(p.data); setQuestions(q.data || [])
    })
    return () => { alive = false }
  }, [config.pollId])

  const index = questions.findIndex((q) => q.id === config.questionId)
  const question = index >= 0 ? questions[index] : null

  // vorhandenen laufenden Durchlauf finden (in der Präsentation bei Bedarf neu starten)
  const ensureSession = useCallback(async (create) => {
    const uid = auth.session.user.id
    const remembered = localStorage.getItem(sessionKey(config.pollId))
    if (remembered) {
      const { data } = await supabase.from('sessions').select('*').eq('id', remembered).maybeSingle()
      if (data?.status === 'live') return data
    }
    const { data: live } = await supabase.from('sessions').select('*')
      .eq('poll_id', config.pollId).eq('owner_id', uid).eq('status', 'live')
      .order('created_at', { ascending: false }).limit(1)
    if (live?.[0]) { localStorage.setItem(sessionKey(config.pollId), live[0].id); return live[0] }
    if (!create) return null
    const label = `PowerPoint ${new Date().toLocaleDateString('de-DE')}`
    const { data, error } = await supabase.from('sessions').insert({ poll_id: config.pollId, label }).select().single()
    if (error) { setStatus(errorText(error)); return null }
    localStorage.setItem(sessionKey(config.pollId), data.id)
    return data
  }, [auth.session.user.id, config.pollId])

  useEffect(() => {
    let alive = true
    ensureSession(false).then((s) => { if (alive && s) setSession(s) })
    return () => { alive = false }
  }, [ensureSession])

  // diese Folie zur aktiven Frage machen
  // liefert true, wenn die Frage dieser Folie jetzt aktiv ist
  const activate = useCallback(async () => {
    if (index < 0) return false // Fragen noch nicht geladen → später erneut versuchen
    const s = session?.status === 'live' ? session : await ensureSession(true)
    if (!s) return false
    if (s.current_index !== index) {
      const { error } = await supabase.from('sessions').update({ current_index: index }).eq('id', s.id)
      if (error) { setStatus(errorText(error)); return false }
    }
    setSession({ ...s, current_index: index })
    channelRef.current?.send({ type: 'broadcast', event: 'state', payload: {} })
    return true
  }, [index, session, ensureSession])

  const activateRef = useRef(activate)
  activateRef.current = activate

  // In der Bildschirmpräsentation: aktivieren, sobald genau diese Folie gezeigt wird
  useEffect(() => {
    if (view !== 'read') { activeRef.current = false; return }
    let stop = false
    let timer = null
    ;(async () => {
      const first = await getCurrentSlideId()
      if (first && config.slideId) {
        // PowerPoint verrät die gezeigte Folie → nur aktivieren, wenn es unsere ist
        const check = async () => {
          if (stop) return
          const current = await getCurrentSlideId()
          const mineNow = current === config.slideId
          if (mineNow && !activeRef.current) activeRef.current = await activateRef.current()
          if (!mineNow) activeRef.current = false
          timer = setTimeout(check, 1200)
        }
        check()
      } else {
        // Ersatz: aktivieren, wenn das Add-in sichtbar wird
        // (wiederholt, bis die Fragen geladen sind und die Aktivierung geklappt hat)
        let retry = null
        const tryActivate = async () => {
          if (stop || document.visibilityState !== 'visible') return
          if (!(await activateRef.current())) retry = setTimeout(tryActivate, 1000)
        }
        const onVisible = () => { clearTimeout(retry); tryActivate() }
        tryActivate()
        document.addEventListener('visibilitychange', onVisible)
        timer = { off: () => { clearTimeout(retry); document.removeEventListener('visibilitychange', onVisible) } }
      }
    })()
    return () => { stop = true; if (timer?.off) timer.off(); else clearTimeout(timer) }
  }, [view, config.slideId])

  // Live-Antworten + Kanal zu den Schülern
  const loadResponses = useCallback(async () => {
    if (!session?.id) return
    const { data } = await supabase.from('responses').select('question_id, answer, participant_name').eq('session_id', session.id)
    if (data) setResponses(data)
  }, [session?.id])

  useEffect(() => {
    if (!session?.id) return
    loadResponses()
    let t
    const ch = supabase.channel(`ppt-responses-${session.id}-${config.questionId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'responses', filter: `session_id=eq.${session.id}` }, () => { clearTimeout(t); t = setTimeout(loadResponses, 250) })
      .subscribe()
    const live = supabase.channel(`live-${session.code}`)
    live.subscribe()
    channelRef.current = live
    const poll = setInterval(loadResponses, 5000)
    return () => { clearTimeout(t); clearInterval(poll); supabase.removeChannel(ch); supabase.removeChannel(live); channelRef.current = null }
  }, [session?.id, session?.code, config.questionId, loadResponses])

  useEffect(() => {
    if (!session?.code) { setQr(''); return }
    QRCode.toDataURL(joinUrl(session.code), { width: 480, margin: 1, color: { dark: '#2d2e33', light: '#ffffff' } }).then(setQr)
  }, [session?.code])

  const answers = useMemo(() => responses.filter((r) => r.question_id === question?.id)
    .map((r) => (r.participant_name ? { ...r.answer, _name: r.participant_name } : r.answer)), [responses, question])

  const joinAddress = joinUrl('000000').replace(/^https?:\/\//, '').replace(/#\/j\/\d+$/, '')

  return (
    <div className="office-slide">
      {view === 'edit' && <button className="office-gear btn ghost small" onClick={onEdit} title="Umfrage oder Frage ändern">⚙ Ändern</button>}
      {config.showJoin && (
        <div className="office-join">
          {session?.code
            ? <>{qr && <img src={qr} alt="QR-Code zum Mitmachen" />}<div><div className="small muted">Mitmachen auf <b>{joinAddress}</b></div><div className="code">{session.code.replace(/(\d{3})(\d{3})/, '$1 $2')}</div></div></>
            : <span className="muted small">Code und QR-Code erscheinen in der Bildschirmpräsentation.</span>}
        </div>
      )}
      {question ? (
        <div className="office-main">
          <div className="muted small present-type">{QUESTION_TYPES[question.type].icon} {QUESTION_TYPES[question.type].label} · Frage {index + 1} von {questions.length}</div>
          <h1>{question.prompt}</h1>
          {session ? <Results question={question} answers={answers} /> : (
            <div className="empty-results">{view === 'read' ? 'Starte …' : 'Vorschau – die Live-Ergebnisse erscheinen in der Bildschirmpräsentation.'}</div>
          )}
        </div>
      ) : (
        <div className="office-center muted">{status || (poll ? 'Diese Frage gibt es nicht mehr. Klicke auf ⚙, um eine andere zu wählen.' : 'Lade …')}</div>
      )}
      {status && question && <div className="alert small office-status">{status}</div>}
    </div>
  )
}
