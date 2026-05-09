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
