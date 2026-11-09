#!/usr/bin/env node
/**
 * Coupe (ou rétablit) la commande en ligne des pizzas.
 *
 * Pourquoi : quatre commandes web réelles sont arrivées entre le 06 et le
 * 08/11/2026 — 196,40 €, quinze pizzas, trois livraisons à domicile — et
 * AUCUNE n'a été servie. Dix-huit notifications ont pourtant été émises :
 * toutes sont restées non lues. La cuisine travaille sur la caisse, où la
 * commande web n'entre pas (émission bloquée faute de pont). Le site prenait
 * donc des commandes que personne ne regardait.
 *
 * ⚠️ ON AGIT SUR `vendable_online`, PAS SUR LE MODULE `pizzeria`.
 *   - c'est le contrôle que la ROUTE applique, article par article
 *     (/api/public/commande : `if (!r.actif || !r.vendable_online)`), donc un
 *     onglet resté ouvert ne peut pas passer outre — une interface ne protège
 *     de rien ;
 *   - la pizzeria RESTE à la carte, visible, avec ses photos et ses prix : le
 *     menu public sert `vendable_online` pour distinguer « commandable » de
 *     « sur place uniquement ». Le client voit les pizzas et appelle ;
 *   - éteindre le module aurait fait réapparaître le teaser « ouverture le
 *     12 octobre » — une date passée — et vidé la carte du site.
 *
 * ⚠️ LE FOURNIL N'EST PAS TOUCHÉ. Ses 72 produits restent commandables : son
 * tunnel n'a jamais reçu une seule commande web depuis l'ouverture, donc il
 * n'a rien cassé, et la tournée de pain du matin est annoncée sur la page
 * d'accueil. La couper rendrait le site incohérent sans rien réparer.
 * `--aussi-fournil` étend la coupure si on le veut quand même.
 *
 *   node scripts/couper-commande-en-ligne.mjs                  # essai à blanc
 *   node scripts/couper-commande-en-ligne.mjs --ecrire
 *   node scripts/couper-commande-en-ligne.mjs --retablir --ecrire
 */
import { readFileSync } from 'fs'

const ECRIRE   = process.argv.includes('--ecrire')
const RETABLIR = process.argv.includes('--retablir')
const FOURNIL  = process.argv.includes('--aussi-fournil')
// ⚠️ `CIBLE` est la valeur qu'on ÉCRIT dans `vendable_online`, pas l'action.
// Première version : `!RETABLIR` — donc `true` quand on voulait COUPER. L'essai
// à blanc l'a dit (« 3 produits à basculer » au lieu de 16), et les 3 en question
// étaient LES TROIS BOUTEILLES DE VIN : le script aurait mis de l'alcool en vente
// en ligne, sans contrôle d'âge, ce que la 0144 interdit. Un drapeau inversé fait
// l'exact contraire de ce qu'on demande, et il ne lève aucune erreur.
const CIBLE    = RETABLIR           // couper → false · rétablir → true
const TAGS     = FOURNIL ? ['PIZZA', 'FOURNIL'] : ['PIZZA']

const env = {}
for (const l of readFileSync(new URL('../.env.local', import.meta.url), 'utf8').split('\n')) {
  const m = l.match(/^([A-Z_0-9]+)=(.*)$/)
  if (m) env[m[1]] = m[2].trim().replace(/^["']|["']$/g, '')
}
const U = env.NEXT_PUBLIC_SUPABASE_URL, K = env.NEXT_PUBLIC_SUPABASE_ANON_KEY
if (!U?.startsWith('https://') || !K) { console.error('✗ .env.local illisible'); process.exit(1) }
const H = { apikey: K, Authorization: `Bearer ${K}`, 'Content-Type': 'application/json', Prefer: 'return=representation' }
const sb = async (p, init) => {
  const r = await fetch(`${U}/rest/v1/${p}`, { headers: H, ...init })
  const t = await r.text()
  if (!r.ok) throw new Error(`${r.status} ${t}`)   // un 4xx ne se réessaie pas
  return t ? JSON.parse(t) : []
}

const sel = `recettes?select=id,nom,tag_destination,vendable_online&actif=eq.true&tag_destination=in.(${TAGS.join(',')})`
const avant = await sb(sel)
let aChanger = avant.filter(r => r.vendable_online !== CIBLE)

// ⚠️ GARDE-FOU DE SENS UNIQUE : ce script ne met JAMAIS d'alcool en ligne, même
// en mode --retablir. Pas de contrôle d'âge sur le click & collect (0144), et
// les trois bouteilles de vin portent le tag PIZZA — c'est le poste de
// production, pas une famille. Un garde-fou qui ne vaut que dans un sens est
// exactement ce qui manquait quand le drapeau était inversé.
const alcool = new Set((await sb('recettes?select=id&contient_alcool=eq.true')).map(r => r.id))
const ecartes = aChanger.filter(r => alcool.has(r.id) && CIBLE === true)
aChanger = aChanger.filter(r => !(alcool.has(r.id) && CIBLE === true))
if (ecartes.length) console.log('   ⚠ écartés (alcool, jamais en ligne) : ' + ecartes.map(r => r.nom).join(', '))

console.log(`${RETABLIR ? 'RÉTABLIR' : 'COUPER'} la commande en ligne · tags ${TAGS.join(' + ')}`)
for (const t of TAGS) {
  const g = avant.filter(r => r.tag_destination === t)
  console.log(`   ${t.padEnd(8)} ${g.length} actifs · ${g.filter(r => r.vendable_online).length} commandables aujourd'hui`)
}
console.log(`   → ${aChanger.length} produit(s) à basculer`)

if (!aChanger.length) { console.log('\n✓ déjà dans cet état — rien à faire'); process.exit(0) }
if (!ECRIRE) { console.log('\nRelancer avec --ecrire'); process.exit(0) }

await sb(`recettes?id=in.(${aChanger.map(r => r.id).join(',')})`, {
  method: 'PATCH', body: JSON.stringify({ vendable_online: CIBLE }),
})

// ⚠️ relecture : un PATCH qui répond 200 n'a pas prouvé son effet.
const apres = await sb(sel)
for (const t of TAGS) {
  const g = apres.filter(r => r.tag_destination === t)
  console.log(`\n✓ ${t} : ${g.filter(r => r.vendable_online).length} commandables sur ${g.length}`)
}
// contrôle croisé : ce qui n'était pas visé n'a pas bougé
const autres = await sb('recettes?select=tag_destination,vendable_online&actif=eq.true&tag_destination=not.in.(' + TAGS.join(',') + ')')
const fuite = autres.filter(r => r.vendable_online)
console.log(`✓ hors cible : ${fuite.length} produit(s) encore commandables` + (FOURNIL ? '' : ` (dont le Fournil, intact)`))
const ok = apres.every(r => r.vendable_online === CIBLE || (alcool.has(r.id) && !r.vendable_online))
console.log(ok ? '\n✓ terminé' : '\n✗ état inattendu')
process.exit(ok ? 0 : 1)
