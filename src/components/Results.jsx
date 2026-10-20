import CroppedImage from './CroppedImage'
// helle Töne aus Weinrot, Petrol und den Schulfarben der AHF-Schulen
export const PASTELS = ['#dfbfc3', '#b5d0cb', '#f4d3a8', '#b9d6ea', '#e6e9a6', '#d5c3d6', '#c9ddb4', '#e8dccf']
export const pastel = (i) => PASTELS[i % PASTELS.length]

const fmt = (n, d = 1) => n.toLocaleString('de-DE', { minimumFractionDigits: d, maximumFractionDigits: d })

export default function Results({ question, answers }) {
  if (!question) return null
  if (question.type === 'pin') return <PinResults q={question} answers={answers} />
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

// kräftige Schulfarben für Linie und Punkt; die Fläche nutzt dieselbe Farbe transparent
const STRONG = ['#942838', '#11443e', '#b35c1e', '#2f6f99', '#6b7a10', '#7a4d7a', '#4f6d2f', '#8a6a3d']

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
              <div className="scale-dot" style={{ left: `${pos}%`, background: color }} title={`${vals.length} Antworten`}>{fmt(avg)}</div>
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
          <span key={w.text} style={{ fontSize: `${1.2 + (w.n / top) * 3.4}rem`, color: ['#942838', '#11443e', '#b35c1e', '#2f6f99', '#6b7a10'][i % 5] }}>{w.text}</span>
        ))}
      </div>
    )
  }
  return (
    <div className="wall">
      {texts.map((t, i) => <div className="note" key={i} style={{ background: pastel(i) }}>{t}</div>)}
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
        {pins.map((a, i) => <span key={i} className="pin-dot" style={{ left: `${a.x * 100}%`, top: `${a.y * 100}%` }} />)}
      </CroppedImage>
      {!pins.length && <div className="muted" style={{ marginTop: 10, fontWeight: 600 }}>Noch keine Pins – scannt den QR-Code und tippt auf das Bild!</div>}
    </div>
  )
}
