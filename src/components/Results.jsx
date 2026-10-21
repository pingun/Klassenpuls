import { useRef, useState } from 'react'
import { inkOn } from '../themes'
import CroppedImage from './CroppedImage'
// helle Diagrammfarben des aktiven Stils (siehe src/themes.js)
export const PASTELS = ['var(--c1)', 'var(--c2)', 'var(--c3)', 'var(--c4)', 'var(--c5)', 'var(--c6)', 'var(--c7)', 'var(--c8)']
export const pastel = (i) => PASTELS[i % PASTELS.length]

const fmt = (n, d = 1) => n.toLocaleString('de-DE', { minimumFractionDigits: d, maximumFractionDigits: d })

export default function Results({ question, answers }) {
  if (!question) return null
  if (question.type === 'pin') return <PinResults q={question} answers={answers} />
  if (question.type === 'matrix') return <MatrixResults q={question} answers={answers} />
  if (question.type === 'qa') return <QaStage items={answers} index={0} />
  if (!answers.length) {
    return <div className="empty-results"><div className="bounce">⏳</div><div>Noch keine Antworten – scannt den QR-Code!</div></div>
  }
  switch (question.type) {
    case 'multiple_choice': return <ChoiceResults q={question} answers={answers} />
    case 'ranking': return <RankingResults q={question} answers={answers} />
    case 'scale': return <ScaleResults q={question} answers={answers} />
    case 'open': return <OpenResults q={question} answers={answers} />
    default: return null
  }
}

function ChoiceResults({ q, answers }) {
  const counts = q.options.map(() => 0)
  answers.forEach((a) => (a.choices || []).forEach((i) => { if (counts[i] !== undefined) counts[i]++ }))
  const max = Math.max(1, ...counts)
  if (q.options.length <= 6) {
    return (
      <div className="cols">
        {q.options.map((opt, i) => (
          <div className="col" key={i}>
            <div className="col-val">{counts[i]}</div>
            <div className="col-bar" style={{ height: `${(counts[i] / max) * 78}%`, background: pastel(i) }} />
            <div className="col-label">{opt}</div>
          </div>
        ))}
      </div>
    )
  }
  return (
    <div className="bars">
      {q.options.map((opt, i) => (
        <div className="bar-row" key={i}>
          <div className="bar-label">{opt}</div>
          <div className="bar-track"><div className="bar-fill" style={{ width: `${(counts[i] / max) * 100}%`, background: pastel(i) }} /></div>
          <div className="bar-val">{counts[i]}</div>
        </div>
      ))}
    </div>
  )
}

function RankingResults({ q, answers }) {
  const n = q.options.length
  const points = q.options.map(() => 0)
  const rankSum = q.options.map(() => 0)
  answers.forEach((a) => (a.order || []).forEach((opt, pos) => {
    if (points[opt] === undefined) return
    points[opt] += n - pos
    rankSum[opt] += pos + 1
  }))
  const rows = q.options.map((label, i) => ({ label, i, points: points[i], avg: rankSum[i] / answers.length }))
    .sort((a, b) => b.points - a.points)
  const max = Math.max(1, ...points)
  return (
    <div className="bars">
      {rows.map((r, place) => (
        <div className="bar-row" key={r.i}>
          <div className="bar-label">{place + 1}. {r.label}</div>
          <div className="bar-track"><div className="bar-fill" style={{ width: `${(r.points / max) * 100}%`, background: pastel(r.i) }} /></div>
          <div className="bar-val" title="durchschnittlicher Platz">Ø {fmt(r.avg)}</div>
        </div>
      ))}
    </div>
  )
}

// kräftige Farben des aktiven Stils für Linie und Punkt; die Fläche nutzt dieselbe Farbe transparent
const STRONG = ['var(--s1)', 'var(--s2)', 'var(--s3)', 'var(--s4)', 'var(--s5)', 'var(--s6)', 'var(--s7)', 'var(--s8)']

// Geglättete Verteilung (Kerndichteschätzung) als SVG-Pfad im Bereich 0..1000 × 0..100
function densityPath(vals, min, max) {
  const range = Math.max(1, max - min)
  const h = Math.max(0.45, range / 8)
  const N = 80
  const ys = Array.from({ length: N + 1 }, (_, k) => {
    const x = min + (k / N) * range
    return vals.reduce((sum, v) => sum + Math.exp(-0.5 * ((x - v) / h) ** 2), 0)
  })
  const top = Math.max(...ys) || 1
  const pts = ys.map((y, k) => `L${((k / N) * 1000).toFixed(1)},${(100 - (y / top) * 92).toFixed(1)}`)
  return `M0,100 ${pts.join(' ')} L1000,100 Z`
}

function ScaleResults({ q, answers }) {
  const min = Number(q.settings?.min ?? 1)
  const max = Number(q.settings?.max ?? 5)
  const range = Math.max(1, max - min)
  return (
    <div className="scale-results">
      {q.options.map((stmt, i) => {
        const vals = answers.map((a) => a.values?.[i]).filter((v) => typeof v === 'number')
        const avg = vals.length ? vals.reduce((s, v) => s + v, 0) / vals.length : min
        const pos = ((avg - min) / range) * 100
        const color = STRONG[i % STRONG.length]
        return (
          <div className="scale-row" key={i}>
            <div className="scale-area">
              <svg viewBox="0 0 1000 100" preserveAspectRatio="none" aria-hidden="true">
                <path d={densityPath(vals, min, max)} fill={color} fillOpacity="0.2" style={{ transition: 'd .7s cubic-bezier(.2,.8,.2,1)' }} />
              </svg>
              <div className="scale-label">{stmt}</div>
            </div>
            <div className="scale-line">
              <div className="scale-fill" style={{ width: `${pos}%`, background: color }} />
              <div className="scale-dot" style={{ left: `${pos}%`, background: color, color: `var(--s${(i % 8) + 1}-ink, #fff)` }} title={`${vals.length} Antworten`}>{fmt(avg)}</div>
            </div>
          </div>
        )
      })}
      <div className="scale-ends"><span>{q.settings?.minLabel || min}</span><span>{q.settings?.maxLabel || max}</span></div>
    </div>
  )
}

function OpenResults({ q, answers }) {
  const texts = answers.map((a) => a.text).filter(Boolean)
  const notes = answers.filter((a) => a.text).map((a) => ({ text: a.text, name: a._name }))
  if (q.settings?.display === 'cloud') {
    const freq = new Map()
    texts.forEach((t) => {
      const key = t.trim().toLowerCase()
      const e = freq.get(key) || { text: t.trim(), n: 0 }
      e.n++
      freq.set(key, e)
    })
    const words = [...freq.values()].sort((a, b) => b.n - a.n).slice(0, 60)
    const top = words[0]?.n || 1
    return (
      <div className="cloud">
        {words.map((w, i) => (
          <span key={w.text} style={{ fontSize: `${1.2 + (w.n / top) * 3.4}rem`, color: STRONG[i % 5] }}>{w.text}</span>
        ))}
      </div>
    )
  }
  return (
    <div className="wall">
      {notes.map((n, i) => (
        <div className="note" key={i} style={{ background: pastel(i) }}>
          {n.text}
          {n.name && <span className="note-name">– {n.name}</span>}
        </div>
      ))}
    </div>
  )
}

function PinResults({ q, answers }) {
  const url = q.settings?.image_url
  if (!url) return <div className="empty-results">Für diese Frage wurde noch kein Bild hochgeladen.</div>
  const pins = answers.filter((a) => typeof a.x === 'number' && typeof a.y === 'number')
  return (
    <div className="pin-stage">
      <CroppedImage url={url} crop={q.settings.crop} dims={{ w: q.settings.image_w, h: q.settings.image_h }} maxHeight="var(--pin-max-h, 58vh)" className="pin-frame">
        {pins.map((a, i) => <span key={i} className="pin-dot" title={a._name || undefined} style={{ left: `${a.x * 100}%`, top: `${a.y * 100}%` }} />)}
      </CroppedImage>
      {!pins.length && <div className="muted" style={{ marginTop: 10, fontWeight: 600 }}>Noch keine Pins – scannt den QR-Code und tippt auf das Bild!</div>}
    </div>
  )
}

// 4-Felder: Mittelwert je Item als nummerierter Farbpunkt in der Matrix, rechts die Legende.
// Maus auf einen Punkt (oder Legendeneintrag): nur dieser Punkt bleibt sichtbar, dazu seine Einzelbewertungen als kleine Punkte.
// Fokus endet, wenn die Maus diesen Umkreis um den Ergebnispunkt verlässt (Vielfaches des Punktradius)
const MATRIX_FOCUS_RADIUS = 2.5

function MatrixResults({ q, answers }) {
  const [hover, setHover] = useState(null) // Item unter der Maus
  const hoverFromPoint = useRef(false) // Fokus kam vom Punkt (nicht von der Legende)
  const pointEls = useRef({})
  const [pinned, setPinned] = useState(null) // per Klick/Tippen festgehalten (für Touch-Geräte)
  const focus = hover ?? pinned
  const colors = q.settings?.colors || []
  const items = q.options.map((name, i) => {
    const rated = answers.map((a) => a.values?.[i]).filter((v) => Array.isArray(v))
    const n = rated.length
    const x = n ? rated.reduce((s, v) => s + v[0], 0) / n : null
    const y = n ? rated.reduce((s, v) => s + v[1], 0) / n : null
    // gleiche Bewertungen zusammenfassen, damit man sieht, wie oft ein Wertepaar vorkam
    const groups = new Map()
    rated.forEach(([vx, vy]) => { const k = `${vx}|${vy}`; groups.set(k, { x: vx, y: vy, count: (groups.get(k)?.count || 0) + 1 }) })
    const color = colors[i] || '#4f6ad8'
    return { i, name, n, x, y, votes: [...groups.values()], color, ink: /^#[0-9a-f]{6}$/i.test(color) ? inkOn(color) : '#fff' }
  })
  const pos = (v) => `${((v - 1) / 9) * 100}%`
  const focused = focus != null ? items[focus] : null
  const enter = (i, fromPoint = false) => { hoverFromPoint.current = fromPoint; setHover(i) }
  const leave = () => { hoverFromPoint.current = false; setHover(null) }
  // Maus entfernt sich vom fokussierten Punkt → wieder alle Punkte zeigen
  const onPlotMove = (e) => {
    if (hover == null || !hoverFromPoint.current) return
    const el = pointEls.current[hover]
    if (!el) return
    const r = el.getBoundingClientRect()
    const dist = Math.hypot(e.clientX - (r.left + r.width / 2), e.clientY - (r.top + r.height / 2))
    if (dist > (r.width / 2) * MATRIX_FOCUS_RADIUS) leave()
  }
  const toggle = (i) => setPinned((p) => (p === i ? null : i))

  return (
    <div className="matrix-wrap">
      <div className="matrix-chart">
        <div className="matrix-ylabel"><span>{q.settings?.yLabel} →</span></div>
        <div className="matrix-plot" onMouseLeave={leave} onMouseMove={onPlotMove}>
          <div className="matrix-cells" onClick={() => setPinned(null)}><div /><div /><div /><div /></div>
          {focused?.votes.map((v) => (
            <span key={`${v.x}|${v.y}`} className="matrix-vote" title={`${v.x} / ${v.y}${v.count > 1 ? ` (${v.count}×)` : ''}`}
              style={{ left: pos(v.x), bottom: pos(v.y), background: focused.color, '--size': `${Math.min(13 + (v.count - 1) * 4, 28)}px` }}>
              {v.count > 1 ? v.count : ''}
            </span>
          ))}
          {items.filter((it) => it.n).map((it) => (
            <span key={it.i} className={`matrix-point ${focus != null && focus !== it.i ? 'faded' : ''} ${focus === it.i ? 'active' : ''}`}
              title={`${it.name}: Ø ${fmt(it.x)} / Ø ${fmt(it.y)} (${it.n} Bewertungen)`}
              ref={(el) => { pointEls.current[it.i] = el }}
              onMouseEnter={() => enter(it.i, true)} onClick={() => toggle(it.i)}
              style={{ left: pos(it.x), bottom: pos(it.y), background: it.color, color: it.ink }}>{it.i + 1}</span>
          ))}
        </div>
        <div className="matrix-xlabel">{q.settings?.xLabel} →</div>
      </div>
      <ol className="matrix-legend" onMouseLeave={leave}>
        {items.map((it) => (
          <li key={it.i} className={`${it.n ? '' : 'none'} ${focus != null && focus !== it.i ? 'faded' : ''} ${focus === it.i ? 'active' : ''}`}
            onMouseEnter={() => it.n && enter(it.i)} onClick={() => it.n && toggle(it.i)}>
            <span className="matrix-dot" style={{ background: it.color, color: it.ink }}>{it.i + 1}</span>
            <span className="grow">
              {it.name}
              {focus === it.i && <span className="matrix-avg">Ø {fmt(it.x)} · Ø {fmt(it.y)}</span>}
            </span>
            <span className="muted small" title="Anzahl Bewertungen">{it.n || '–'}</span>
          </li>
        ))}
      </ol>
    </div>
  )
}

// Q&A: eine Frage pro Ansicht, darunter „Frage x von y“ und die Daumen.
// items: [{ id, text, votes }] – bereits sortiert; mit onIndex wird gewischt, mit onVote abgestimmt.
export function QaStage({ items, index, onIndex, onVote, big = true, showVotes = true }) {
  const start = useRef(null)
  if (!items.length) {
    return (
      <div className={`qa-empty ${big ? 'big' : ''}`}>
        <div className="qa-empty-title">Keine Fragen aus dem Publikum!</div>
        <div>Eingehende Fragen werden hier angezeigt, sodass Sie sie nacheinander beantworten können.</div>
      </div>
    )
  }
  const i = Math.min(Math.max(index, 0), items.length - 1)
  const it = items[i]
  const go = (d) => onIndex && onIndex(Math.min(Math.max(i + d, 0), items.length - 1))
  const touch = {
    onTouchStart: (e) => { start.current = e.touches[0].clientX },
    onTouchEnd: (e) => {
      if (start.current == null) return
      const dx = e.changedTouches[0].clientX - start.current
      start.current = null
      if (Math.abs(dx) > 40) go(dx < 0 ? 1 : -1)
    },
  }
  return (
    <div className={`qa-stage ${big ? 'big' : ''}`} {...touch}>
      <div className="qa-row">
        {onIndex && <button className="btn ghost icon qa-nav" onClick={() => go(-1)} disabled={i === 0} aria-label="Vorherige Frage">‹</button>}
        <div className="qa-card" key={it.id}>{it.text}</div>
        {onIndex && <button className="btn ghost icon qa-nav" onClick={() => go(1)} disabled={i === items.length - 1} aria-label="Nächste Frage">›</button>}
      </div>
      <div className="qa-meta">
        <span>Frage {i + 1} von {items.length}</span>
        {showVotes && (onVote
          ? <button className={`qa-thumb ${it.voted ? 'on' : ''}`} onClick={() => onVote(it)} aria-pressed={!!it.voted} title={it.voted ? 'Daumen zurücknehmen' : 'Daumen hoch'}>👍 {it.votes}</button>
          : <span className="qa-thumb">👍 {it.votes}</span>)}
      </div>
    </div>
  )
}
