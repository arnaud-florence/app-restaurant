// POST /api/public/reservation-chambre
// Body : { chambre_id, date_arrivee, date_depart, nb_personnes, nom, email, telephone, message?, ... }
// Crée une réservation statut 'demande' (validation manager + paiement acompte ensuite).

import { createClient } from '@/lib/supabase/server'
import { guardPublicRoute, corsHeaders, handleCorsOptions } from '@/lib/public-api/guard'
import { isHoneypotFilled, verifyHcaptcha } from '@/lib/public-api/anti-spam'
import { getClientIp } from '@/lib/public-api/rate-limit'
import { z } from 'zod'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function OPTIONS(req: Request) { return handleCorsOptions(req) }

const schema = z.object({
  chambre_id:       z.string().uuid(),
  date_arrivee:     z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  date_depart:      z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  nb_personnes:     z.coerce.number().int().min(1).max(10),
  nom:              z.string().trim().min(1).max(100),
  prenom:           z.string().trim().max(100).nullable().optional(),
  email:            z.string().email(),
  telephone:        z.string().trim().min(8).max(40),
  message:          z.string().max(1000).nullable().optional(),
  honeypot:         z.string().nullable().optional(),
  captcha_token:    z.string().nullable().optional(),
})

export async function POST(req: Request) {
  const guard = await guardPublicRoute(req, 'reservation-chambre', { windowMs: 60_000, max: 10 })
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

  // Validation cohérence dates
  if (p.date_arrivee >= p.date_depart) {
    return Response.json({ error: 'Date départ doit être après date arrivée' }, { status: 400, headers: cors })
  }

  const sb = await createClient()

  // Vérifie dispo (pas de conflit avec autres réservations confirmées)
  const { data: conflits } = await sb.from('reservations_chambres')
    .select('id')
    .eq('chambre_id', p.chambre_id)
    .in('statut', ['demande', 'confirmee'])
    .lt('date_arrivee', p.date_depart)
    .gt('date_depart', p.date_arrivee)

  if (conflits && conflits.length > 0) {
    return Response.json({
      error: 'Cette chambre n\'est pas disponible sur ces dates. Choisissez d\'autres dates.',
    }, { status: 409, headers: cors })
  }

  // Récupère prix + nom de la chambre
  const { data: chambre } = await sb.from('chambres')
    .select('prix_nuit_ht, nom').eq('id', p.chambre_id).maybeSingle()
  const prixHT = Number(chambre?.prix_nuit_ht ?? 0)
  const chambreNom = chambre?.nom ?? 'Chambre'

  // Lie au client existant si email correspond
  let clientId: string | null = null
  try {
    const { data: existingClient } = await sb.from('clients')
      .select('id').eq('email', p.email).maybeSingle()
    clientId = (existingClient?.id as string) ?? null
  } catch {}

  // Calcul nb nuits
  const nuits = Math.ceil(
    (new Date(p.date_depart).getTime() - new Date(p.date_arrivee).getTime()) / (1000 * 60 * 60 * 24)
  )
  const totalTTC = Math.round(prixHT * 1.10 * nuits * 100) / 100  // TVA hôtellerie 10%

  const { data, error } = await sb.from('reservations_chambres').insert({
    chambre_id: p.chambre_id,
    client_id: clientId,
    client_nom: `${p.prenom ?? ''} ${p.nom}`.trim(),
    client_email: p.email,
    client_telephone: p.telephone,
    date_arrivee: p.date_arrivee,
    date_depart: p.date_depart,
    nb_personnes: p.nb_personnes,
    montant_total: totalTTC,
    acompte_verse: 0,
    statut: 'demande',
    notes: p.message || null,
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
          titre: '🛏 Nouvelle demande chambre',
          message: `${p.prenom ?? ''} ${p.nom} · ${nuits} nuit(s) · ${p.date_arrivee} → ${p.date_depart} · ${totalTTC.toFixed(2)} €`,
          url_action: '/admin/reservations',
        }))
      )
    }
  } catch (e) { console.error('[notif-resa-chambre] :', e) }

  // Email confirmation client (best-effort)
  const acompte = Math.round(totalTTC * 0.30 * 100) / 100
  if (p.email) {
    try {
      const { sendEmail, emailConfirmationReservationChambre } = await import('@/lib/email')
      const tpl = emailConfirmationReservationChambre({
        chambre_nom: chambreNom,
        date_arrivee: p.date_arrivee,
        date_depart: p.date_depart,
        nuits,
        montant_total: totalTTC,
        acompte,
        client_prenom: p.prenom ?? null,
        client_nom: p.nom,
      })
      await sendEmail({ to: p.email, subject: tpl.subject, html: tpl.html, text: tpl.text })
    } catch (e) {
      console.error('[email-resa-chambre] :', e)
    }
  }

  return Response.json({
    id: data.id,
    statut: 'demande',
    nuits,
    montant_total: totalTTC,
    acompte_a_verser: acompte,
  }, { headers: cors })
}
