#!/usr/bin/env node
/**
 * Clôture WEB-261021-8908 — la commande web du 21/10/2026 jamais servie.
 *
 * ⚠️⚠️ ANNULE, JAMAIS ENCAISSE. Rien n'a été servi, rien n'a été payé : la
 * passer en `encaisse` injecterait 33,40 € de chiffre d'affaires qui n'existe
 * pas, et le CA ne se corrige pas tout seul. `annule` est la seule valeur
 * honnête — et c'est aussi l'un des deux seuls statuts qui font disparaître
 * une commande des écrans (RÈGLE D'OR, voir CLAUDE.md §5).
 *
 * ⚠️ Aucun stock à restaurer : le trigger du module 7 déduit les ingrédients
 * au passage d'un article à `servi`. Ces deux pizzas n'ont jamais quitté
 * `en_attente`, donc aucun `mouvements_stock` n'a été écrit.
 *
 * ⚠️ Aucune ligne n'est touchée dans `encaissements_externes` : la caisse
 * agréée n'a jamais vu cette commande, et inventer un ticket ferait croire au
 * rapprochement quotidien (0139) qu'il en existe un.
 *
 * Idempotent : si le statut n'est plus `en_attente`, le script sort sans rien
 * écrire. Il RELIT après écriture — on ne conclut pas sur un code 200.
 *
 *   node scripts/cloturer-commande-web-2110.mjs            # essai à blanc
 *   node scripts/cloturer-commande-web-2110.mjs --ecrire
 */
import { readFileSync } from 'fs'

const ECRIRE = process.argv.includes('--ecrire')
const NUMERO = 'WEB-261021-8908'

const env = {}
for (const l of readFileSync(new URL('../.env.local', import.meta.url), 'utf8').split('\n')) {
  const m = l.match(/^([A-Z_0-9]+)=(.*)$/)
  // ⚠️ les valeurs de .env.local sont entre guillemets : les garder donne
  // `"https://…` et fetch lève ERR_INVALID_URL (défaut vécu deux fois).
  if (m) env[m[1]] = m[2].trim().replace(/^["']|["']$/g, '')
}
const U = env.NEXT_PUBLIC_SUPABASE_URL
const K = env.NEXT_PUBLIC_SUPABASE_ANON_KEY
if (!U?.startsWith('https://') || !K) {
  console.error('✗ NEXT_PUBLIC_SUPABASE_URL / _ANON_KEY illisibles dans .env.local')
  process.exit(1)
}
const H = { apikey: K, Authorization: `Bearer ${K}`, 'Content-Type': 'application/json', Prefer: 'return=representation' }
const sb = async (p, init) => {
  const r = await fetch(`${U}/rest/v1/${p}`, { headers: H, ...init })
  const t = await r.text()
  // ⚠️ un 4xx ne se réessaie pas : il ne changera pas d'avis, et le rejouer
  // fait annoncer « Supabase injoignable » sur une cause qui n'est pas là.
  if (!r.ok) throw new Error(`${r.status} ${t}`)
  return t ? JSON.parse(t) : []
}

const [c] = await sb(`commandes?numero=eq.${NUMERO}&select=id,statut,notes,montant_total_ttc,creneau_retrait`)
if (!c) { console.error(`✗ ${NUMERO} introuvable`); process.exit(1) }
if (c.statut !== 'en_attente') {
  console.log(`✓ déjà clôturée (statut « ${c.statut} ») — rien à faire`)
  process.exit(0)
}

const arts = await sb(`commande_articles?commande_id=eq.${c.id}&select=quantite,prix_unitaire_ttc,statut,recettes(nom)`)
console.log(`${NUMERO} · ${c.montant_total_ttc} € · créneau ${c.creneau_retrait}`)
for (const a of arts) console.log(`   ${a.quantite} × ${a.recettes?.nom} · ${a.prix_unitaire_ttc} € · ${a.statut}`)

const NOTE = 'Annulée le 04/11/2026 : commande jamais vue ni servie (restée en_attente depuis le 21/10/2026). '
  + 'Cause : la cuisine travaille sur la caisse, où la commande web n\'entre pas — émission bloquée faute de mode '
  + 'de paiement déclaré. Client prévenu. Aucun encaissement, aucune sortie de stock, aucun ticket en caisse.'

if (!ECRIRE) {
  console.log('\n— essai à blanc —')
  console.log('  commande + 2 articles → statut « annule »')
  console.log('  note ajoutée :', NOTE)
  console.log('\nRelancer avec --ecrire')
  process.exit(0)
}

await sb(`commande_articles?commande_id=eq.${c.id}`, { method: 'PATCH', body: JSON.stringify({ statut: 'annule' }) })
await sb(`commandes?id=eq.${c.id}`, {
  method: 'PATCH',
  body: JSON.stringify({ statut: 'annule', notes: [c.notes, NOTE].filter(Boolean).join('\n') }),
})

// ⚠️ relecture obligatoire : un PATCH qui répond 200 n'a pas prouvé son effet.
const [v] = await sb(`commandes?numero=eq.${NUMERO}&select=numero,statut`)
const va = await sb(`commande_articles?commande_id=eq.${c.id}&select=statut`)
const enc = await sb(`encaissements_externes?select=id&ticket_externe=eq.${NUMERO}&limit=1`)
console.log(`\n✓ ${v.numero} · ${v.statut} · articles ${va.map(x => x.statut).join('/')}`)
console.log(`✓ aucun encaissement rattaché : ${enc.length === 0}`)
if (v.statut !== 'annule' || va.some(x => x.statut !== 'annule')) process.exit(1)
