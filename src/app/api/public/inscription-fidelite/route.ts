// POST /api/public/inscription-fidelite
// Inscription au programme fidélité depuis le site web.
// Idempotent : si email/tel existant, renvoie le client existant + bonus inscription.

import { createClient } from '@/lib/supabase/server'
import { guardPublicRoute, corsHeaders, handleCorsOptions } from '@/lib/public-api/guard'
import { isHoneypotFilled, verifyHcaptcha } from '@/lib/public-api/anti-spam'
import { getClientIp } from '@/lib/public-api/rate-limit'
import { genererCodeParrainage } from '@/lib/clients'
import { z } from 'zod'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function OPTIONS(req: Request) { return handleCorsOptions(req) }

const schema = z.object({
  prenom:           z.string().trim().max(100).nullable().optional(),
  nom:              z.string().trim().min(1).max(100),
  email:            z.string().email(),
  telephone:        z.string().trim().max(40).nullable().optional(),
  date_naissance:   z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  opt_in_marketing: z.boolean().default(true),
  parraine_par_code: z.string().max(40).nullable().optional(),
  honeypot:         z.string().nullable().optional(),
  captcha_token:    z.string().nullable().optional(),
})

export async function POST(req: Request) {
  const guard = await guardPublicRoute(req, 'inscription-fidelite', { windowMs: 60_000, max: 10 })
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
    return Response.json({ ok: true, fake: true }, { headers: cors })
  }
  const captcha = await verifyHcaptcha(p.captcha_token, getClientIp(req))
  if (!captcha.ok) {
    return Response.json({ error: captcha.reason }, { status: 400, headers: cors })
  }

  const sb = await createClient()

  // Idempotence sur email
  const { data: existing } = await sb.from('clients')
    .select('id, prenom, nom, points_fidelite, niveau_fidelite, code_parrainage')
    .eq('email', p.email).maybeSingle()
  if (existing) {
    return Response.json({
      id: existing.id,
      deja_inscrit: true,
      points: existing.points_fidelite,
      niveau: existing.niveau_fidelite,
      code_parrainage: existing.code_parrainage,
    }, { headers: cors })
  }

  // Bonus inscription
  const { data: paramBonus } = await sb.from('parametres')
    .select('valeur').eq('cle', 'fidelite.points_inscription').maybeSingle()
  const bonus = Number(paramBonus?.valeur ?? 10)

  // Cherche le parrain si code fourni
  let parrainId: string | null = null
  if (p.parraine_par_code) {
    const { data: parrain } = await sb.from('clients')
      .select('id').eq('code_parrainage', p.parraine_par_code).maybeSingle()
    if (parrain) parrainId = parrain.id as string
  }

  const code = genererCodeParrainage(p.prenom ?? p.nom, p.nom)

  const { data: cli, error } = await sb.from('clients').insert({
    prenom: p.prenom || null,
    nom: p.nom,
    email: p.email,
    telephone: p.telephone || null,
    date_naissance: p.date_naissance || null,
    opt_in_marketing: p.opt_in_marketing,
    parraine_par_id: parrainId,
    points_fidelite: bonus,
    niveau_fidelite: 'standard',
    code_parrainage: code,
    email_verifie: false,                     // sera true après magic link
  }).select('id, points_fidelite, niveau_fidelite, code_parrainage').single()

  if (error || !cli) {
    return Response.json({ error: error?.message ?? 'Erreur création' }, { status: 500, headers: cors })
  }

  // Mouvement bonus inscription
  if (bonus > 0) {
    await sb.from('mouvements_points').insert({
      client_id: cli.id,
      type: 'gain',
      points: bonus,
      motif: 'Bonus inscription programme fidélité',
    })
  }

  // Email de bienvenue (best-effort)
  try {
    const { sendEmail, emailBienvenueFidelite } = await import('@/lib/email')
    const tpl = emailBienvenueFidelite({
      prenom: p.prenom,
      nom: p.nom,
      points: cli.points_fidelite,
      niveau: cli.niveau_fidelite,
      code_parrainage: cli.code_parrainage,
    })
    await sendEmail({ to: p.email, subject: tpl.subject, html: tpl.html, text: tpl.text })
  } catch (e) {
    console.error('[email-bienvenue] :', e)
  }

  return Response.json({
    id: cli.id,
    points: cli.points_fidelite,
    niveau: cli.niveau_fidelite,
    code_parrainage: cli.code_parrainage,
    bonus,
  }, { headers: cors })
}
