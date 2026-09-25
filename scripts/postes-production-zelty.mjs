#!/usr/bin/env node
// Affecter chaque plat à son POSTE DE PRODUCTION dans Zelty.
//
// Sans ça, allumer les écrans de cuisine ne sert à rien : les 181 plats sont
// tous à `id_fabrication_place: 0`, donc TOUT tomberait sur le même écran —
// les pizzas chez le cuisinier, les croissants chez le pizzaiolo.
//
// ⚠️ LES POSTES SE CRÉENT À LA MAIN. `POST /fabrication-places` répond 404 :
// l'API sait les LIRE, pas les créer. Il faut donc les déclarer dans le
// back-office Zelty d'abord, puis lancer ce script — qui fait le seul travail
// pénible, affecter les plats un par un.
//
// ⚠️⚠️ `POST /catalog/dishes` EST UN UPSERT QUI EXIGE `name`, `price` ET
// `tax`. Un objet incomplet ÉCRASE le prix qui s'imprime sur les tickets. On
// RELIT donc le catalogue juste avant, on recopie ces trois champs tels
// quels, on ne touche QUE le poste, et on REFUSE de construire s'il en manque
// un. Aucun prix n'est jamais inventé. (Même règle que zelty/disponibilite.ts.)
//
// Usage : node scripts/postes-production-zelty.mjs [--ecrire]

import fs from 'node:fs'

const env = {}
for (const l of fs.readFileSync('.env.local', 'utf8').split('\n')) {
  const i = l.indexOf('='); if (i < 0 || l.trim().startsWith('#')) continue
  env[l.slice(0, i).trim()] = l.slice(i + 1).trim().replace(/^["']|["']$/g, '')
}
const Z = env.ZELTY_API_KEY
const U = env.NEXT_PUBLIC_SUPABASE_URL
const K = env.SUPABASE_SERVICE_ROLE_KEY || env.NEXT_PUBLIC_SUPABASE_ANON_KEY
const ECRIRE = process.argv.includes('--ecrire')

// ⚠️ Correspondance NOTRE poste → NOM du poste Zelty, tel qu'il sera créé
// dans le back-office. Les noms doivent concorder EXACTEMENT : un « Pizzeria »
// chez eux face à un « Pizza » ici laisserait les douze pizzas sans écran, et
// personne ne le remarquerait avant le premier service.
//
// FOURNIL et BAR n'ont volontairement PAS de poste : ils se servent au
// comptoir, sur l'écran de caisse. Trois iPad, trois rôles — caisse, cuisine,
// pizza.
const POSTES = {
  PIZZA:   'Pizza',
  CUISINE: 'Cuisine',
  FOURNIL: null,
  BAR:     null,
}

const zl = async (chemin, init) => {
  const r = await fetch(`https://api.zelty.fr/2.11/${chemin}`, {
    ...init,
    headers: { Authorization: `Bearer ${Z}`, 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
  })
  return { status: r.status, body: await r.json().catch(() => ({})) }
}
const sb = (c) => fetch(`${U}/rest/v1/${c}`, {
  headers: { apikey: K, Authorization: `Bearer ${K}` },
}).then(r => r.json())

console.log('\n── Postes de production Zelty ──\n')

// ─── 1. Les postes existent-ils ? ─────────────────────────────────────────
const places = (await zl('fabrication-places')).body?.data ?? []
console.log(`${places.length} poste(s) déclaré(s) chez Zelty :`)
for (const p of places) console.log(`   #${p.id}  ${p.name ?? p.label ?? '(sans nom)'}`)

const voulus = [...new Set(Object.values(POSTES).filter(Boolean))]
const parNom = new Map(places.map(p => [String(p.name ?? p.label ?? '').trim().toLowerCase(), p]))
const manquants = voulus.filter(n => !parNom.has(n.toLowerCase()))

if (manquants.length > 0) {
  console.log(`\n⚠️  À CRÉER DANS LE BACK-OFFICE ZELTY : ${manquants.join(', ')}`)
  console.log('    Configuration → Postes de production (ou « Lieux de fabrication »).')
  console.log('    ⚠️ Le nom doit être EXACTEMENT celui-ci — la correspondance se fait dessus.')
  console.log('\n    L\'API ne sait pas les créer (POST /fabrication-places → 404).')
  if (ECRIRE) { console.log('\n    Rien n\'est écrit tant que les postes n\'existent pas.\n'); process.exit(1) }
}

// ─── 2. Nos produits, et le poste qui leur revient ────────────────────────
const nos = await sb('recettes?select=id,nom,tag_destination&actif=eq.true')
const liens = await sb('correspondances_catalogue?select=recette_id,identifiant_externe&systeme=eq.zelty')
const parRecette = new Map((liens ?? []).map(l => [l.recette_id, String(l.identifiant_externe)]))

const plats = (await zl('catalog/dishes?limit=0')).body?.dishes ?? []
const parIdZelty = new Map(plats.map(p => [String(p.id), p]))

const aFaire = []
let sansLien = 0, dejaBon = 0, sansPoste = 0
const attendus = {}
for (const r of nos ?? []) {
  const nomPoste = POSTES[r.tag_destination]
  if (!nomPoste) { sansPoste++; continue }
  const idZ = parRecette.get(r.id)
  if (!idZ) { sansLien++; continue }
  const plat = parIdZelty.get(idZ)
  if (!plat) { sansLien++; continue }
  const cible = parNom.get(nomPoste.toLowerCase())
  // ⚠️ Le poste n'existe pas encore : on COMPTE quand même ce qui irait
  // dessus. Un essai à blanc qui répond « 0 à affecter » parce que la cible
  // manque ne dit rien d'utile — or c'est précisément le chiffre qu'on
  // regarde AVANT de créer les postes.
  if (!cible) { attendus[nomPoste] = (attendus[nomPoste] ?? 0) + 1; continue }
  if (String(plat.id_fabrication_place) === String(cible.id)) { dejaBon++; continue }

  // ⚠️ LE GARDE-FOU. On ne construit QUE si les trois champs obligatoires sont
  // lisibles. Un `name`, `price` ou `tax` manquant et l'upsert écraserait ce
  // qui s'imprime sur les tickets.
  if (plat.name == null || plat.price == null || plat.tax == null) {
    console.log(`   ⚠️ ${r.nom} : champ obligatoire illisible chez Zelty — IGNORÉ`)
    continue
  }
  aFaire.push({
    id: plat.id,
    name: plat.name,     // recopié tel quel
    price: plat.price,   // recopié tel quel
    tax: plat.tax,       // recopié tel quel
    id_fabrication_place: cible.id,
    _nom: r.nom, _poste: nomPoste,
  })
}

console.log(`\n${nos?.length ?? 0} produits actifs`)
console.log(`   ${sansPoste} au comptoir (Fournil, Bar) — pas d'écran de production`)
console.log(`   ${dejaBon} déjà sur le bon poste`)
if (sansLien) console.log(`   ⚠️ ${sansLien} sans correspondance Zelty — à pousser d'abord`)
console.log(`   ${aFaire.length} à affecter`)

const parPoste = {}
for (const a of aFaire) parPoste[a._poste] = (parPoste[a._poste] ?? 0) + 1
for (const [p, n] of Object.entries(parPoste)) console.log(`      → ${p} : ${n}`)
for (const [p, n] of Object.entries(attendus)) {
  console.log(`      → ${p} : ${n} EN ATTENTE (le poste n'existe pas encore)`)
}

if (!ECRIRE) {
  console.log('\n(essai à blanc — relancer avec --ecrire)\n')
  process.exit(0)
}
if (aFaire.length === 0) { console.log('\nRien à faire.\n'); process.exit(0) }

// ⚠️ UN SEUL APPEL avec un tableau. Zelty plafonne son débit et ne le
// documente pas : treize créations de familles à la file avaient donné cinq
// 429 à partir du cinquième appel.
// ⚠️ LE CORPS EST UN TABLEAU NU, pas `{dishes: [...]}`. Enveloppé, l'API
// répond 400 en réclamant `name`, `price` et `tax_id` — elle ne voit aucun
// plat, et le message laisse croire à des champs manquants alors que c'est
// la FORME qui est fausse. C'est ce que fait déjà l'émission des
// disponibilités, et c'est pour ça qu'elle passe.
const r = await zl('catalog/dishes', {
  method: 'POST',
  body: JSON.stringify(aFaire.map(({ _nom, _poste, ...d }) => d)),
})
console.log(`\n${r.status === 200 ? '✓' : '✗'} HTTP ${r.status}`)
if (r.status !== 200) console.log('   ' + JSON.stringify(r.body).slice(0, 300))
else console.log(`   ${aFaire.length} plat(s) affecté(s).\n`)
