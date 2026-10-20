import { QUESTION_TYPES } from '../questionTypes'
import Results from './Results'

// Verkleinerte, echte Beamer-Ansicht mit Beispieldaten – dient als „Screenshot“ eines Fragetyps
const W = 800
const H = 450

export default function TypePreview({ type, width }) {
  const { sample, icon, label } = QUESTION_TYPES[type]
  const scale = width / W
  return (
    <div className="type-preview" style={{ width, height: H * scale }} aria-hidden="true">
      <div className="type-preview-slide" style={{ width: W, height: H, transform: `scale(${scale})` }}>
        <div className="muted small" style={{ fontWeight: 700 }}>{icon} {label}</div>
        <h2>{sample.prompt}</h2>
        <Results question={{ type, ...sample }} answers={sample.answers} />
      </div>
    </div>
  )
}
