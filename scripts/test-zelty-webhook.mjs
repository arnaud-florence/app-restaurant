// Récepteur de webhooks Zelty.
//
// Cet endpoint ÉCRIT DES VENTES. Le test porte donc d'abord sur ce qu'il
// refuse : un corps non signé permettrait à n'importe qui de gonfler le
// chiffre d'affaires.
//
//   PORT=3000 node scripts/test-zelty-webhook.mjs
//
// Un secret de test est posé dans l'environnement du serveur de dev ; aucune
// vente n'est écrite (les commandes envoyées sont volontairement invalides
// pour le connecteur, ou nettoyées).

import fs from 'node:fs'
import crypto from 'node:crypto'

const env = {}
for (const l of fs.readFileSync('.env.local', 'utf8').split('\n')) {
  const i = l.indexOf('=')
  if (i < 0 || l.trim().startsWith('#')) continue
  env[l.slice(0, i).trim()] = l.slice(i + 1).trim().replace(/^['"]|['"]$/g, '')
}
const BASE = `http://localhost:${process.env.PORT ?? '3000'}`
const SECRET = env.ZELTY_WEBHOOK_SECRET

// ⚠️ Borne de nettoyage. Le cleanup supprimait TOUS les événements webhook du
// journal — y compris les vrais. Le 30/08/2026 il a effacé la trace du premier
// webhook réel de Zelty, celle-là même qui avait permis de découvrir le nom de
// l'en-tête de signature. Un test ne doit jamais détruire des données de
// production : on ne retire que ce qu'on a créé après cet instant.
const DEBUT = new Date().toISOString()

let ok = 0, ko = 0
const t = (nom, cond, detail = '') => {
  if (cond) { ok++; console.log(`  ✓ ${nom}`) }
  else { ko++; console.log(`  ✗ ${nom}${detail ? ` — ${detail}` : ''}`) }
}
const envoyer = async (corps, { signer = true, entete = 'x-zelty-signature', prefixe = '', b64 = false } = {}) => {
  const brut = JSON.stringify(corps)
  const h = { 'Content-Type': 'application/json' }
  if (signer && SECRET) {
    const sig = crypto.createHmac('sha256', SECRET).update(brut, 'utf8').digest(b64 ? 'base64' : 'hex')
    h[entete] = prefixe + sig
  }
  const r = await fetch(`${BASE}/api/integrations/zelty/webhook`, { method: 'POST', headers: h, body: brut })
  return { status: r.status, body: await r.json().catch(() => ({})) }
}

console.log('\n── Webhook Zelty ──\n')
if (!SECRET) {
  console.log('  ✗ ZELTY_WEBHOOK_SECRET absent de .env.local — posez-en un de test et relancez')
  process.exit(1)
}

// ── Ce qu'il REFUSE ─────────────────────────────────────────────────
let r = await envoyer({ event: 'order.ended' }, { signer: false })
t('un corps NON signé est refusé', r.status === 401, `HTTP ${r.status}`)

r = await envoyer({ event: 'order.ended' }, { entete: 'x-zelty-signature' })
const bonneSig = r.status
r = await fetch(`${BASE}/api/integrations/zelty/webhook`, {
  method: 'POST', headers: { 'Content-Type': 'application/json', 'x-zelty-signature': 'a'.repeat(64) },
  body: JSON.stringify({ event: 'order.ended' }),
})
t('une signature FAUSSE est refusée', r.status === 401, `HTTP ${r.status}`)

// Corps modifié après signature : la signature ne doit plus valoir.
const brut = JSON.stringify({ event: 'order.ended', montant: 10 })
const sig = crypto.createHmac('sha256', SECRET).update(brut, 'utf8').digest('hex')
r = await fetch(`${BASE}/api/integrations/zelty/webhook`, {
  method: 'POST', headers: { 'Content-Type': 'application/json', 'x-zelty-signature': sig },
  body: JSON.stringify({ event: 'order.ended', montant: 99999 }),
})
t('un corps ALTÉRÉ après signature est refusé', r.status === 401, `HTTP ${r.status}`)

// ── Ce qu'il accepte ────────────────────────────────────────────────
t('une signature hexadécimale valide passe', bonneSig === 200, `HTTP ${bonneSig}`)

r = await envoyer({ event: 'till.close', data: { id: 42 } }, { b64: true })
t('une signature base64 valide passe aussi', r.status === 200, `HTTP ${r.status}`)

r = await envoyer({ event: 'till.close', data: { id: 43 } }, { prefixe: 'sha256=' })
t('le préfixe « sha256= » est toléré', r.status === 200, `HTTP ${r.status}`)

r = await envoyer({ event: 'dish.availability_update', data: { id: 1974, disable: true } })
t('un événement non encore branché est accepté et tracé',
  r.status === 200 && r.body.evenement === 'dish.availability_update', JSON.stringify(r.body))

// ── L'enveloppe RÉELLE, telle que la spec OpenAPI la décrit ─────────
// Le champ est `event_name`, pas `event`, et les lignes sont dans
// `contents`, pas `items`. Lire les mauvais noms faisait tomber chaque
// webhook dans « inconnu », ou l'aurait traité sans une seule ligne : CA
// juste, stock et marges aveugles, et rien pour le signaler.
r = await envoyer({
  event_id: '00000000-0000-4000-8000-000000000000',
  event_name: 'dish.availability_update',
  created_at: '2026-08-28T09:00:00Z',
  version: '2', brand_id: 1, restaurant_id: 10445,
  data: { id: 1974, disable: true },
})
t('le champ `event_name` de la spec est reconnu',
  r.status === 200 && r.body.evenement === 'dish.availability_update',
  JSON.stringify(r.body))

// ── Journal ─────────────────────────────────────────────────────────
const U = env.NEXT_PUBLIC_SUPABASE_URL, K = env.SUPABASE_SERVICE_ROLE_KEY
const H = { apikey: K, Authorization: `Bearer ${K}`, 'Content-Type': 'application/json' }
const get = async p => { const j = await (await fetch(`${U}/rest/v1/${p}`, { headers: H })).json(); return Array.isArray(j) ? j : [] }
const ev = await get('integration_evenements?type=eq.webhook&order=created_at.desc&limit=20')
t('les échanges sont journalisés', ev.length >= 4, `${ev.length}`)
const refus = ev.find(e => e.statut === 'echec' && /signature/.test(e.erreur ?? ''))
t('un refus enregistre les NOMS d\'en-têtes reçus',
  Boolean(refus?.payload?.entetes_recus?.length), JSON.stringify(refus?.payload).slice(0, 120))
t("mais JAMAIS la valeur de la signature",
  !JSON.stringify(refus?.payload ?? {}).includes('x-zelty-signature') ||
  !JSON.stringify(refus?.payload?.entetes_recus ?? []).match(/[0-9a-f]{64}/),
  JSON.stringify(refus?.payload).slice(0, 160))

// ── Le VRAI en-tête de Zelty ────────────────────────────────────────
// Constaté sur un appel réel le 28/08/2026 : `x-zelty-hmac-sha256`. Il n'est
// pas documenté et ne figurait dans aucune de nos hypothèses — le premier
// webhook réel a donc été refusé en 401. Sans cette assertion, quelqu'un qui
// « nettoie » la liste des en-têtes rouvrirait la panne sans le savoir.
r = await envoyer({ event_name: 'order.ended', order: { id: 1, total: 100 } },
  { entete: 'x-zelty-hmac-sha256' })
t('l\'en-tête RÉEL de Zelty (x-zelty-hmac-sha256) est accepté', r.status === 200,
  `HTTP ${r.status} — c'est celui que Zelty envoie vraiment`)

// ── Cleanup ─────────────────────────────────────────────────────────
await fetch(`${U}/rest/v1/integration_evenements?type=eq.webhook&created_at=gte.${DEBUT}`,
  { method: 'DELETE', headers: H })
const reste = await get(`integration_evenements?select=id&type=eq.webhook&created_at=gte.${DEBUT}`)
t('cleanup complet (et seulement nos propres traces)', reste.length === 0, `${reste.length}`)

console.log(`\n── ${ok} ✓   ${ko} ✗ ──\n`)
process.exit(ko === 0 ? 0 : 1)
