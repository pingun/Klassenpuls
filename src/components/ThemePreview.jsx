import { themeByKey } from '../themes'

// Mini-Beamerfolie in den Farben eines Stils – unabhängig vom gerade aktiven Stil der Seite
const VALUES = [6, 9, 4, 3]
const LABELS = ['Allein', 'Zu zweit', 'Gruppe', 'Klasse']

export default function ThemePreview({ themeKey }) {
  const v = themeByKey(themeKey).v
  const max = Math.max(...VALUES)
  return (
    <div className="theme-preview" style={{ background: v.bg, color: v.ink, fontFamily: v.font }} aria-hidden="true">
      <div className="tp-head">
        <span style={{ color: v.inkSoft }}>Erwartungen · 8b</span>
        <span className="tp-code" style={{ background: v.card, color: v.brand, borderColor: v.line }}>483 912</span>
      </div>
      <div className="tp-q" style={{ fontFamily: v.heading }}>Wie möchtest du arbeiten?</div>
      <div className="tp-bars">
        {VALUES.map((n, i) => (
          <div key={i} className="tp-col">
            <b style={{ color: v.ink }}>{n}</b>
            <div style={{ height: `${(n / max) * 70}%`, background: v.c[i] }} />
            <span style={{ color: v.inkSoft }}>{LABELS[i]}</span>
          </div>
        ))}
      </div>
      <div className="tp-foot" style={{ background: v.card, borderTopColor: v.brand }}>
        <span style={{ color: v.inkSoft }}>12 Antworten</span>
        <span className="tp-btn" style={{ background: v.brand, color: v.onBrand }}>Nächste Frage</span>
      </div>
    </div>
  )
}
