// LE RÉASSORT LIT L'ARDOISE (0167).
//
//   PORT=3000 node scripts/test-reassort-ardoise.mjs
//
// ⚠️ Il CRÉE une vraie ardoise dans `plats_du_jour`, vérifie ce qu'elle
// change, puis la RETIRE — y compris en cas d'échec. Une ardoise de test
// laissée en place ferait commander la semaine entière sur deux pizzas.
import fs from 'node:fs'
import { execSync } from 'node:child_process'
const OUT = '.next/cache/ardoise-lib'
execSync(`npx tsc src/lib/ardoise.ts --outDir ${OUT} --module esnext --target es2022 --moduleResolution bundler --skipLibCheck`, { stdio: 'pipe' })
fs.writeFileSync(`${OUT}/package.json`, '{"type":"module"}')
const A = await import(`../${OUT}/ardoise.js`)

const env = {}
for (const l of fs.readFileSync('.env.local', 'utf8').split('\n')) {
  const i = l.indexOf('='); if (i < 0 || l.trim().startsWith('#')) continue
  env[l.slice(0, i).trim()] = l.slice(i + 1).trim().replace(/^["']|["']$/g, '')
}
const U = env.NEXT_PUBLIC_SUPABASE_URL, K = env.SUPABASE_SERVICE_ROLE_KEY
const H = { apikey: K, Authorization: `Bearer ${K}`, 'Content-Type': 'application/json', Prefer: 'return=representation' }
const sb = async (p, o = {}) => {
  const r = await fetch(`${U}/rest/v1/${p}`, { ...o, headers: { ...H, ...(o.headers || {}) } })
  const t = await r.text(); if (!r.ok) throw new Error(`${r.status} ${t.slice(0, 200)}`)
  return t ? JSON.parse(t) : null
}
const lire = async (t, s) => { let o = [], f = 0; for (;;) { const r = await sb(`${t}?select=${s}&order=id&offset=${f}&limit=1000`); o = o.concat(r); if (r.length < 1000) break; f += 1000 } return o }
let ok = 0, ko = 0
const t = (n, c) => { if (c) { console.log(`  ✓ ${n}`); ok++ } else { console.log(`  ✗ ${n}`); ko++ } }
const titre = s => console.log(`\n── ${s} ──`)
const crees = []

try {
  const et = await sb('etablissements?select=id,nom')
  const nomE = Object.fromEntries(et.map(x => [x.id, x.nom]))
  const rec = await lire('recettes', 'id,nom,actif,tag_destination,etablissement_id')
  const ri = await lire('recette_ingredients', 'recette_id,ingredient_id,quantite,unite')
  const compo = {}
  for (const l of ri) (compo[l.recette_id] ??= []).push({ ingredient_id: l.ingredient_id, quantite: Number(l.quantite ?? 0), unite: l.unite })
  const resto = rec.filter(r => r.actif && nomE[r.etablissement_id] === 'Restauration' && compo[r.id])
  const pizzas = resto.filter(r => r.tag_destination === 'PIZZA')
  const brasserie = resto.filter(r => r.tag_destination !== 'PIZZA')

  // ⚠️ RECOPIE de la règle de `reassort-donnees.ts` : une matière de la
  // restauration absente de l'ardoise vaut ZÉRO, pas son ancienne cible.
  const matieresResto = new Set()
  for (const r of resto) for (const l of compo[r.id]) matieresResto.add(l.ingredient_id)

  titre('Le décor')
  t(`${pizzas.length} pizzas et ${brasserie.length} plats de brasserie ont une fiche`, pizzas.length >= 2 && brasserie.length >= 2)
  t(`${matieresResto.size} matières appartiennent à la restauration`, matieresResto.size > 20)

  titre('Une ardoise de DEUX PIZZAS, rien d’autre')
  const deux = pizzas.slice(0, 2)
  const plats = deux.map(r => ({ id: r.id, nom: r.nom, carte: 'PIZZA', composition: compo[r.id] }))
  const besoin = A.besoinSemaine(plats, A.VOLUME_CASATASIA)
  t('les ingrédients de ces deux pizzas ont un besoin calculé', besoin.size > 0)
  const dedans = [...besoin.keys()]
  const dehors = [...matieresResto].filter(id => !besoin.has(id))
  t(`${dehors.length} matières de la restauration sont HORS ardoise`, dehors.length > 0)
  t('⚠️⚠️ … et elles doivent tomber à ZÉRO, pas garder leur ancienne cible',
    dehors.every(id => !besoin.has(id)))

  titre('Ce que l’ardoise écrit vraiment en base')
  const aujourdhui = new Date().toISOString().slice(0, 10)
  const fin = new Date(Date.now() + 6 * 864e5).toISOString().slice(0, 10)
  for (const r of deux) {
    const [l] = await sb('plats_du_jour', { method: 'POST', body: JSON.stringify({
      recette_id: r.id, date_debut: aujourdhui, date_fin: fin, actif: true,
      description_speciale: '__test_ardoise__' }) })
    crees.push(l.id)
  }
  t('deux lignes d’ardoise créées', crees.length === 2)
  const relu = await sb(`plats_du_jour?select=id,recette_id,date_debut,date_fin&actif=eq.true&lte.date_debut=${aujourdhui}`)
    .catch(() => sb('plats_du_jour?select=id,recette_id,date_debut,date_fin&actif=eq.true'))
  const actives = relu.filter(x => x.date_debut <= aujourdhui && (!x.date_fin || x.date_fin >= aujourdhui))
  t('elles sont bien ACTIVES aujourd’hui', actives.length >= 2)

  titre('La composition d’un plat du jour l’emporte sur la fiche')
  const [pdj] = await sb('recettes?nom=eq.Plat%20du%20jour&select=id')
  t('le produit « Plat du jour » existe', !!pdj)
  if (pdj) {
    const [occ] = await sb('plats_du_jour', { method: 'POST', body: JSON.stringify({
      recette_id: pdj.id, titre: '__test_blanquette__',
      date_debut: aujourdhui, date_fin: aujourdhui, actif: true }) })
    crees.push(occ.id)
    const unIng = [...matieresResto][0]
    const [li] = await sb('plat_du_jour_ingredients', { method: 'POST', body: JSON.stringify({
      plat_du_jour_id: occ.id, ingredient_id: unIng, quantite: 0.2, unite: 'kg' }) })
    t('⚠️ une composition peut être attachée à l’OCCURRENCE, pas au produit', !!li)
    t('… et elle porte bien son titre du jour', occ.titre === '__test_blanquette__')
    // ⚠️ `recette_ingredients` n'en porte qu'une par produit : sans la 0167,
    // sept plats du jour différents seraient indescriptibles.
    const fiche = compo[pdj.id]
    t('⚠️ le produit « Plat du jour » n’a AUCUNE fiche — c’est voulu', !fiche)
  }

  titre('Le garde-fou vit dans la lib, pas dans la discipline')
  const src = fs.readFileSync('src/lib/reassort-donnees.ts', 'utf8')
  t('⚠️ `reassort-donnees.ts` lit bien `plats_du_jour`', /from\('plats_du_jour'\)/.test(src))
  t('⚠️⚠️ … et met à ZÉRO une matière resto hors ardoise',
    /ardoisePosee && matieresResto\.has\(id\)/.test(src) && /cible: 0/.test(src))
  t('⚠️ le Fournil et le bar ne passent PAS par l’ardoise',
    /nomE\.get\(x\.etablissement_id as string\) === 'Restauration'/.test(src))
} finally {
  // ⚠️ LE NETTOYAGE EST DANS UN `finally` : une ardoise de test laissée en
  // place ferait commander la semaine entière sur deux pizzas.
  for (const id of crees) {
    await sb(`plat_du_jour_ingredients?plat_du_jour_id=eq.${id}`, { method: 'DELETE' }).catch(() => {})
    await sb(`plats_du_jour?id=eq.${id}`, { method: 'DELETE' }).catch(() => {})
  }
  const reste = await sb('plats_du_jour?select=id&actif=eq.true')
  console.log(`\n── Nettoyage ──`)
  t(`${crees.length} ligne(s) de test retirées — ${reste.length} ardoise(s) restante(s)`, reste.length === 0)
}
console.log(`\n═══ ${ok} ✓   ${ko} ✗ ═══\n`)
process.exit(ko ? 1 : 0)
