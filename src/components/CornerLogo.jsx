import { useEffect, useState } from 'react'
import { supabase } from '../supabase'

// Logo unten links auf jeder Seite
export default function CornerLogo({ url, inline = false }) {
  if (!url) return null
  return (
    <div className={inline ? 'corner-logo inline' : 'corner-logo'}>
      <img src={url} alt="Logo" />
    </div>
  )
}

// Wirksames Logo: das der Lehrkraft `userId`, sonst das Standardlogo. `version` erzwingt Neuladen.
export function useLogoUrl(userId, version) {
  const [url, setUrl] = useState(null)
  const [tick, setTick] = useState(0)
  useEffect(() => {
    const bump = () => setTick((t) => t + 1)
    window.addEventListener(LOGO_EVENT, bump)
    return () => window.removeEventListener(LOGO_EVENT, bump)
  }, [])
  useEffect(() => {
    let alive = true
    supabase.rpc('effective_logo_url', { p_user: userId || null })
      .then(({ data }) => { if (alive) setUrl(data || null) })
    return () => { alive = false }
  }, [userId, version, tick])
  return url
}

// Nach Änderungen an Logos/Standardlogo alle Anzeigen neu laden
const LOGO_EVENT = 'klassenpuls:logo'
export const notifyLogoChanged = () => window.dispatchEvent(new Event(LOGO_EVENT))
