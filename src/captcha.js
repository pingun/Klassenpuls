// Unsichtbares Captcha (Cloudflare Turnstile) gegen automatisierte Anmeldungen.
// Aktiv, sobald VITE_TURNSTILE_SITE_KEY gesetzt ist. Supabase prüft das Token nur, wenn dort
// „Enable Captcha protection“ eingeschaltet ist – sonst wird es ignoriert.
const SITE_KEY = import.meta.env.VITE_TURNSTILE_SITE_KEY

let scriptPromise
function loadScript() {
  if (!scriptPromise) {
    scriptPromise = new Promise((resolve, reject) => {
      const s = document.createElement('script')
      s.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit'
      s.async = true
      s.onload = () => resolve(window.turnstile)
      s.onerror = () => { scriptPromise = null; reject(new Error('Die Sicherheitsprüfung konnte nicht geladen werden. Bitte prüfe die Internetverbindung.')) }
      document.head.appendChild(s)
    })
  }
  return scriptPromise
}

// Liefert ein einmal verwendbares Token (oder undefined, wenn kein Captcha eingerichtet ist).
// Nur bei Verdacht blendet Turnstile unten ein Kästchen zum Anklicken ein.
export async function captchaToken() {
  if (!SITE_KEY) return undefined
  const turnstile = await loadScript()
  let host = document.getElementById('kp-captcha')
  if (!host) {
    host = document.createElement('div')
    host.id = 'kp-captcha'
    host.className = 'captcha-host'
    document.body.appendChild(host)
  }
  return new Promise((resolve, reject) => {
    let id
    const done = (fn, v) => { try { turnstile.remove(id) } catch { /* schon entfernt */ } fn(v) }
    id = turnstile.render(host, {
      sitekey: SITE_KEY,
      language: 'de',
      appearance: 'interaction-only',
      callback: (token) => done(resolve, token),
      'error-callback': () => done(reject, new Error('Die Sicherheitsprüfung ist fehlgeschlagen. Bitte lade die Seite neu und versuche es noch einmal.')),
      'timeout-callback': () => done(reject, new Error('Die Sicherheitsprüfung ist abgelaufen. Bitte versuche es noch einmal.')),
    })
  })
}
