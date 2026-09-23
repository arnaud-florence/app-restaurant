// Réservation de table — le guichet public.
//
//   GET  ?date=YYYY-MM-DD  → première date réservable + créneaux de ce jour
//   POST                   → dépose une DEMANDE, que le manager valide
//
// ⚠️ LE CONTRÔLE QUI COMPTE EST ICI, pas dans le formulaire du site. Sans lui
// — et il a manqué jusqu'au 24/09/2026 — cette route acceptait n'importe
// quoi : une table pour hier, pour 4 h du matin, ou pour le 28 septembre dans
// un restaurant qui n'ouvre que le 3 octobre. Aucune erreur, une notification
// au manager, et un couple devant une porte fermée.

import { createClient } from '@/lib/supabase/server'
import { guardPublicRoute, corsHeaders, handleCorsOptions } from '@/lib/public-api/guard'
import { isHoneypotFilled, verifyHcaptcha } from '@/lib/public-api/anti-spam'
import { getClientIp } from '@/lib/public-api/rate-limit'
import { getActivation, getModules } from '@/lib/activation/server'
import {
  aujourdhuiParis, creneauxDuJour, premiereDateReservable, verifierReservation,
  phraseServices, normaliserHeure, COUVERTS_MIN, COUVERTS_MAX,
} from '@/lib/reservation-table'
import { z } from 'zod'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function OPTIONS(req: Request) { return handleCorsOptions(req) }

/** Depuis quand peut-on réserver, et jusqu'où.
 *
 *  Deux interrupteurs, et ils ne disent pas la même chose :
 *
 *  · `reservation_table` ouvre ou ferme LE GUICHET. C'est l'arrêt d'urgence du
 *    gérant — une semaine complète, des travaux, un service à sauver. Éteint,
 *    la route refuse TOUT : le couper dans l'admin sans que l'API le sache
 *    n'aurait masqué que le formulaire, et les demandes auraient continué
 *    d'arriver par un onglet resté ouvert ou un lien partagé.
 *
 *  · `restaurant_salle` porte la DATE d'ouverture. C'est la salle qui ouvre ;
 *    le guichet, lui, peut ouvrir avant — et c'est tout l'intérêt, puisqu'on
 *    remplit l'inauguration les jours qui la précèdent. */
async function fenetre() {
  const etat = await getActivation()
  const modules = await getModules()
  const salle = modules.find(m => m.cle === 'restaurant_salle')
  const aujourdhui = aujourdhuiParis()

  if (etat.reservation_table !== true) return { aujourdhui, premiereDate: null }

  return {
    aujourdhui,
    premiereDate: premiereDateReservable(
      etat.restaurant_salle === true,
      salle?.date_ouverture_prevue ?? null,
      aujourdhui,
    ),
  }
}

export async function GET(req: Request) {
  const guard = await guardPublicRoute(req, 'reservation-table', { windowMs: 60_000, max: 120 })
  if (!guard.ok) return guard.response

  const cors = corsHeaders(req.headers.get('origin'))
  const { aujourdhui, premiereDate } = await fenetre()
  const demandee = new URL(req.url).searchParams.get('date')

  if (demandee && !/^\d{4}-\d{2}-\d{2}$/.test(demandee)) {
    return Response.json({ error: 'date invalide (YYYY-MM-DD)' }, { status: 400, headers: cors })
  }
  // Le site n'a pas à choisir une date de repli : si la réservation n'est pas
  // ouverte, il n'y a pas de jour à montrer.
  const date = demandee ?? premiereDate
  if (!premiereDate || !date) {
    return Response.json(
      { ouvert: false, premiere_date: null, date: null, creneaux: [], phrase: null,
        couverts_min: COUVERTS_MIN, couverts_max: COUVERTS_MAX },
      { headers: cors },
    )
  }

  return Response.json({
    ouvert: true,
    premiere_date: premiereDate,
    aujourdhui,
    date,
    // Une date antérieure à l'ouverture ne rend AUCUN créneau : le site ne
    // doit jamais pouvoir afficher un horaire que le POST refusera.
    creneaux: date < premiereDate ? [] : creneauxDuJour(date),
    phrase: date < premiereDate ? null : phraseServices(date),
    couverts_min: COUVERTS_MIN,
    couverts_max: COUVERTS_MAX,
  }, { headers: cors })
}

// ⚠️ Les messages sont écrits en français, et adressés au CLIENT. Laissés à
// zod, ils sortaient tels quels sur le site : un visiteur qui oubliait son
// téléphone lisait « Invalid input » sur une page française.
const schema = z.object({
  date:             z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date manquante ou mal formée.'),
  heure:            z.string().regex(/^\d{2}:\d{2}/, 'Choisissez un horaire.'),
  nombre_personnes: z.coerce.number({ error: 'Indiquez le nombre de personnes.' })
                      .int('Indiquez un nombre entier de personnes.')
                      .min(1, 'Indiquez au moins une personne.')
                      .max(60, 'Indiquez un nombre de personnes réaliste.'),
  nom:              z.string().trim().min(1, 'Votre nom est nécessaire pour vous accueillir.').max(100),
  prenom:           z.string().trim().max(100).nullable().optional(),
  email:            z.string().email('Cette adresse email ne semble pas valide.').nullable().optional(),
  telephone:        z.string().trim()
                      .min(8, 'Un numéro de téléphone est nécessaire : c’est par là que nous confirmons.')
                      .max(40, 'Ce numéro de téléphone est trop long.'),
  message:          z.string().max(1000, 'Message trop long.').nullable().optional(),
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

  // ─── Le contrôle ───────────────────────────────────────────────────────
  const { premiereDate } = await fenetre()
  const verdict = verifierReservation({
    date: p.date, heure: p.heure, couverts: p.nombre_personnes, premiereDate,
  })
  if (!verdict.ok) {
    return Response.json({ error: verdict.motif }, { status: 400, headers: cors })
  }

  const sb = await createClient()
  const heure = normaliserHeure(p.heure)

  // ⚠️ LES NOMS DE COLONNES SONT CEUX DE LA MIGRATION 0035, pas ceux du
  // formulaire. Cette route écrivait `nom`, `email`, `telephone`,
  // `nombre_personnes`, `date_heure`, `canal` — huit colonnes sur onze
  // n'existent pas dans `reservations_tables`. Elle n'a donc JAMAIS abouti :
  // chaque demande serait repartie en 500. Personne ne s'en est aperçu parce
  // que le module était éteint et le formulaire inatteignable.
  const { data, error } = await sb.from('reservations_tables').insert({
    client_nom:       [p.prenom, p.nom].filter(Boolean).join(' ').trim(),
    client_email:     p.email || null,
    client_telephone: p.telephone,
    nb_personnes:     p.nombre_personnes,
    date_resa:        p.date,
    heure_arrivee:    heure,
    statut:           'demande',   // une demande, pas une table réservée : le manager valide
    notes:            p.message || null,
    canal:            'site_web',
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
          message: `${p.prenom ?? ''} ${p.nom} · ${p.nombre_personnes} pers · ${p.date} ${heure} (${verdict.service})`,
          url_action: '/admin/reservations',
        }))
      )
    }
  } catch (e) { console.error('[notif-resa-table] :', e) }

  return Response.json({ id: data.id, statut: 'demande', service: verdict.service }, { headers: cors })
}
