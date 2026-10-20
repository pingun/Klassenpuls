// Admin-Funktionen für Lehrer: anlegen, Passwort zurücksetzen, löschen.
// Läuft serverseitig mit dem Service-Role-Key; prüft vorher, ob der Aufrufer Admin ist.
import { createClient } from 'npm:@supabase/supabase-js@2.45.4'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })

// gut lesbar, ohne verwechselbare Zeichen (0/O, 1/l/I)
function tempPassword() {
  const chars = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  const bytes = crypto.getRandomValues(new Uint8Array(12))
  const s = Array.from(bytes, (b) => chars[b % chars.length]).join('')
  return `${s.slice(0, 4)}-${s.slice(4, 8)}-${s.slice(8, 12)}`
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return json({ error: 'Nur POST erlaubt' }, 405)

  const url = Deno.env.get('SUPABASE_URL')!
  const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } })

  const token = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '')
  const { data: caller, error: authErr } = await admin.auth.getUser(token)
  if (authErr || !caller?.user) return json({ error: 'Nicht angemeldet' }, 401)
  const { data: me } = await admin.from('profiles').select('is_admin').eq('id', caller.user.id).single()
  if (!me?.is_admin) return json({ error: 'Nur für Admins' }, 403)

  let body: Record<string, unknown>
  try { body = await req.json() } catch { return json({ error: 'Ungültige Anfrage' }, 400) }

  if (body.action === 'create') {
    const email = String(body.email || '').trim().toLowerCase()
    const fullName = String(body.full_name || '').trim()
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json({ error: 'Bitte eine gültige E-Mail-Adresse eingeben.' }, 400)
    if (!fullName) return json({ error: 'Bitte einen Namen eingeben.' }, 400)
    const password = tempPassword()
    // Vorab-Freigabe: erlaubt jede Domain und markiert das Konto für die Passwortänderung beim 1. Login
    const { error: invErr } = await admin.from('admin_invites')
      .upsert({ email, make_admin: body.is_admin === true, created_at: new Date().toISOString() })
    if (invErr) return json({ error: invErr.message }, 500)
    const { data, error } = await admin.auth.admin.createUser({
      email, password, email_confirm: true,
      user_metadata: { full_name: fullName },
    })
    if (error) {
      await admin.from('admin_invites').delete().eq('email', email)
      const exists = /already been registered|already exists/i.test(error.message)
      return json({ error: exists ? 'Für diese E-Mail-Adresse gibt es bereits ein Konto.' : error.message }, 400)
    }
    return json({ user_id: data.user.id, email, full_name: fullName, password })
  }

  if (body.action === 'reset') {
    const id = String(body.user_id || '')
    const password = tempPassword()
    const { data, error } = await admin.auth.admin.updateUserById(id, { password, email_confirm: true })
    if (error) return json({ error: error.message }, 400)
    await admin.from('profiles').update({ must_change_password: true }).eq('id', id)
    const { data: p } = await admin.from('profiles').select('full_name').eq('id', id).single()
    return json({ user_id: id, email: data.user.email, full_name: p?.full_name || '', password })
  }

  if (body.action === 'delete') {
    const id = String(body.user_id || '')
    if (id === caller.user.id) return json({ error: 'Du kannst dein eigenes Konto nicht löschen.' }, 400)
    const { error } = await admin.auth.admin.deleteUser(id)
    if (error) return json({ error: error.message }, 400)
    return json({ ok: true })
  }

  return json({ error: 'Unbekannte Aktion' }, 400)
})
