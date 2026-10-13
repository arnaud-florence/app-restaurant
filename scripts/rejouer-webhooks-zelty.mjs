// Rejouer les webhooks Zelty rejetés — le journal est là pour ça (0137).
//
// « Le brut permet de REJOUER » : chaque échange laisse sa charge utile
// ENTIÈRE dans `integration_evenements`. Le 12/10/2026, 54 ventes réelles
// (300,10 €) ont été refusées par un schéma trop rigide ; une fois le schéma
// corrigé, elles se réinjectent sans rien redemander à la caisse.
//
// ⚠️ C'est SÛR parce que la chaîne est idempotente : `encaissements_externes`
// porte une contrainte unique (source_caisse, ticket_externe). Rejouer un
// ticket déjà entré ne le double pas. Sans cette garantie, rejouer serait
// pire que de n'avoir rien — un CA doublé ne se signale pas.
//
// ⚠️ On repasse par la VRAIE route, signature comprise : c'est le seul moyen
// d'exercer le chemin réel. Réécrire les encaissements à la main validerait
// un code que la production n'emprunte pas.
//
//   node scripts/rejouer-webhooks-zelty.mjs [--un] [--ecrire] [--depuis=AAAA-MM-JJ]
import { readFileSync } from 'node:fs'
import crypto from 'node:crypto'

const UN = process.argv.includes('--un')
const ECRIRE = process.argv.includes('--ecrire')
const DEPUIS = (process.argv.find(a => a.startsWith('--depuis=')) ?? '--depuis=2026-10-11').slice(9)
const URL = process.env.CIBLE ?? 'https://app-restaurant-livid.vercel.app'

const env = {}
for (const l of readFileSync('.env.local', 'utf8').split('\n')) {
  const i = l.indexOf('='); if (i < 0 || l.trim().startsWith('#')) continue
  env[l.slice(0, i).trim()] = l.slice(i + 1).trim().replace(/^["']|["']$/g, '')
}
const SECRET = env.ZELTY_WEBHOOK_SECRET
if (!SECRET) throw new Error('ZELTY_WEBHOOK_SECRET absent de .env.local')

const sb = async c => {
  const r = await fetch(`${env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/${c}`,
    { headers: { apikey: env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
                 Authorization: `Bearer ${env.NEXT_PUBLIC_SUPABASE_ANON_KEY}` } })
  const t = await r.text()
  if (!r.ok) throw new Error(`Supabase ${r.status} :: ${t.slice(0, 200)}`)
  return JSON.parse(t)
}

const ev = await sb(`integration_evenements?select=id,created_at,payload,statut,erreur&systeme=eq.zelty&type=eq.webhook&reference=eq.order.ended&created_at=gte.${DEPUIS}&order=created_at.asc`)
console.log(`\n🔁 ${ev.length} événement(s) order.ended depuis le ${DEPUIS}`)
console.log(`   cible : ${URL}`)
console.log(ECRIRE ? '   MODE ÉCRITURE\n' : '   essai à blanc (--ecrire pour rejouer)\n')

// On ne rejoue que les ventes TERMINÉES (255). Les annulées seraient refusées
// par le mapper de toute façon ; les renvoyer ne ferait que du bruit.
const aRejouer = []
for (const e of ev) {
  const p = typeof e.payload === 'string' ? JSON.parse(e.payload) : e.payload
  const d = p?.data
  if (!d) { console.log(`   ⚠ ${e.created_at.slice(5,16)} charge sans « data » — ignoré`); continue }
  // ⚠️ La route lit `event_name` (pas `event`) : sans lui, l'événement tombe
  // dans « inconnu », tracé et jamais traité.
  if (!p.event_name) { console.log(`   ⚠ ${e.created_at.slice(5,16)} #${d.ref} sans « event_name » — ignoré`); continue }
  if (Number(d.status) !== 255) continue
  aRejouer.push({ e, p, d })
}
// ⚠️⚠️ CHAQUE REJEU LAISSE SA PROPRE TRACE DANS LE JOURNAL, donc le lot
// GROSSIT à chaque passage — 54 tickets au premier, 185 au troisième, et une
// commande qui dépasse les cinq minutes. On déduplique sur l'identifiant du
// TICKET, en gardant la trace la plus RÉCENTE : c'est elle qui porte l'état
// final de la commande.
const parTicket = new Map()
for (const x of aRejouer) parTicket.set(String(x.d.id), x)
aRejouer.length = 0
aRejouer.push(...parTicket.values())
console.log(`   ventes terminées à rejouer : ${aRejouer.length} · ` +
  `${(aRejouer.reduce((s,x)=>s+Number(x.d.price??x.d.total??0),0)/100).toFixed(2)} €\n`)

const lot = UN ? aRejouer.slice(0, 1) : aRejouer
if (!ECRIRE) {
  for (const { e, d } of lot) console.log(`   → #${d.ref} ${e.created_at.slice(5,16)} ${(Number(d.price)/100).toFixed(2)} € · ${(d.contents??[]).length} ligne(s)`)
  console.log('\nEssai à blanc — rien envoyé.\n'); process.exit(0)
}

let ok = 0, ko = 0
for (const { e, p, d } of lot) {
  // La signature porte sur les OCTETS envoyés : on signe la chaîne exacte.
  const brut = JSON.stringify(p)
  const sig = crypto.createHmac('sha256', SECRET).update(brut, 'utf8').digest('hex')
  const r = await fetch(`${URL}/api/integrations/zelty/webhook`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-zelty-hmac-sha256': sig },
    body: brut,
  })
  const txt = (await r.text()).slice(0, 200)
  const bon = r.status === 200 && !/rejet|invalid|inattendu/i.test(txt)
  console.log(`   ${bon ? '✓' : '✗'} #${String(d.ref).padEnd(3)} ${(Number(d.price)/100).toFixed(2).padStart(7)} € → HTTP ${r.status} ${txt.slice(0,110)}`)
  bon ? ok++ : ko++
  await new Promise(s => setTimeout(s, 400))   // on ne bourre pas notre propre route
}
console.log(`\n   ${ok} rejoué(s), ${ko} en échec\n`)
