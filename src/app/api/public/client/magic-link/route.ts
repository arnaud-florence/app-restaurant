// POST /api/public/client/magic-link
// Body : { email, redirect_to: string }
// Envoie un magic link Supabase à l'email du client.
// Le redirect_to doit être une URL côté outil 2 qui receivera le token.

import { createAdminClient } from '@/lib/supabase/admin'
import { guardPublicRoute, corsHeaders, handleCorsOptions } from '@/lib/public-api/guard'
import { isHoneypotFilled, verifyHcaptcha } from '@/lib/public-api/anti-spam'
import { getClientIp } from '@/lib/public-api/rate-limit'
import { z } from 'zod'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function OPTIONS(req: Request) { return handleCorsOptions(req) }

const schema = z.object({
  email:         z.string().email(),
  redirect_to:   z.string().url(),
  honeypot:      z.string().nullable().optional(),
  captcha_token: z.string().nullable().optional(),
})

export async function POST(req: Request) {
  // Rate limit strict sur magic-link (anti-spam d'envoi email)
  const guard = await guardPublicRoute(req, 'magic-link', { windowMs: 60_000, max: 5 })
  if (!guard.ok) return guard.response

  const cors = corsHeaders(req.headers.get('origin'))

  let body: unknown
  try { body = await req.json() }
  catch { return Response.json({ error: 'JSON invalide' }, { status: 400, headers: cors }) }

  const parsed = schema.safeParse(body)
  if (!parsed.success) {
    return Response.json({ error: parsed.error.issues[0].message }, { status: 400, headers: cors })
  }
  const p = parsed.data

  if (isHoneypotFilled(p as unknown as Record<string, unknown>)) {
    return Response.json({ ok: true }, { headers: cors })
  }
  const captcha = await verifyHcaptcha(p.captcha_token, getClientIp(req))
  if (!captcha.ok) {
    return Response.json({ error: captcha.reason }, { status: 400, headers: cors })
  }

  try {
    const sb = createAdminClient()
    const { error } = await sb.auth.signInWithOtp({
      email: p.email,
      options: {
        emailRedirectTo: p.redirect_to,
        // shouldCreateUser: true (default) → crée auto le compte auth si inexistant
      },
    })
    if (error) {
      console.error('[magic-link] erreur :', error)
      // Même message générique pour ne pas révéler l'existence d'un email
      return Response.json({ ok: true, message: 'Si cet email existe, un lien de connexion a été envoyé.' }, { headers: cors })
    }
    return Response.json({ ok: true, message: 'Lien de connexion envoyé par email.' }, { headers: cors })
  } catch (e) {
    console.error('[magic-link] exception :', e)
    return Response.json({ ok: true, message: 'Si cet email existe, un lien de connexion a été envoyé.' }, { headers: cors })
  }
}
