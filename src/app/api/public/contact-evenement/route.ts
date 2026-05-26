// POST /api/public/contact-evenement
// Demande de privatisation / devis événement.

import { createClient } from '@/lib/supabase/server'
import { guardPublicRoute, corsHeaders, handleCorsOptions } from '@/lib/public-api/guard'
import { isHoneypotFilled, verifyHcaptcha } from '@/lib/public-api/anti-spam'
import { getClientIp } from '@/lib/public-api/rate-limit'
import { z } from 'zod'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function OPTIONS(req: Request) { return handleCorsOptions(req) }

const schema = z.object({
  type_evenement:   z.string().trim().min(1).max(60),
  date_souhaitee:   z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  nombre_personnes: z.coerce.number().int().min(1).max(500),
  budget_indicatif: z.coerce.number().min(0).max(100000).nullable().optional(),
  besoins:          z.string().max(2000).nullable().optional(),
  nom:              z.string().trim().min(1).max(100),
  prenom:           z.string().trim().max(100).nullable().optional(),
  email:            z.string().email(),
  telephone:        z.string().trim().min(8).max(40),
  honeypot:         z.string().nullable().optional(),
  captcha_token:    z.string().nullable().optional(),
})

export async function POST(req: Request) {
  const guard = await guardPublicRoute(req, 'contact-evenement', { windowMs: 60_000, max: 10 })
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

  const { data, error } = await sb.from('evenements').insert({
    nom: `${p.type_evenement} — ${p.nom}`,
    type: p.type_evenement,
    date_evenement: p.date_souhaitee,
    nb_invites_prevu: p.nombre_personnes,
    budget_estime: p.budget_indicatif ?? null,
    contact_nom: `${p.prenom ?? ''} ${p.nom}`.trim(),
    contact_email: p.email,
    contact_telephone: p.telephone,
    notes: p.besoins || null,
    statut: 'demande',
    canal: 'site_web',
  }).select('id').single()

  if (error) {
    return Response.json({ error: error.message }, { status: 500, headers: cors })
  }

  // Notif manager
  try {
    const { data: managers } = await sb.from('employes')
      .select('id').eq('poste', 'manager').eq('actif', true)
    if (managers && managers.length > 0) {
      await sb.from('notifications').insert(
        managers.map(m => ({
          destinataire_employe_id: m.id,
          type: 'message_general',
          titre: '🎉 Nouvelle demande événement',
          message: `${p.type_evenement} · ${p.nombre_personnes} pers · ${p.date_souhaitee} · ${p.email}`,
          url_action: '/admin/evenements',
        }))
      )
    }
  } catch (e) { console.error('[notif-evt] :', e) }

  // Email notif gérant + accusé réception client (best-effort)
  try {
    const { sendEmail, emailNotifGerantEvenement, emailLayout } = await import('@/lib/email')
    const dest = process.env.EMAIL_GERANT
    if (dest) {
      const tplGerant = emailNotifGerantEvenement({
        type: p.type_evenement,
        date_evenement: p.date_souhaitee,
        nb_personnes: p.nombre_personnes,
        client_nom: `${p.prenom ?? ''} ${p.nom}`.trim(),
        client_email: p.email,
        client_telephone: p.telephone,
        message: p.besoins,
      })
      await sendEmail({ to: dest, subject: tplGerant.subject, html: tplGerant.html, text: tplGerant.text, reply_to: p.email })
    }
    // Accusé réception au client
    if (p.email) {
      const html = emailLayout({
        titre: 'Demande bien reçue',
        bodyHtml: `
          <p>Bonjour ${p.prenom ?? p.nom},</p>
          <p>Nous avons bien reçu votre demande pour <strong>${p.type_evenement}</strong>.</p>
          <p>Notre équipe vous recontacte sous <strong>48h</strong> avec une proposition adaptée à vos besoins et votre budget.</p>
          <p style="color:#78716c;font-size:13px;">Pour toute question urgente : <a href="mailto:contact@lerelaisdessaveurs.fr" style="color:#C0392B;">contact@lerelaisdessaveurs.fr</a></p>
        `,
      })
      await sendEmail({ to: p.email, subject: 'Votre demande de privatisation — CASATASIA', html, text: 'Demande reçue, nous vous recontactons sous 48h.' })
    }
  } catch (e) {
    console.error('[email-evt] :', e)
  }

  return Response.json({ id: data.id, statut: 'demande' }, { headers: cors })
}
