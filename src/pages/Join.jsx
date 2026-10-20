import { useCallback, useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { supabase, participantId, errorText } from '../supabase'
import { pastel } from '../components/Results'
import Logo from '../components/Logo'
import CroppedImage from '../components/CroppedImage'

const answeredKey = (sid) => `klassenpuls.answered.${sid}`
function loadAnswered(sid) {
  try { return JSON.parse(localStorage.getItem(answeredKey(sid)) || '{}') } catch { return {} }
}
function saveAnswered(sid, map) {
  try { localStorage.setItem(answeredKey(sid), JSON.stringify(map)) } catch { /* privater Modus */ }
}

export default function Join() {
  const { code } = useParams()
  const [state, setState] = useState(undefined) // undefined = lädt, null = nicht gefunden
  const [answered, setAnswered] = useState({})
  const [editing, setEditing] = useState(false)

  const refresh = useCallback(async () => {
    const { data, error } = await supabase.rpc('get_live_state', { p_code: code })
    if (error) return
    setState((prev) => {
      if (prev?.question?.id !== data?.question?.id) setEditing(false)
      return data
    })
    if (data) setAnswered(loadAnswered(data.session_id))
  }, [code])

  useEffect(() => {
    refresh()
    const ch = supabase.channel(`live-${code}`, { config: { presence: { key: participantId(), enabled: true } } })
    ch.on('broadcast', { event: 'state' }, refresh)
      .on('presence', { event: 'sync' }, () => {})
      .subscribe((status) => { if (status === 'SUBSCRIBED') ch.track({ at: Date.now() }) })
    const t = setInterval(refresh, 4000)
    const onVis = () => { if (document.visibilityState === 'visible') refresh() }
    document.addEventListener('visibilitychange', onVis)
    return () => { clearInterval(t); document.removeEventListener('visibilitychange', onVis); supabase.removeChannel(ch) }
  }, [code, refresh])

  const markAnswered = (answer) => {
    const next = { ...answered, [state.question.id]: answer }
    setAnswered(next); saveAnswered(state.session_id, next); setEditing(false)
  }

  if (state === undefined) return <Shell><div className="waiting muted">Verbinde …</div></Shell>
  if (state === null) {
    return (
      <Shell>
        <div className="card center stack">
          <div style={{ fontSize: '3rem' }}>🔍</div>
          <h2>Keine aktive Umfrage</h2>
          <p className="muted">Zum Code <b>{code}</b> läuft gerade keine Umfrage. Vielleicht ist sie schon beendet?</p>
          <Link className="btn" to="/">Anderen Code eingeben</Link>
        </div>
      </Shell>
    )
  }

  const q = state.question
  const prev = q && answered[q.id]

  return (
    <Shell title={state.title}>
      {!q ? (
        <div className="waiting"><div className="bounce">⏳</div><p className="muted">Gleich geht’s los …</p></div>
      ) : prev && !editing ? (
        <div className="card center stack">
          <div style={{ fontSize: '3rem' }}>🎉</div>
          <h2>Danke für deine Antwort!</h2>
          <p className="muted">Schau nach vorne – gleich kommt die nächste Frage.</p>
          <button className="btn ghost small" style={{ margin: '0 auto' }} onClick={() => setEditing(true)}>Antwort ändern</button>
        </div>
      ) : (
        <QuestionForm key={q.id} q={q} code={code} initial={prev} onDone={markAnswered} />
      )}
      <p className="center muted small" style={{ marginTop: 18 }}>Frage {Math.min(state.current_index + 1, state.total)} von {state.total}</p>
    </Shell>
  )
}

function Shell({ title, children }) {
  return (
    <div className="student">
      <div className="row" style={{ marginBottom: 18 }}><Logo /><b className="grow">{title || 'Klassenpuls'}</b></div>
      {children}
    </div>
  )
}

function QuestionForm({ q, code, initial, onDone }) {
  const [answer, setAnswer] = useState(() => initial || initialAnswer(q))
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  const ready =
    q.type === 'multiple_choice' ? answer.choices.length > 0
      : q.type === 'ranking' ? answer.order.length === q.options.length
        : q.type === 'open' ? answer.text.trim().length > 0
          : q.type === 'pin' ? answer.x != null
            : true

  async function send() {
    setBusy(true); setErr('')
    const { error } = await supabase.rpc('submit_response', { p_code: code, p_question_id: q.id, p_participant: participantId(), p_answer: answer })
    setBusy(false)
    if (error) return setErr(errorText(error))
    onDone(answer)
  }

  return (
    <div className="card stack">
      <h2>{q.prompt}</h2>
      {q.type === 'multiple_choice' && <ChoiceInput q={q} value={answer} onChange={setAnswer} />}
      {q.type === 'ranking' && <RankingInput q={q} value={answer} onChange={setAnswer} />}
      {q.type === 'scale' && <ScaleInput q={q} value={answer} onChange={setAnswer} />}
      {q.type === 'pin' && <PinInput q={q} value={answer} onChange={setAnswer} />}
      {q.type === 'open' && (
        <div>
          <textarea maxLength={200} autoFocus placeholder={q.settings?.display === 'cloud' ? 'Ein oder wenige Wörter …' : 'Deine Antwort …'} value={answer.text} onChange={(e) => setAnswer({ text: e.target.value })} />
          <div className="small muted" style={{ textAlign: 'right' }}>{answer.text.length}/200</div>
        </div>
      )}
      {err && <div className="alert">{err}</div>}
      <button className="btn big mint" style={{ width: '100%', justifyContent: 'center' }} disabled={!ready || busy} onClick={send}>{busy ? 'Sende …' : 'Absenden'}</button>
    </div>
  )
}

function initialAnswer(q) {
  if (q.type === 'multiple_choice') return { choices: [] }
  if (q.type === 'ranking') return { order: [] }
  if (q.type === 'pin') return { x: null, y: null }
  if (q.type === 'scale') {
    const min = +(q.settings?.min ?? 1), max = +(q.settings?.max ?? 5)
    return { values: q.options.map(() => Math.round((min + max) / 2)) }
  }
  return { text: '' }
}

function ChoiceInput({ q, value, onChange }) {
  const multi = !!q.settings?.multiple
  const toggle = (i) => {
    const has = value.choices.includes(i)
    if (multi) onChange({ choices: has ? value.choices.filter((c) => c !== i) : [...value.choices, i] })
    else onChange({ choices: [i] })
  }
  return (
    <div>
      {multi && <p className="muted small" style={{ marginTop: 0 }}>Mehrere Antworten möglich</p>}
      {q.options.map((opt, i) => {
        const sel = value.choices.includes(i)
        return (
          <button key={i} className={`choice ${sel ? 'sel' : ''}`} style={{ background: pastel(i) }} onClick={() => toggle(i)}>
            <span className="dot">{sel ? '✓' : ''}</span>{opt}
          </button>
        )
      })}
    </div>
  )
}

function RankingInput({ q, value, onChange }) {
  const order = value.order
  const rest = q.options.map((_, i) => i).filter((i) => !order.includes(i))
  const move = (pos, d) => {
    const next = [...order]; const j = pos + d
    if (j < 0 || j >= next.length) return
    ;[next[pos], next[j]] = [next[j], next[pos]]
    onChange({ order: next })
  }
  return (
    <div>
      <p className="muted small" style={{ marginTop: 0 }}>Tippe die Punkte in deiner Reihenfolge an – das Wichtigste zuerst.</p>
      {order.map((opt, pos) => (
        <div className="rank-item" key={opt} style={{ background: pastel(opt) }}>
          <span className="num">{pos + 1}</span>
          <span className="grow">{q.options[opt]}</span>
          <button className="btn ghost icon small" onClick={() => move(pos, -1)} disabled={pos === 0} aria-label="nach oben">↑</button>
          <button className="btn ghost icon small" onClick={() => move(pos, 1)} disabled={pos === order.length - 1} aria-label="nach unten">↓</button>
          <button className="btn ghost icon small" onClick={() => onChange({ order: order.filter((o) => o !== opt) })} aria-label="entfernen">✕</button>
        </div>
      ))}
      {rest.length > 0 && order.length > 0 && <hr style={{ border: 0, borderTop: '2px dashed var(--line)', margin: '14px 0' }} />}
      {rest.map((opt) => (
        <button key={opt} className="choice" style={{ background: '#f3f1f1', fontWeight: 600 }} onClick={() => onChange({ order: [...order, opt] })}>
          <span className="dot" style={{ background: pastel(opt) }}>＋</span>{q.options[opt]}
        </button>
      ))}
    </div>
  )
}

function ScaleInput({ q, value, onChange }) {
  const min = +(q.settings?.min ?? 1), max = +(q.settings?.max ?? 5)
  return (
    <div>
      {q.options.map((stmt, i) => (
        <div key={i} style={{ marginBottom: 22 }}>
          <div className="row spread"><b>{stmt}</b><span className="pill" style={{ fontSize: '1rem', background: pastel(i) }}>{value.values[i]}</span></div>
          <input type="range" min={min} max={max} step={1} value={value.values[i]}
            onChange={(e) => onChange({ values: value.values.map((v, j) => (j === i ? +e.target.value : v)) })} />
          <div className="scale-ends small"><span>{q.settings?.minLabel}</span><span>{q.settings?.maxLabel}</span></div>
        </div>
      ))}
    </div>
  )
}

function PinInput({ q, value, onChange }) {
  const url = q.settings?.image_url
  function place(e) {
    const r = e.currentTarget.getBoundingClientRect()
    const x = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width))
    const y = Math.min(1, Math.max(0, (e.clientY - r.top) / r.height))
    onChange({ x: Math.round(x * 10000) / 10000, y: Math.round(y * 10000) / 10000 })
  }
  if (!url) return <div className="alert">Für diese Frage fehlt das Bild.</div>
  return (
    <div>
      <p className="muted small" style={{ marginTop: 0, minHeight: '2.8em' }}>{value.x == null ? 'Tippe auf die passende Stelle im Bild.' : 'Pin gesetzt – tippe woanders hin, um ihn zu versetzen.'}</p>
      <div style={{ width: `${q.settings?.student_width || 100}%`, margin: '0 auto' }}>
      <CroppedImage url={url} crop={q.settings?.crop} dims={{ w: q.settings?.image_w, h: q.settings?.image_h }}
        className="pin-input" onClick={place} role="button" aria-label="Pin auf das Bild setzen">
        {value.x != null && (
          <svg className="pin-mine" viewBox="0 0 24 24" style={{ left: `${value.x * 100}%`, top: `${value.y * 100}%` }}>
            <path d="M12 0C7 0 3 4 3 9c0 6.5 9 15 9 15s9-8.5 9-15c0-5-4-9-9-9z" fill="#942838" />
            <circle cx="12" cy="9" r="3.6" fill="#fff" />
          </svg>
        )}
      </CroppedImage>
      </div>
    </div>
  )
}
