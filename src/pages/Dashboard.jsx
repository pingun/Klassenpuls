import { useEffect, useState, useCallback } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase, errorText } from '../supabase'
import { TEMPLATES } from '../questionTypes'
import StartButton from '../components/StartButton'

export async function createPoll(template, ownerId) {
  const { data: poll, error } = await supabase.from('polls')
    .insert({ title: template?.title || 'Neue Umfrage', description: template?.description || null, hide_logo: !!template?.hide_logo, owner_id: ownerId })
    .select().single()
  if (error) throw error
  if (template?.questions?.length) {
    const { error: e2 } = await supabase.from('questions').insert(
      template.questions.map((q, i) => ({ poll_id: poll.id, position: i, type: q.type, prompt: q.prompt, options: q.options, settings: q.settings })),
    )
    if (e2) throw e2
  }
  return poll
}

export default function Dashboard({ auth }) {
  const nav = useNavigate()
  const uid = auth.session.user.id
  const [polls, setPolls] = useState([])
  const [sessions, setSessions] = useState([])
  const [tab, setTab] = useState('mine')
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState('')

  const load = useCallback(async () => {
    const [p, s] = await Promise.all([
      supabase.from('polls').select('id, title, description, is_shared, hide_logo, owner_id, updated_at, questions(count)').order('updated_at', { ascending: false }),
      supabase.from('sessions').select('id, label, code, status, created_at, poll_id, polls(title), responses(count)').order('created_at', { ascending: false }).limit(100),
    ])
    if (p.error || s.error) setErr(errorText(p.error || s.error))
    setPolls(p.data || [])
    setSessions(s.data || [])
    setLoading(false)
  }, [])
  useEffect(() => { load() }, [load])

  async function newPoll(template) {
    try {
      const poll = await createPoll(template, uid)
      nav(`/poll/${poll.id}`)
    } catch (e) { setErr(errorText(e)) }
  }

  async function duplicate(poll) {
    const { data: qs, error } = await supabase.from('questions').select('*').eq('poll_id', poll.id).order('position')
    if (error) return setErr(errorText(error))
    try {
      const copy = await createPoll({ title: poll.owner_id === uid ? `${poll.title} (Kopie)` : poll.title, description: poll.description, hide_logo: poll.hide_logo, questions: qs }, uid)
      nav(`/poll/${copy.id}`)
    } catch (e) { setErr(errorText(e)) }
  }

  async function removePoll(poll) {
    if (!confirm(`„${poll.title}“ mit allen Durchläufen und Ergebnissen löschen?`)) return
    const { error } = await supabase.from('polls').delete().eq('id', poll.id)
    if (error) setErr(errorText(error)); else load()
  }

  async function removeSession(s) {
    if (!confirm('Diesen Durchlauf und seine Ergebnisse löschen?')) return
    const { error } = await supabase.from('sessions').delete().eq('id', s.id)
    if (error) setErr(errorText(error)); else load()
  }

  const mine = polls.filter((p) => p.owner_id === uid)
  const shared = polls.filter((p) => p.owner_id !== uid)
  const list = tab === 'mine' ? mine : shared

  return (
    <div className="container stack">
      <div className="row spread">
        <h1 style={{ margin: 0 }}>Meine Umfragen</h1>
        <button className="btn big" onClick={() => newPoll(null)}>＋ Neue Umfrage</button>
      </div>
      {err && <div className="alert">{err}</div>}

      <div className="card">
        <h3>Mit einer Vorlage starten</h3>
        <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))' }}>
          {TEMPLATES.map((t, i) => (
            <button key={t.key} className="btn ghost" style={{ borderRadius: 16, textAlign: 'left', display: 'block', padding: 16, background: i ? 'var(--accent-soft)' : 'var(--brand-soft)' }} onClick={() => newPoll(t)}>
              <b>{t.title}</b>
              <div className="muted small" style={{ fontWeight: 600 }}>{t.description} · {t.questions.length} Fragen</div>
            </button>
          ))}
        </div>
      </div>

      <div className="tabs">
        <button className={tab === 'mine' ? 'on' : ''} onClick={() => setTab('mine')}>Eigene ({mine.length})</button>
        <button className={tab === 'shared' ? 'on' : ''} onClick={() => setTab('shared')}>Von Kollegen geteilt ({shared.length})</button>
        <button className={tab === 'runs' ? 'on' : ''} onClick={() => setTab('runs')}>Durchläufe &amp; Ergebnisse ({sessions.length})</button>
      </div>

      {loading ? <p className="muted">Lade …</p> : tab === 'runs' ? (
        <div className="card">
          {!sessions.length ? <p className="muted">Noch keine Durchläufe. Starte eine Umfrage, um sie live zu zeigen.</p> : (
            <table className="simple">
              <thead><tr><th>Umfrage</th><th>Klasse / Anlass</th><th>Datum</th><th>Antworten</th><th>Status</th><th></th></tr></thead>
              <tbody>
                {sessions.map((s) => (
                  <tr key={s.id}>
                    <td><b>{s.polls?.title}</b></td>
                    <td>{s.label || <span className="muted">–</span>}</td>
                    <td className="small">{new Date(s.created_at).toLocaleString('de-DE', { dateStyle: 'short', timeStyle: 'short' })}</td>
                    <td>{s.responses?.[0]?.count ?? 0}</td>
                    <td>{s.status === 'live' ? <span className="pill live">live · {s.code}</span> : <span className="pill ended">beendet</span>}</td>
                    <td className="row" style={{ justifyContent: 'flex-end' }}>
                      <Link className="btn small sky" to={`/present/${s.id}`}>{s.status === 'live' ? 'Präsentieren' : 'Ergebnisse'}</Link>
                      <button className="btn small danger" onClick={() => removeSession(s)} title="Löschen">✕</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      ) : (
        <div className="grid">
          {!list.length && <p className="muted">{tab === 'mine' ? 'Noch keine Umfragen – lege eine neue an oder nutze eine Vorlage.' : 'Noch hat niemand eine Umfrage geteilt.'}</p>}
          {list.map((p) => (
            <div className="card stack" key={p.id}>
              <div>
                <div className="row spread">
                  <h3 style={{ margin: 0 }}>{p.title}</h3>
                  {p.is_shared && tab === 'mine' && <span className="pill">geteilt</span>}
                  {p.hide_logo && tab === 'mine' && <span className="pill ended" title="Bei dieser Umfrage wird kein Logo angezeigt">ohne Logo</span>}
                </div>
                <div className="muted small">{p.questions?.[0]?.count ?? 0} Fragen{p.description ? ` · ${p.description}` : ''}</div>
              </div>
              <div className="row">
                <StartButton pollId={p.id} disabled={!p.questions?.[0]?.count} />
                {tab === 'mine' && <Link className="btn ghost small" to={`/poll/${p.id}`}>Bearbeiten</Link>}
                <button className="btn ghost small" onClick={() => duplicate(p)}>{tab === 'mine' ? 'Duplizieren' : 'Kopie übernehmen'}</button>
                {tab === 'mine' && <button className="btn danger small" onClick={() => removePoll(p)} title="Löschen">✕</button>}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
