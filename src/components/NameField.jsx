import { NAME_MAX } from '../supabase'

// Freiwilliges Namensfeld für Schüler – bewusst als optional gekennzeichnet
export default function NameField({ value, onChange, autoFocus = false, hint }) {
  return (
    <label className="field name-field">
      <span>Dein Name <span className="optional-badge">freiwillig</span></span>
      <input type="text" value={value} maxLength={NAME_MAX} autoComplete="nickname" autoFocus={autoFocus}
        placeholder="Kannst du auch leer lassen" onChange={(e) => onChange(e.target.value)} />
      <small className="muted">Ohne Namen bleibst du anonym. {hint}</small>
    </label>
  )
}
