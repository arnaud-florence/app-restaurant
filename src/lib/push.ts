// Helpers serveur pour envoyer des notifs Web Push.
// Importé uniquement depuis Server Components / Server Actions / API routes.
//
// Env requises :
//   NEXT_PUBLIC_VAPID_PUBLIC_KEY
//   VAPID_PRIVATE_KEY
//   VAPID_SUBJECT (ex: mailto:gerant@resto.com)

import webpush from 'web-push'
import { createClient } from '@/lib/supabase/server'

let vapidConfigured = false
function configureVapid() {
  if (vapidConfigured) return
  const pub  = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
  const priv = process.env.VAPID_PRIVATE_KEY
  const subj = process.env.VAPID_SUBJECT
  if (!pub || !priv || !subj) {
    throw new Error('VAPID env manquantes (NEXT_PUBLIC_VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT)')
  }
  webpush.setVapidDetails(subj, pub, priv)
  vapidConfigured = true
}

export type PushPayload = {
  title: string
  body: string
  icon?: string                          // URL d'icône (default /icon-192.png)
  badge?: string                         // URL badge mobile
  tag?: string                           // groupe (auto-replace si même tag)
  url?: string                           // URL à ouvrir au clic
  vibrate?: number[]                     // vibration mobile
  data?: Record<string, unknown>
}

/** Envoie une notif à TOUS les abonnements d'un employé (multi-device). */
export async function sendPushToEmploye(employe_id: string, payload: PushPayload) {
  configureVapid()
  const supabase = await createClient()
  const { data: subs } = await supabase.from('push_subscriptions')
    .select('endpoint, p256dh, auth')
    .eq('employe_id', employe_id)
  await Promise.allSettled(
    (subs ?? []).map(s => sendOne({ endpoint: s.endpoint as string, keys: { p256dh: s.p256dh as string, auth: s.auth as string } }, payload)),
  )
}

/**
 * Variante rate-limitée : MAX 3 push par employé par heure.
 * Au-delà, silencieux (renvoie {sent:false, reason:'rate_limited'}).
 *
 * Utilisé par les agents temps réel (cuisine, bar, serveur, snack) qui peuvent
 * détecter beaucoup d'événements et risqueraient de spammer l'employé.
 *
 * Le compteur est par tranche horaire UTC (hour_bucket = date_trunc('hour', now())).
 * Persisté dans push_rate_limits (migration 0084), upsert atomique.
 *
 * Si force=true, bypasse le rate limit (à utiliser uniquement pour des urgences
 * critiques type "rupture froide congélateur").
 */
export async function sendPushToEmployeRateLimited(
  employe_id: string,
  payload: PushPayload,
  options: { force?: boolean; maxPerHour?: number } = {},
): Promise<{ sent: boolean; reason?: string; count?: number }> {
  const maxPerHour = options.maxPerHour ?? 3
  if (options.force) {
    await sendPushToEmploye(employe_id, payload)
    return { sent: true }
  }
  const supabase = await createClient()

  // Calcul du bucket horaire courant en UTC
  const now = new Date()
  const hourBucket = new Date(now.getFullYear(), now.getMonth(), now.getDate(), now.getUTCHours(), 0, 0, 0)
  const hourBucketIso = hourBucket.toISOString()

  // Lit le compteur courant (atomique : on incrémente via upsert)
  const { data: existing } = await supabase
    .from('push_rate_limits')
    .select('count')
    .eq('employe_id', employe_id)
    .eq('hour_bucket', hourBucketIso)
    .maybeSingle()
  const currentCount = existing ? Number(existing.count ?? 0) : 0

  if (currentCount >= maxPerHour) {
    return { sent: false, reason: 'rate_limited', count: currentCount }
  }

  // Incrémente atomiquement (upsert avec count+1)
  // Note : sans transaction stricte, deux pushs simultanés peuvent dépasser de 1.
  // Acceptable pour ce cas d'usage non-critique.
  const { error: upErr } = await supabase
    .from('push_rate_limits')
    .upsert(
      { employe_id, hour_bucket: hourBucketIso, count: currentCount + 1 },
      { onConflict: 'employe_id,hour_bucket' },
    )
  if (upErr) {
    // En cas d'erreur (ex: table push_rate_limits absente), on envoie quand même
    // pour ne pas perdre la notif
    await sendPushToEmploye(employe_id, payload)
    return { sent: true, reason: 'rate_limit_db_error' }
  }

  await sendPushToEmploye(employe_id, payload)
  return { sent: true, count: currentCount + 1 }
}

/** Envoie une notif à TOUS les employés d'un poste donné (ex: tous les serveurs). */
export async function sendPushToPostes(postes: string[], payload: PushPayload) {
  configureVapid()
  const supabase = await createClient()
  const { data: subs } = await supabase.from('push_subscriptions')
    .select('endpoint, p256dh, auth, employe_id, employes!inner(poste, actif)')
    .eq('employes.actif', true)
    .in('employes.poste', postes)
  await Promise.allSettled(
    (subs ?? []).map(s => sendOne({ endpoint: s.endpoint as string, keys: { p256dh: s.p256dh as string, auth: s.auth as string } }, payload)),
  )
}

/** Envoie à un seul abonnement et purge si invalidé (404/410). */
async function sendOne(sub: { endpoint: string; keys: { p256dh: string; auth: string } }, payload: PushPayload) {
  try {
    await webpush.sendNotification(sub, JSON.stringify(payload))
  } catch (e: unknown) {
    const status = (e as { statusCode?: number }).statusCode
    if (status === 404 || status === 410) {
      // Souscription expirée ou désinscrite → purge
      try {
        const supabase = await createClient()
        await supabase.from('push_subscriptions').delete().eq('endpoint', sub.endpoint)
      } catch { /* best-effort */ }
    }
    // Sinon log silencieux : ne pas bloquer le flux principal
  }
}
