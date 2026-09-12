// admin-users — the SPA's only privileged server code.
// Handles the two user operations that require the service role: inviting a user
// (auth admin generateLink + SMTP email) and deactivating/reactivating one (auth ban).
// Every request is authorized: the caller must be an active admin (checked against the
// profiles table using their own JWT) before any service-role action runs.
//
// Deploy:  supabase functions deploy admin-users
// Secrets: supabase secrets set SMTP_HOST=... SMTP_PORT=... SMTP_USERNAME=... \
//                               SMTP_PASSWORD=... SMTP_FROM=...
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { SMTPClient } from 'https://deno.land/x/denomailer@1.6.0/mod.ts'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  })

const PERMA_BAN = '876000h' // ~100 years

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!

function smtpConfigured() {
  return Boolean(
    Deno.env.get('SMTP_HOST') && Deno.env.get('SMTP_USERNAME') && Deno.env.get('SMTP_PASSWORD')
  )
}

async function sendInviteEmail(to: string, full_name: string, role: string, actionLink: string) {
  const client = new SMTPClient({
    connection: {
      hostname: Deno.env.get('SMTP_HOST')!,
      port: Number(Deno.env.get('SMTP_PORT') || 587),
      tls: Number(Deno.env.get('SMTP_PORT') || 587) === 465,
      auth: {
        username: Deno.env.get('SMTP_USERNAME')!,
        password: Deno.env.get('SMTP_PASSWORD')!,
      },
    },
  })
  const roleLabel = role.charAt(0).toUpperCase() + role.slice(1)
  await client.send({
    from: Deno.env.get('SMTP_FROM') || Deno.env.get('SMTP_USERNAME')!,
    to,
    subject: 'Your invitation to CleanCook Data Collection',
    content: `Hi ${full_name},\n\nYou've been invited to CleanCook Data Collection as a ${roleLabel}.\nOpen the link below to set your password and sign in:\n\n${actionLink}\n\nIf you weren't expecting this, ignore this email.`,
    html: `<p>Hi ${full_name},</p><p>You've been invited to <strong>CleanCook Data Collection</strong> as a <strong>${roleLabel}</strong>.</p><p><a href="${actionLink}">Set your password and sign in</a></p>`,
  })
  await client.close()
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  const authHeader = req.headers.get('Authorization')
  if (!authHeader) return json({ error: 'Not authenticated' }, 401)

  // Authorize: the caller must be an active admin. Use their JWT so RLS applies to this read.
  const asCaller = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  })
  const { data: userData } = await asCaller.auth.getUser()
  const caller = userData?.user
  if (!caller) return json({ error: 'Not authenticated' }, 401)

  const { data: prof } = await asCaller
    .from('profiles')
    .select('role, active')
    .eq('id', caller.id)
    .maybeSingle()
  if (!prof || prof.role !== 'admin' || !prof.active) {
    return json({ error: 'Admin only' }, 403)
  }

  const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return json({ error: 'Invalid JSON' }, 400)
  }

  const writeAudit = (entity_id: string | null, action: string, meta: Record<string, unknown>) =>
    admin.from('audit_log').insert({
      actor_id: caller.id,
      entity_type: 'user',
      entity_id: entity_id,
      action,
      meta,
    })

  try {
    if (body.action === 'invite') {
      const { email, full_name, role, redirectTo } = body as Record<string, string>
      const { data, error } = await admin.auth.admin.generateLink({
        type: 'invite',
        email,
        options: { data: { full_name, role }, redirectTo },
      })
      if (error) return json({ error: error.message }, 400)

      const userId = data.user?.id
      if (userId) {
        await admin
          .from('profiles')
          .upsert({ id: userId, email, full_name, role, active: true }, { onConflict: 'id' })
      }
      const actionLink = data.properties?.action_link ?? null

      let emailed = false
      if (actionLink && smtpConfigured()) {
        try {
          await sendInviteEmail(email, full_name, role, actionLink)
          emailed = true
        } catch (err) {
          console.error('Invite email failed, returning link instead:', err)
        }
      }
      await writeAudit(userId ?? null, 'user.invite', { email, role, emailed })
      return json({ actionLink: emailed ? null : actionLink, emailed })
    }

    if (body.action === 'set-active') {
      const userId = String(body.userId)
      const active = Boolean(body.active)
      const { error } = await admin.from('profiles').update({ active }).eq('id', userId)
      if (error) return json({ error: error.message }, 400)
      await admin.auth.admin.updateUserById(userId, {
        ban_duration: active ? 'none' : PERMA_BAN,
      })
      await writeAudit(userId, active ? 'user.activate' : 'user.deactivate', {})
      return json({ ok: true })
    }

    return json({ error: 'Unknown action' }, 400)
  } catch (err) {
    return json({ error: String(err) }, 500)
  }
})
