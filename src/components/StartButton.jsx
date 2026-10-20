import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase, errorText } from '../supabase'

// Startet einen neuen Durchlauf (z. B. für eine bestimmte Klasse) und öffnet die Beamer-Ansicht
export default function StartButton({ pollId, disabled, beforeStart, children = '▶ Starten' }) {
  const nav = useNavigate()
  const [open, setOpen] = useState(false)
  const [label, setLabel] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  async function begin() {
    if (beforeStart && !(await beforeStart())) return
    setOpen(true)
  }

  async function start(e) {
    e.preventDefault()
    setBusy(true); setErr('')
    const { data, error } = await supabase.from('sessions').insert({ poll_id: pollId, label: label.trim() || null }).select().single()
    setBusy(false)
    if (error) return setErr(errorText(error))
    nav(`/present/${data.id}`)
  }

  return (
    <>
      <button className="btn mint" disabled={disabled} onClick={begin}>{children}</button>
      {open && (
        <div className="modal-bg" onClick={() => setOpen(false)}>
          <form className="card stack modal" onClick={(e) => e.stopPropagation()} onSubmit={start}>
            <h2>Umfrage live starten</h2>
            <label className="field"><span>Für welche Klasse / welchen Anlass? (optional)</span>
              <input type="text" autoFocus placeholder="z. B. 8b – Mathe" value={label} onChange={(e) => setLabel(e.target.value)} />
            </label>
            <p className="muted small" style={{ margin: 0 }}>Jeder Start erzeugt einen eigenen Durchlauf mit neuem Code – die Ergebnisse bleiben getrennt gespeichert.</p>
            {err && <div className="alert">{err}</div>}
            <div className="row" style={{ justifyContent: 'flex-end' }}>
              <button type="button" className="btn ghost" onClick={() => setOpen(false)}>Abbrechen</button>
              <button className="btn mint" disabled={busy}>{busy ? '…' : 'Live starten'}</button>
            </div>
          </form>
        </div>
      )}
    </>
  )
}
