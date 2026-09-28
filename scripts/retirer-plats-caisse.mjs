// Éteindre dans la caisse les plats retirés de notre carte.
//
//   node scripts/retirer-plats-caisse.mjs "Nom exact" ["Autre nom"] [--ecrire]
//
// Un produit désactivé chez nous reste un BOUTON sur la caisse tant que
// personne ne l'y éteint. Le 28/09/2026, les quatre Pago sortis de la carte
// y étaient toujours : l'équipe les aurait vendus le 3 octobre, sans stock
// derrière et sans que rien ne le signale.
//
// ⚠️⚠️ CE SCRIPT ÉTEINT `disable`, CE QUE LA 0141 INTERDIT — et il faut
// comprendre pourquoi ce n'est pas la même situation. L'interdit porte sur
// les RUPTURES : éteindre `disable` pour un produit momentanément épuisé
// ferait relire « plat inactif » par le miroir du catalogue, qui éteindrait
// la fiche chez nous, et le produit ne reviendrait jamais même
// réapprovisionné — une boucle silencieuse. Ici le produit est DÉJÀ
// `actif = false` chez nous, délibérément : le miroir ne fera que confirmer
// ce qui est déjà vrai. Il n'y a pas de boucle, il y a un alignement.
//
// ⚠️⚠️ L'ORDRE COMPTE, ET IL A ÉTÉ APPRIS À LA DURE. Désactiver d'abord
// chez nous ne tient pas : le miroir du catalogue relit Zelty et RÉTABLIT
// `actif` depuis `disable`, qui y est encore à faux. Les quatre Pago
// désactivés à 6 h étaient revenus actifs vingt minutes plus tard, sans que
// rien ne le signale — la caisse est maîtresse de cet interrupteur. On
// éteint donc LA CAISSE D'ABORD, notre fiche ensuite ; le miroir suivant ne
// fait plus que confirmer.
//
// ⚠️ Le script n'agit que sur des produits NOMMÉS en ligne de commande. Se
// fier à `actif = false` serait circulaire, puisque c'est précisément ce
// que le miroir rétablit. Une rupture momentanée passe par
// `(ops)/ruptures`, qui ne coupe que les canaux en ligne.
//
// ⚠️ `POST /catalog/dishes` reste un UPSERT qui exige `name`, `price` et
// `tax` : on RELIT le catalogue juste avant, on recopie ces trois champs
// tels quels, on ne touche QUE `disable`, et on refuse de construire s'il
// en manque un. Un objet incomplet écraserait le prix imprimé sur les
// tickets.

import fs from 'node:fs'

const ECRIRE = process.argv.includes('--ecrire')
const env = Object.fromEntries(fs.readFileSync(new URL('../.env.local', import.meta.url), 'utf8')
  .split('\n').filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, '')] }))
const U = env.NEXT_PUBLIC_SUPABASE_URL
const K = env.SUPABASE_SERVICE_ROLE_KEY || env.NEXT_PUBLIC_SUPABASE_ANON_KEY
const CLE = env.ZELTY_API_KEY
const BASE = (env.ZELTY_BASE_URL || 'https://api.zelty.fr/2.11').replace(/\/+$/, '')
if (!CLE) { console.error('⛔ ZELTY_API_KEY absente — rien à faire.'); process.exit(1) }

const sb = async c => {
  const r = await fetch(`${U}/rest/v1/${c}`, { headers: { apikey: K, Authorization: `Bearer ${K}` } })
  if (!r.ok) throw new Error(`${r.status} ${await r.text()}`)
  return r.json()
}
const zelty = async (chemin, init) => {
  const r = await fetch(`${BASE}${chemin}`, {
    ...init, headers: { Authorization: `Bearer ${CLE}`, 'Content-Type': 'application/json', ...(init?.headers ?? {}) } })
  const t = await r.text()
  if (!r.ok) throw new Error(`HTTP ${r.status} ${t.slice(0, 400)}`)
  return t ? JSON.parse(t) : null
}

const NOMS = process.argv.slice(2).filter(a => !a.startsWith('--'))
if (NOMS.length === 0) {
  console.error('⛔ Aucun produit nommé. Usage : node scripts/retirer-plats-caisse.mjs "Pago orange 33 cl" [--ecrire]')
  process.exit(1)
}

const recs = await sb('recettes?select=id,nom,actif&limit=1000')
const parId = new Map(recs.map(r => [r.id, r]))
const corr = await sb('correspondances_catalogue?systeme=eq.zelty&select=identifiant_externe,recette_id&limit=2000')

// ⚠️ `limit=0` renvoie TOUT chez Zelty, pas zéro — c'est documenté et
// contre-intuitif. Une liste vide serait une lecture ratée, pas un
// catalogue vide : on refuse d'agir dessus.
const { dishes } = await zelty('/catalog/dishes?lang=fr&limit=0')
if (!Array.isArray(dishes) || dishes.length < 50) {
  console.error(`⛔ ${dishes?.length ?? 0} plat(s) lus — c'est une lecture ratée, pas un catalogue. Rien n'est écrit.`)
  process.exit(1)
}

const majs = [], refus = [], ignores = []
for (const c of corr) {
  const nous = parId.get(c.recette_id)
  if (!nous) continue
  const plat = dishes.find(d => String(d.id) === String(c.identifiant_externe))
  if (!plat) { refus.push(`${nous.nom} : plat ${c.identifiant_externe} absent du catalogue caisse`); continue }
  // ⚠️ LE VERROU : on n'éteint QUE ce qui a été NOMMÉ.
  if (!NOMS.includes(nous.nom)) continue
  if (plat.disable === true) { ignores.push(nous.nom); continue }
  if (!plat.name || typeof plat.name !== 'string') { refus.push(`${nous.nom} : nom absent — refus de construire un upsert incomplet`); continue }
  if (plat.price == null || !Number.isFinite(Number(plat.price))) { refus.push(`${nous.nom} : prix absent — un upsert écraserait le prix en caisse`); continue }
  if (plat.tax == null || !Number.isFinite(Number(plat.tax))) { refus.push(`${nous.nom} : TVA absente — un upsert écraserait le taux en caisse`); continue }
  majs.push({ nom: nous.nom, charge: {
    id: Number(plat.id), name: plat.name, price: Number(plat.price), tax: Number(plat.tax), disable: true } })
}

console.log(`\n${ECRIRE ? '✍️  ÉCRITURE' : '👀 ESSAI À BLANC'} — ${dishes.length} plats lus dans la caisse\n`)
const introuvables = NOMS.filter(n => !majs.some(m => m.nom === n) && !ignores.includes(n))
console.log(`── ${majs.length} bouton(s) à éteindre ──\n`)
for (const m of majs) console.log(`  − ${m.nom.padEnd(24)} caisse #${m.charge.id}  « ${m.charge.name} »  ${(m.charge.price / 100).toFixed(2)} €  tva ${(m.charge.tax / 100).toFixed(1)} %`)
if (ignores.length) console.log(`\n  (${ignores.length} déjà éteint(s) : ${ignores.join(', ')})`)
if (refus.length) { console.log(`\n⚠️ ${refus.length} refus :`); refus.forEach(r => console.log('  ·', r)) }
if (introuvables.length) { console.log(`\n⚠️ nommé(s) mais sans plat en caisse : ${introuvables.join(', ')}`) }

if (!ECRIRE) { console.log('\nRien écrit. Relancer avec --ecrire.'); process.exit(0) }
if (majs.length === 0) { console.log('\nRien à éteindre.'); process.exit(0) }

// ⚠️ TABLEAU NU, pas `{dishes: [...]}` : enveloppé, l'API répond 400 en
// réclamant name/price/tax — elle ne voit aucun plat, et le message laisse
// croire à des champs manquants alors que c'est la FORME qui est fausse.
await zelty('/catalog/dishes?lang=fr', { method: 'POST', body: JSON.stringify(majs.map(m => m.charge)) })
console.log(`\n✅ ${majs.length} bouton(s) éteint(s) dans la caisse.`)

// La fiche suit la caisse, pas l'inverse — sinon le miroir la rallume.
for (const m of majs) {
  const r = recs.find(x => x.nom === m.nom)
  await fetch(`${U}/rest/v1/recettes?id=eq.${r.id}`, {
    method: 'PATCH', headers: { apikey: K, Authorization: `Bearer ${K}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ actif: false, nom_caisse: null, vendable_online: false }),
  })
}
console.log(`✅ ${majs.length} fiche(s) retirée(s) de notre carte.`)
