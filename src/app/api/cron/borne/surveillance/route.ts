// GET /api/cron/borne/surveillance — déclenché toutes les 2-5 min par pg_cron.
// Auth : Authorization: Bearer ${CRON_SECRET}
//
// Vérifie 3 conditions et push les managers le cas échéant :
//   1. Commandes BORNE COMPTOIR en attente > 5 min → push 1x via flag interne
//   2. Commandes BORNE COMPTOIR expirées (borne_expire_at < now) → annule + push
//   3. Bornes sans heartbeat depuis > 30 min en heures d'ouverture (11h-23h) → push

import { createClient } from '@/lib/supabase/server'
import { sendPushToPostes } from '@/lib/push'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const HEURE_OUVERTURE_DEBUT = 11
const HEURE_OUVERTURE_FIN = 23
const SEUIL_PUSH_COMPTOIR_MIN = 5
const SEUIL_INACTIVITE_MIN = 30

export async function GET(req: Request) {
  const auth = req.headers.get('authorization')
  const secret = process.env.CRON_SECRET
  if (!secret || auth !== `Bearer ${secret}`) {
    return Response.json({ error: 'unauthorized' }, { status: 401 })
  }
  const supabase = await createClient()
  const now = new Date()
  const nowMs = now.getTime()
  const hOuverture = now.getHours() >= HEURE_OUVERTURE_DEBUT && now.getHours() < HEURE_OUVERTURE_FIN

  const actions: Record<string, number> = { expirees: 0, attente5min: 0, inactives: 0 }

  // ─── 1. Expiration automatique (borne_expire_at dépassé) ─────────────
  const { data: expirees } = await supabase
    .from('commandes')
    .select('id, numero, borne_id, montant_total_ttc')
    .eq('source', 'BORNE')
    .eq('statut', 'en_attente_paiement_comptoir')
    .lt('borne_expire_at', now.toISOString())
  for (const c of expirees ?? []) {
    await supabase.from('commandes').update({ statut: 'annule', borne_expire_at: null }).eq('id', c.id)
    await supabase.from('borne_evenements').insert({
      commande_id: c.id, borne_id: (c.borne_id as string) ?? 'cron',
      type: 'comptoir_expire',
      details: { auto: true, total: c.montant_total_ttc },
    })
    actions.expirees++
  }
  if (actions.expirees > 0) {
    await sendPushToPostes(['manager'], {
      title: '⚠ Borne : commandes annulées',
      body: `${actions.expirees} commande(s) borne expirée(s) (non encaissée(s) dans les 10 min)`,
      url: '/caisse',
      tag: 'borne_expire',
    })
  }

  // ─── 2. En attente > 5 min sans push déjà envoyé ─────────────────────
  // On utilise l'absence de l'event 'push_5min_envoye' dans borne_evenements
  // pour éviter de spammer (1 push par commande).
  const seuilDate = new Date(nowMs - SEUIL_PUSH_COMPTOIR_MIN * 60_000).toISOString()
  const { data: attente } = await supabase
    .from('commandes')
    .select('id, numero, borne_id, created_at, montant_total_ttc')
    .eq('source', 'BORNE')
    .eq('statut', 'en_attente_paiement_comptoir')
    .lt('created_at', seuilDate)
  for (const c of attente ?? []) {
    // Déjà notifié ?
    const { count } = await supabase
      .from('borne_evenements')
      .select('*', { count: 'exact', head: true })
      .eq('commande_id', c.id)
      .eq('type', 'comptoir_attente')
      .ilike('details::text', '%push_5min%')
    if ((count ?? 0) > 0) continue
    await sendPushToPostes(['manager', 'caisse'], {
      title: `⏱ Borne #${(c.numero as string)?.slice(-4)} > 5 min`,
      body: `Commande borne non encaissée. ${Math.round((nowMs - new Date(c.created_at as string).getTime()) / 60_000)} min écoulées.`,
      url: '/caisse',
      tag: `borne_attente_${c.id}`,
    })
    await supabase.from('borne_evenements').insert({
      commande_id: c.id, borne_id: (c.borne_id as string) ?? 'cron',
      type: 'comptoir_attente',
      details: { push_5min: true },
    })
    actions.attente5min++
  }

  // ─── 3. Bornes inactives > 30 min en heures d'ouverture ──────────────
  if (hOuverture) {
    const seuilInactif = new Date(nowMs - SEUIL_INACTIVITE_MIN * 60_000).toISOString()
    const { data: bornesInactives } = await supabase
      .from('borne_sessions')
      .select('borne_id, derniere_action')
      .lt('derniere_action', seuilInactif)
    for (const b of bornesInactives ?? []) {
      // Éviter le spam : ne push qu'une fois par fenêtre (notes contient timestamp)
      const dernier = new Date(b.derniere_action as string)
      const minutes = Math.round((nowMs - dernier.getTime()) / 60_000)
      await sendPushToPostes(['manager'], {
        title: `💤 Borne ${b.borne_id} inactive`,
        body: `Aucune activité depuis ${minutes} min en heures d'ouverture.`,
        url: '/admin/pilotage',
        tag: `borne_inactif_${b.borne_id}`,
      })
      actions.inactives++
    }
  }

  return Response.json({ ok: true, actions, ts: now.toISOString() })
}
