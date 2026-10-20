import { createClient } from '@supabase/supabase-js'
import { useEffect, useState } from 'react'

export const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY,
  { auth: { flowType: 'pkce' } },
)

// Basis-URL der App, z. B. https://umfrage.meine-schule.de/
export function appBaseUrl() {
  const configured = import.meta.env.VITE_PUBLIC_URL
  if (configured) return configured.endsWith('/') ? configured : configured + '/'
  return window.location.origin + window.location.pathname
}

export function joinUrl(code) {
  return `${appBaseUrl()}#/j/${code}`
}

export function useAuth() {
  const [state, setState] = useState({ loading: true, session: null, profile: null, recovery: false })

  useEffect(() => {
    let alive = true
    async function load(session) {
      let profile = null
      if (session) {
        // Konto zwischenzeitlich gelöscht? Dann lokale Sitzung verwerfen.
        const { error } = await supabase.auth.getUser()
        if (error?.status === 401 || error?.status === 403 || /not exist|not found/i.test(error?.message || '')) {
          await supabase.auth.signOut({ scope: 'local' })
          if (alive) setState((prev) => ({ ...prev, loading: false, session: null, profile: null }))
          return
        }
        const { data } = await supabase.from('profiles').select('*').eq('id', session.user.id).maybeSingle()
        profile = data
        // Per Microsoft angemeldet? Dann entfällt die Pflicht, ein vorläufiges Passwort zu ändern.
        if (profile?.must_change_password && session.user.identities?.some((i) => i.provider === 'azure')) {
          const { error: e2 } = await supabase.rpc('clear_password_flag_for_sso')
          if (!e2) profile = { ...profile, must_change_password: false }
        }
      }
      if (alive) setState((prev) => ({ ...prev, loading: false, session, profile }))
    }
    supabase.auth.getSession().then(({ data }) => load(data.session))
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY') setState((prev) => ({ ...prev, recovery: true }))
      // Profil-Abfrage außerhalb des Callbacks, um Deadlocks in supabase-js zu vermeiden
      setTimeout(() => load(session), 0)
    })
    return () => { alive = false; sub.subscription.unsubscribe() }
  }, [])

  async function refreshProfile() {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return
    const { data } = await supabase.from('profiles').select('*').eq('id', session.user.id).maybeSingle()
    setState((prev) => ({ ...prev, profile: data }))
  }

  return { ...state, refreshProfile, clearRecovery: () => setState((prev) => ({ ...prev, recovery: false })) }
}

// Fehlermeldung aus einer Edge-Function-Antwort lesen
export async function invokeFunction(name, body) {
  const { data, error } = await supabase.functions.invoke(name, { body })
  if (error) {
    let msg = error.message
    try { msg = (await error.context.json()).error || msg } catch { /* keine JSON-Antwort */ }
    throw new Error(msg)
  }
  return data
}

// Stabile, anonyme Teilnehmer-ID pro Gerät
export function participantId() {
  const key = 'klassenpuls.participant'
  try {
    let id = localStorage.getItem(key)
    if (!id) { id = crypto.randomUUID(); localStorage.setItem(key, id) }
    return id
  } catch {
    if (!window.__kpPid) window.__kpPid = crypto.randomUUID()
    return window.__kpPid
  }
}

export function errorText(error) {
  if (!error) return ''
  const msg = error.message || String(error)
  if (/Invalid login credentials/i.test(msg)) return 'E-Mail oder Passwort ist falsch.'
  if (/Email not confirmed/i.test(msg)) return 'Bitte bestätige zuerst deine E-Mail-Adresse (Link in der Bestätigungsmail).'
  if (/already registered/i.test(msg)) return 'Für diese E-Mail-Adresse gibt es bereits ein Konto.'
  if (/Database error (saving|creating) new user|Domain ist nicht zugelassen/i.test(msg)) return 'Diese E-Mail-Domain ist für die Registrierung nicht freigegeben.'
  if (/Password should be at least/i.test(msg)) return 'Das Passwort muss mindestens 6 Zeichen lang sein.'
  return msg
}

// Welche Anmeldewege sind im Supabase-Projekt aktiviert? (z. B. { azure: true, email: true })
let providersPromise
export function authProviders() {
  if (!providersPromise) {
    providersPromise = fetch(`${import.meta.env.VITE_SUPABASE_URL}/auth/v1/settings`, {
      headers: { apikey: import.meta.env.VITE_SUPABASE_ANON_KEY },
    }).then((r) => r.json()).then((d) => d.external || {}).catch(() => ({}))
  }
  return providersPromise
}

const OAUTH_PENDING = 'klassenpuls.oauth'
export const OAUTH_ERROR = 'klassenpuls.oauthError'

export async function signInWithMicrosoft() {
  try { localStorage.setItem(OAUTH_PENDING, '1') } catch { /* ignorieren */ }
  return supabase.auth.signInWithOAuth({
    provider: 'azure',
    options: { scopes: 'openid email profile', redirectTo: appBaseUrl() },
  })
}

// true, wenn wir gerade von der Microsoft-Anmeldung zurückkommen (einmalig)
export function takeOAuthPending() {
  try {
    if (!localStorage.getItem(OAUTH_PENDING)) return false
    localStorage.removeItem(OAUTH_PENDING)
    return true
  } catch { return false }
}

// Fehler aus der Rückleitung (?error_description=…) merken und die Adresse aufräumen
export function captureOAuthError() {
  const params = new URLSearchParams(window.location.search)
  const desc = params.get('error_description') || params.get('error')
  if (!desc) return
  try {
    sessionStorage.setItem(OAUTH_ERROR, desc)
    localStorage.removeItem(OAUTH_PENDING)
  } catch { /* ignorieren */ }
  window.history.replaceState(null, '', window.location.pathname + '#/login')
}

// Freiwilliger Anzeigename der Schüler (nur auf diesem Gerät gespeichert)
const NAME_KEY = 'klassenpuls.name'
export const NAME_MAX = 40
export function getParticipantName() {
  try { return localStorage.getItem(NAME_KEY) || '' } catch { return '' }
}
export function setParticipantName(name) {
  const clean = (name || '').replace(/\s+/g, ' ').trim().slice(0, NAME_MAX)
  try { if (clean) localStorage.setItem(NAME_KEY, clean); else localStorage.removeItem(NAME_KEY) } catch { /* privater Modus */ }
  return clean
}
