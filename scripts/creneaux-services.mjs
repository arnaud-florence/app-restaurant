// Les créneaux de commande en ligne DÉRIVENT des services, ils ne se tapent pas.
//
//   PORT=3000 node scripts/creneaux-services.mjs [--ecrire]
//
// `capacite_cuisine_par_creneau` pilote les créneaux proposés au client.
// Ses lignes dataient du prototype et disaient PIZZA le midi 11h30-14h, plus
// un lundi jusqu'à 23h59 — alors que la règle du gérant est « pizzeria le
// SOIR, 7 jours sur 7 ». Deux sources pour la même vérité finissent toujours
// par se contredire, et c'est le client qui voit la contradiction : il choisit
// une heure à laquelle personne n'allume le four.
//
// La source unique est `src/lib/services-restaurant.ts`. On la lit par
// /api/public/activation plutôt que de la recopier ici — une constante
// recopiée dans un script est une troisième source, pas une simplification.
//
// ⚠️ La capacité se compte en ARTICLES, pas en commandes (0153) : le gérant
// tient **4 pizzas par quart d'heure**. Compter les commandes laisserait
// passer quatre clients de trois pizzas — douze pizzas dans le même créneau,
// avec un réglage qui affiche pourtant « 4 ».

import fs from 'node:fs'
const env = {}
for (const l of fs.readFileSync('.env.local', 'utf8').split('\n')) {
  const i = l.indexOf('='); if (i < 0 || l.trim().startsWith('#')) continue
  env[l.slice(0, i).trim()] = l.slice(i + 1).trim().replace(/^["']|["']$/g, '')
}
const U = env.NEXT_PUBLIC_SUPABASE_URL, K = env.SUPABASE_SERVICE_ROLE_KEY
const PORT = process.env.PORT ?? '3000'
const ECRIRE = process.argv.includes('--ecrire')
const sb = async (p, o = {}) => {
  const r = await fetch(U + '/rest/v1/' + p, { ...o, headers: {
    apikey: K, Authorization: `Bearer ${K}`, 'Content-Type': 'application/json',
    Prefer: 'return=representation', ...(o.headers || {}) } })
  const t = await r.text(); const j = t ? JSON.parse(t) : null
  if (!r.ok) throw new Error(j?.message ?? `HTTP ${r.status}`)
  return j
}

const rep = await fetch(`http://localhost:${PORT}/api/public/activation`,
  { headers: { 'x-api-key': env.PUBLIC_API_KEY } })
if (!rep.ok) {
  console.error(`\n  ✗ /api/public/activation : HTTP ${rep.status}. Le serveur de dev doit tourner.\n`)
  process.exit(1)
}
const { services } = await rep.json()
if (!services?.par_tag) { console.error('\n  ✗ réponse sans services\n'); process.exit(1) }

const JOURS = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi']
const DUREE = 15

/** Articles produits par créneau, arrêté par le gérant le 23/09/2026. */
const CAPACITE = { PIZZA: 4 }

console.log(`\n── ${ECRIRE ? 'ÉCRITURE' : 'ESSAI À BLANC'} ──\n`)

// Les tags réellement commandables en ligne : un créneau pour une carte que
// personne ne peut commander n'aurait aucun effet, sinon celui de nourrir un
// écran d'administration avec du bruit.
const produits = await sb('recettes?select=tag_destination,vendable_online&actif=eq.true&vendable_online=eq.true')
const enLigne = new Set(produits.map(p => p.tag_destination))
const existant = await sb('capacite_cuisine_par_creneau?select=*')

const voulus = []
for (const [tag, creneaux] of Object.entries(services.par_tag)) {
  if (!enLigne.has(tag)) {
    console.log(`  · ${tag} : aucun produit vendable en ligne — pas de créneau`)
    continue
  }
  for (const { service, jours } of creneaux) {
    const h = services.horaires[service]
    // ⚠️ La capacité est la MÊME tous les jours d'un service : un four ne
    // change pas de taille le dimanche. La reprendre ligne à ligne donnait 8
    // le dimanche et 10 le reste de la semaine — un écart hérité d'un vieux
    // jeu de données, que personne n'aurait pu expliquer.
    const capacite = CAPACITE[tag] ?? 4
    for (const j of jours) {
      voulus.push({
        tag_destination: tag, jour_semaine: j,
        heure_debut: `${h.debut}:00`, heure_fin: `${h.fin}:00`,
        duree_creneau_min: DUREE, max_articles: capacite,
        etablissement_id: null, actif: true,
      })
    }
  }
}

const parTag = {}
for (const v of voulus) (parTag[v.tag_destination] ??= []).push(v)
for (const [tag, l] of Object.entries(parTag)) {
  console.log(`\n  ${tag} — ${l.length} plage(s), ${DUREE} min par créneau`)
  for (const v of l.sort((a, b) => a.jour_semaine - b.jour_semaine))
    console.log(`     ${JOURS[v.jour_semaine].padEnd(10)} ${v.heure_debut.slice(0, 5)}–${v.heure_fin.slice(0, 5)}   max ${v.max_articles} articles / créneau`)
}

// Ce qui ne correspond à aucun service ni à aucun produit : on DÉSACTIVE, on
// ne supprime pas. Une capacité effacée ne se retrouve pas ; une capacité
// éteinte se rallume.
const aEteindre = existant.filter(x => x.actif && !voulus.some(v =>
  v.tag_destination === x.tag_destination && v.jour_semaine === x.jour_semaine))
if (aEteindre.length) {
  const t = {}
  for (const x of aEteindre) t[x.tag_destination] = (t[x.tag_destination] ?? 0) + 1
  console.log(`\n  À désactiver — plus aucun service ni produit en face :`)
  for (const [k, n] of Object.entries(t)) console.log(`     ${k} : ${n} plage(s)`)
}

console.log(`\n  La capacité se compte en ARTICLES, pas en commandes :`)
for (const [tag, l] of Object.entries(parTag))
  console.log(`     ${tag} : ${l[0].max_articles} articles par créneau de ${DUREE} min = ${l[0].max_articles * (60 / DUREE)} l'heure.`)

if (!ECRIRE) { console.log('\n  (rien écrit — relancer avec --ecrire)\n'); process.exit(0) }

for (const x of aEteindre)
  await sb('capacite_cuisine_par_creneau?id=eq.' + x.id, { method: 'PATCH', body: JSON.stringify({ actif: false }) })
for (const tag of Object.keys(parTag))
  await sb(`capacite_cuisine_par_creneau?tag_destination=eq.${tag}`, { method: 'DELETE' })
await sb('capacite_cuisine_par_creneau', { method: 'POST', body: JSON.stringify(voulus) })
console.log(`\n  → ${voulus.length} plage(s) écrite(s), ${aEteindre.length} désactivée(s).\n`)
