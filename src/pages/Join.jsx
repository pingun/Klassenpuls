import { useCallback, useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { supabase, participantId, errorText, getParticipantName, setParticipantName } from '../supabase'
import NameField from '../components/NameField'
import CornerLogo, { useLogoUrl } from '../components/CornerLogo'
import { useTheme, inkOn } from '../themes'
import { pastel, QaList } from '../components/Results'
import Logo from '../components/Logo'
import CroppedImage from '../components/CroppedImage'
import { nameUsage, QUESTION_TYPES } from '../questionTypes'

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
  useTheme(state?.theme)

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
    <Shell title={state.title} logo={state.logo_url ?? null} nameHint={nameUsage(q)}>
      {!q ? (
        <div className="waiting"><div className="bounce">⏳</div><p className="muted">Gleich geht’s los …</p></div>
      ) : !QUESTION_TYPES[q.type] ? (
        <Outdated type={q.type} />
      ) : q.type === 'qa' ? (
        <QaParticipant key={q.id} q={q} code={code} tick={state} />
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

function Shell({ title, logo, nameHint, children }) {
  const fallback = useLogoUrl(null)
  return (
    <div className="student">
      <div className="row" style={{ marginBottom: 12 }}><Logo /><b className="grow">{title || 'Klassenpuls'}</b></div>
      {title && nameHint && <NameBar hint={nameHint} />}
      {children}
      <CornerLogo url={logo !== undefined ? logo : fallback} />
    </div>
  )
}

// Fragetyp unbekannt = auf dem Gerät läuft noch eine ältere App-Version (Seite vor dem Update geöffnet
// oder aus dem Cache geladen). Einmal automatisch neu laden, sonst Knopf anbieten.
function Outdated({ type }) {
  useEffect(() => {
    try {
      if (sessionStorage.getItem('klassenpuls.reloaded') === type) return
      sessionStorage.setItem('klassenpuls.reloaded', type)
    } catch { return }
    window.location.reload()
  }, [type])
  return (
    <div className="card center stack">
      <div style={{ fontSize: '3rem' }}>🔄</div>
      <h2>Neue Version verfügbar</h2>
      <p className="muted">Diese Frage braucht die neueste Version von Klassenpuls. Bitte lade die Seite neu.</p>
      <button className="btn big mint" style={{ margin: '0 auto' }} onClick={() => window.location.reload()}>Seite neu laden</button>
    </div>
  )
}

// Q&A: eigene Fragen einreichen, alle Fragen untereinander sehen und mit Daumen hoch bewerten
function QaParticipant({ q, code, tick }) {
  const voting = q.settings?.voting !== false
  const moderated = !!q.settings?.moderate
  const [list, setList] = useState([])
  const [writing, setWriting] = useState(false)
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [sent, setSent] = useState(false)

  const load = useCallback(async () => {
    const { data, error } = await supabase.rpc('get_qa_questions', { p_code: code, p_question_id: q.id, p_participant: participantId() })
    if (!error && data) setList(data)
  }, [code, q.id])
  useEffect(() => { load() }, [load, tick]) // tick = jeder Live-Abgleich (alle 4 s und bei Freigaben)

  // Server liefert: freigegebene Fragen (wenn Bewerten an) + eigene; offene vor beantworteten, meiste Daumen zuerst
  const visible = voting ? list : []
  const mine = voting ? [] : list

  async function send() {
    setBusy(true); setErr('')
    const { error } = await supabase.rpc('submit_qa_question', { p_code: code, p_question_id: q.id, p_participant: participantId(), p_text: text })
    setBusy(false)
    if (error) return setErr(errorText(error))
    setText(''); setWriting(false); setSent(true); load()
  }
  async function vote(it) {
    setErr('')
    setList((l) => l.map((x) => (x.id === it.id ? { ...x, voted: !x.voted, votes: x.votes + (x.voted ? -1 : 1) } : x)))
    const { error } = await supabase.rpc('toggle_qa_vote', { p_code: code, p_question_id: q.id, p_participant: participantId(), p_qa: it.id })
    if (error) setErr(errorText(error))
    load()
  }

  return (
    <div className="card stack">
      <h2 style={{ marginBottom: 0 }}>Fragen und Antworten</h2>
      <p className="muted" style={{ margin: 0 }}>
        Haben Sie eine Frage an den Referenten?{!visible.length && !mine.length && ' Stellen Sie als Erster eine Frage!'}
      </p>
      {writing ? (
        <div className="stack">
          <textarea maxLength={300} autoFocus placeholder="Ihre Frage …" value={text} onChange={(e) => setText(e.target.value)} />
          <div className="small muted" style={{ textAlign: 'right', marginTop: -8 }}>{text.length}/300</div>
          <div className="row">
            <button className="btn mint grow" style={{ justifyContent: 'center' }} disabled={busy || !text.trim()} onClick={send}>{busy ? 'Sende …' : 'Abschicken'}</button>
            <button className="btn ghost" onClick={() => { setWriting(false); setErr('') }}>Abbrechen</button>
          </div>
        </div>
      ) : (
        <button className="btn big" style={{ width: '100%', justifyContent: 'center' }} onClick={() => { setWriting(true); setSent(false) }}>Frage stellen</button>
      )}
      {sent && !writing && <div className="alert ok">Danke! Ihre Frage wurde eingereicht.{moderated ? ' Sie erscheint, sobald sie freigegeben wurde.' : ''}</div>}
      {err && <div className="alert">{err}</div>}
      {visible.length > 0 && <QaList items={visible} onVote={vote} />}
      {mine.length > 0 && (
        <div className="stack" style={{ gap: 8 }}>
          <b className="small">Ihre Fragen</b>
          <QaList items={mine} showVotes={false} />
        </div>
      )}
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
            : q.type === 'matrix' ? answer.values.some(Array.isArray)
              : true

  async function send() {
    setBusy(true); setErr('')
    // 4-Felder: übersprungene und nicht bewegte Items werden als null gesendet
    const payload = q.type === 'matrix' ? { values: answer.values.map((v) => (Array.isArray(v) ? v : null)) } : answer
    const { error } = await supabase.rpc('submit_response', { p_code: code, p_question_id: q.id, p_participant: participantId(), p_answer: payload, p_name: (nameUsage(q) && getParticipantName()) || null })
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
      {q.type === 'matrix' && <MatrixInput q={q} value={answer} onChange={setAnswer} />}
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
  if (q.type === 'matrix') return { values: q.options.map(() => null) }
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
        <button key={opt} className="choice" style={{ background: 'var(--muted-bg)', color: 'var(--ink)', fontWeight: 600 }} onClick={() => onChange({ order: [...order, opt] })}>
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
            <path d="M12 0C7 0 3 4 3 9c0 6.5 9 15 9 15s9-8.5 9-15c0-5-4-9-9-9z" style={{ fill: 'var(--brand)' }} />
            <circle cx="12" cy="9" r="3.6" fill="#fff" />
          </svg>
        )}
      </CroppedImage>
      </div>
    </div>
  )
}

// Kleine Leiste: anonym oder mit (freiwilligem) Namen teilnehmen
function NameBar({ hint }) {
  const [name, setName] = useState(getParticipantName)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(name)
  if (editing) {
    return (
      <form className="card name-bar-edit" onSubmit={(e) => { e.preventDefault(); setName(setParticipantName(draft)); setEditing(false) }}>
        <NameField value={draft} onChange={setDraft} autoFocus hint={hint} />
        <div className="row">
          <button className="btn small">Übernehmen</button>
          <button type="button" className="btn ghost small" onClick={() => { setDraft(name); setEditing(false) }}>Abbrechen</button>
        </div>
      </form>
    )
  }
  return (
    <div className="name-bar">
      {name
        ? <>Du nimmst teil als <b>{name}</b> · <button onClick={() => { setDraft(name); setEditing(true) }}>ändern</button></>
        : <>Du nimmst <b>anonym</b> teil · <button onClick={() => { setDraft(''); setEditing(true) }}>Namen angeben (freiwillig)</button></>}
    </div>
  )
}

// 4-Felder: je Item zwei Regler (1–10) und „Überspringen“.
// Wert je Item: null = noch nicht bewegt, 'skip' = übersprungen, [x, y] = bewertet
function MatrixInput({ q, value, onChange }) {
  const colors = q.settings?.colors || []
  const vals = value.values
  const setItem = (i, v) => onChange({ values: vals.map((x, j) => (j === i ? v : x)) })
  const move = (i, axis, n) => {
    const cur = Array.isArray(vals[i]) ? vals[i] : [5, 5]
    setItem(i, axis === 0 ? [n, cur[1]] : [cur[0], n])
  }
  const rated = vals.filter(Array.isArray).length
  return (
    <div className="stack">
      <p className="muted small" style={{ margin: 0 }}>
        Bewerte jedes Item auf beiden Reglern von 1 bis 10. Items, die du nicht bewegst oder auslässt, zählen nicht.
      </p>
      {q.options.map((item, i) => {
        const v = vals[i]
        const skipped = v === 'skip'
        const touched = Array.isArray(v)
        return (
          <div key={i} className={`matrix-item ${skipped ? 'skipped' : ''}`}>
            <div className="row spread" style={{ flexWrap: 'nowrap' }}>
              <div className="row" style={{ gap: 10, flexWrap: 'nowrap', minWidth: 0 }}>
                <span className="matrix-dot" style={{ background: colors[i] || 'var(--s1)', color: colors[i] ? inkOn(colors[i]) : '#fff' }}>{i + 1}</span>
                <b className="matrix-name">{item}</b>
              </div>
              <button className="btn ghost small matrix-skip" onClick={() => setItem(i, skipped ? null : 'skip')}>
                {skipped ? 'Bewerten' : 'Auslassen'}
              </button>
            </div>
            {!skipped && [q.settings?.xLabel, q.settings?.yLabel].map((label, axis) => (
              <div key={axis} className={`matrix-slider ${touched ? '' : 'untouched'}`}>
                <div className="row spread small"><span>{label}</span><b>{touched ? v[axis] : '–'}</b></div>
                <div className="row" style={{ gap: 8, flexWrap: 'nowrap' }}>
                  <span className="muted small">1</span>
                  <input type="range" min="1" max="10" step="1" value={touched ? v[axis] : 5}
                    onChange={(e) => move(i, axis, +e.target.value)} onClick={(e) => move(i, axis, +e.target.value)}
                    style={{ accentColor: colors[i] || 'var(--brand)' }} aria-label={`${item}: ${label}`} />
                  <span className="muted small">10</span>
                </div>
              </div>
            ))}
          </div>
        )
      })}
      <p className="muted small center" style={{ margin: 0 }}>{rated} von {q.options.length} Items bewertet</p>
    </div>
  )
}
