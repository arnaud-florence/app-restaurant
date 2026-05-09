// POST /api/public/reservation-table
// Body : { date, heure, nombre_personnes, nom, prenom, email, telephone, message?, honeypot?, captcha_token? }

import { createClient } from '@/lib/supabase/server'
import { guardPublicRoute, corsHeaders, handleCorsOptions } from '@/lib/public-api/guard'
import { isHoneypotFilled, verifyHcaptcha } from '@/lib/public-api/anti-spam'
import { getClientIp } from '@/lib/public-api/rate-limit'
import { z } from 'zod'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function OPTIONS(req: Request) { return handleCorsOptions(req) }

const schema = z.object({
  date:             z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  heure:            z.string().regex(/^\d{2}:\d{2}/),
  nombre_personnes: z.coerce.number().int().min(1).max(50),
  nom:              z.string().trim().min(1).max(100),
  prenom:           z.string().trim().max(100).nullable().optional(),
  email:            z.string().email().nullable().optional(),
  telephone:        z.string().trim().min(8).max(40),
  message:          z.string().max(1000).nullable().optional(),
  honeypot:         z.string().nullable().optional(),
  captcha_token:    z.string().nullable().optional(),
})

export async function POST(req: Request) {
  const guard = await guardPublicRoute(req, 'reservation-table', { windowMs: 60_000, max: 20 })
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
  const dateHeure = `${p.date}T${p.heure.length === 5 ? p.heure + ':00' : p.heure}`

  const { data, error } = await sb.from('reservations_tables').insert({
    nom: p.nom,
    prenom: p.prenom || null,
    email: p.email || null,
    telephone: p.telephone,
    nombre_personnes: p.nombre_personnes,
    date_heure: dateHeure,
    statut: 'demande',                      // statut initial : demande à valider par le manager
    notes: p.message || null,
    canal: 'site_web',
  }).select('id').single()

  if (error) {
    return Response.json({ error: error.message }, { status: 500, headers: cors })
  }

  // Notif manager
  try {
    const { data: managers } = await sb.from('employes')
      .select('id').in('poste', ['manager', 'receptionniste']).eq('actif', true)
    if (managers && managers.length > 0) {
      await sb.from('notifications').insert(
        managers.map(m => ({
          destinataire_employe_id: m.id,
          type: 'message_general',
          titre: '🪑 Nouvelle réservation table',
          message: `${p.prenom ?? ''} ${p.nom} · ${p.nombre_personnes} pers · ${p.date} ${p.heure}`,
          url_action: '/admin/reservations',
        }))
      )
    }
  } catch (e) { console.error('[notif-resa-table] :', e) }

  return Response.json({ id: data.id, statut: 'demande' }, { headers: cors })
}
