// Test d'intégration Module 4 — Recettes & food cost.
//
//   node scripts/test-recettes.mjs
//
// Vérifie :
// 1. Lecture des 5 recettes seedées avec leurs ingrédients
// 2. Calcul food cost cohérent (lib/foodCost en miroir)
// 3. CRUD recette : create / update / toggle / delete
// 4. Diff sur recette_ingredients : add / update / remove
// 5. Recalcul auto si le prix d'un ingrédient change
// 6. Cascade DELETE sur recette_ingredients

import { readFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'

const env = readFileSync('.env.local', 'utf8')
for (const line of env.split('\n')) {
  const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/)
  if (m) process.env[m[1]] = m[2].replace(/^['"]|['"]$/g, '')
}
const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
if (!url || !key) { console.error('❌ env manquant'); process.exit(1) }
const sb = createClient(url, key)

const TAG = `__rec_test_${Date.now().toString(36)}__`
let nbOk = 0, nbKo = 0
const fails = []
const cleanupRecetteIds = []
const cleanupIngredientIds = []
const restorePrices = [] // [{id, prix_original}]

function ok(m) { console.log(`  ✓ ${m}`); nbOk++ }
function ko(m, e) { console.log(`  ✗ ${m} — ${e}`); nbKo++; fails.push(`${m}: ${e}`) }
async function step(name, fn) {
  console.log(`\n→ ${name}`)
  try { await fn() } catch (e) { ko(`${name} (exception)`, e.message) }
}

// ─── Mini-lib food cost (copie du lib/foodCost.ts pour vérification) ─
function coutTotal(lignes) { return lignes.reduce((s, l) => s + l.quantite * l.prix_achat_ht, 0) }
function coutPortion(total, n) { return n > 0 ? total / n : 0 }
function foodCostPct(coutPortion, prixHT) { return prixHT > 0 ? (coutPortion / prixHT) * 100 : 0 }
function statutFC(pct) { if (pct < 28) return 'vert'; if (pct <= 32) return 'orange'; return 'rouge' }

console.log(`╔══════════════════════════════════════════════════════════╗`)
console.log(`║ Test recettes — tag : ${TAG}              ║`)
console.log(`╚══════════════════════════════════════════════════════════╝`)

// ─── 1. Lecture des seeds + calcul food cost ────────────────────────
await step('seed : 5 recettes avec ingrédients liés', async () => {
  const { data, error } = await sb.from('recettes')
    .select('id, nom, nb_portions, prix_vente_ht, recette_ingredients(quantite, ingredient:ingredients(prix_achat_ht))')
  if (error) throw new Error(error.message)
  if (data.length >= 5) ok(`${data.length} recettes en base`)
  else ko('count', `attendu ≥ 5, reçu ${data.length}`)

  // Pour chaque recette : food cost cohérent
  for (const r of data) {
    const lignes = (r.recette_ingredients ?? []).map(li => ({
      quantite: Number(li.quantite),
      prix_achat_ht: Number(li.ingredient?.prix_achat_ht ?? 0),
    }))
    const total = coutTotal(lignes)
    const portion = coutPortion(total, Number(r.nb_portions))
    const fc = foodCostPct(portion, Number(r.prix_vente_ht))
    if (fc > 0 && fc < 200) {
      ok(`${r.nom} → food cost ${fc.toFixed(1)}% (${statutFC(fc)})`)
    } else {
      ko(`${r.nom} food cost`, `valeur aberrante ${fc.toFixed(1)}%`)
    }
  }
})

// ─── 2. CRUD : créer une recette de test avec 2 ingrédients ─────────
let createdRecetteId
let testIngredientId  // ingrédient qu'on garde dans la recette du début à la fin
let ings              // partagé entre les steps
await step('create : nouvelle recette + 2 ingrédients', async () => {
  const { data: ingsData } = await sb.from('ingredients').select('id, prix_achat_ht').limit(3)
  if (!ingsData || ingsData.length < 3) throw new Error('Pas assez d\'ingrédients en base')
  ings = ingsData
  testIngredientId = ings[1].id // celui-ci reste dans la recette pendant tous les tests

  const { data: rec, error } = await sb.from('recettes').insert({
    nom: TAG + ' Plat de test',
    categorie: 'Plats',
    tag_destination: 'CUISINE',
    description: 'Test',
    temps_preparation: 10,
    nb_portions: 2,
    prix_vente_ht: 15.00,
    tva: 10,
    actif: true,
  }).select('id').single()
  if (error) throw new Error(error.message)
  createdRecetteId = rec.id
  cleanupRecetteIds.push(createdRecetteId)
  ok(`recette créée id=${createdRecetteId.slice(0,8)}…`)

  const { error: lErr } = await sb.from('recette_ingredients').insert([
    { recette_id: createdRecetteId, ingredient_id: ings[0].id, quantite: 0.2, unite: 'kg' },
    { recette_id: createdRecetteId, ingredient_id: ings[1].id, quantite: 0.1, unite: 'kg' },
  ])
  if (lErr) throw new Error(lErr.message)
  ok('2 lignes recette_ingredients insérées')
})

// ─── 3. Update : changer le prix de vente HT ─────────────────────────
await step('update prix_vente_ht', async () => {
  const { error } = await sb.from('recettes').update({ prix_vente_ht: 18.50 }).eq('id', createdRecetteId)
  if (error) throw new Error(error.message)
  const { data } = await sb.from('recettes').select('prix_vente_ht').eq('id', createdRecetteId).single()
  if (Number(data.prix_vente_ht) === 18.5) ok('prix_vente_ht = 18.50 ✓')
  else ko('prix_vente_ht', data.prix_vente_ht)
})

// ─── 4. Diff ingrédients : ajouter une ligne, en supprimer une ──────
//   On supprime ings[0] (et pas ings[1] = testIngredientId qui sert au step 5).
await step('diff recette_ingredients (add + delete)', async () => {
  // Ajouter une 3e ligne
  await sb.from('recette_ingredients').insert({
    recette_id: createdRecetteId, ingredient_id: ings[2].id, quantite: 0.05, unite: 'kg',
  })
  const { data: lignes1 } = await sb.from('recette_ingredients').select('id').eq('recette_id', createdRecetteId)
  if (lignes1.length === 3) ok('3 lignes après ajout')
  else ko('count after add', lignes1.length)

  // Supprimer la 1re ligne (ings[0]) — testIngredientId (ings[1]) reste
  await sb.from('recette_ingredients').delete().eq('recette_id', createdRecetteId).eq('ingredient_id', ings[0].id)
  const { data: lignes2 } = await sb.from('recette_ingredients').select('id').eq('recette_id', createdRecetteId)
  if (lignes2.length === 2) ok('2 lignes après suppression (testIngredientId conservé)')
  else ko('count after delete', lignes2.length)
})

// ─── 5. Recalcul auto : changer le prix d'un ingrédient ─────────────
await step('recalcul auto : changer prix ingrédient → recette voit le changement', async () => {
  // Lit prix initial
  const { data: ing0 } = await sb.from('ingredients').select('prix_achat_ht').eq('id', testIngredientId).single()
  const prixOriginal = Number(ing0.prix_achat_ht)
  restorePrices.push({ id: testIngredientId, prix: prixOriginal })

  // Coût recette avec prix initial
  const { data: r1 } = await sb.from('recettes')
    .select('nb_portions, prix_vente_ht, recette_ingredients(quantite, ingredient:ingredients(prix_achat_ht))')
    .eq('id', createdRecetteId).single()
  const lignes1 = r1.recette_ingredients.map(l => ({
    quantite: Number(l.quantite),
    prix_achat_ht: Number(l.ingredient.prix_achat_ht),
  }))
  const fc1 = foodCostPct(coutPortion(coutTotal(lignes1), r1.nb_portions), Number(r1.prix_vente_ht))
  ok(`food cost initial : ${fc1.toFixed(2)}%`)

  // Double le prix de l'ingrédient
  const nouveauPrix = prixOriginal * 2
  const { error } = await sb.from('ingredients').update({ prix_achat_ht: nouveauPrix }).eq('id', testIngredientId)
  if (error) throw new Error(error.message)

  // Re-lit la recette → le coût a changé
  const { data: r2 } = await sb.from('recettes')
    .select('nb_portions, prix_vente_ht, recette_ingredients(quantite, ingredient:ingredients(prix_achat_ht))')
    .eq('id', createdRecetteId).single()
  const lignes2 = r2.recette_ingredients.map(l => ({
    quantite: Number(l.quantite),
    prix_achat_ht: Number(l.ingredient.prix_achat_ht),
  }))
  const fc2 = foodCostPct(coutPortion(coutTotal(lignes2), r2.nb_portions), Number(r2.prix_vente_ht))
  if (fc2 > fc1) ok(`food cost après × 2 sur 1 ingrédient : ${fc2.toFixed(2)}% (a augmenté ✓)`)
  else ko('recalcul auto', `attendu fc2 > fc1, reçu ${fc2.toFixed(2)} vs ${fc1.toFixed(2)}`)
})

// ─── 6. Toggle actif ─────────────────────────────────────────────────
await step('toggle actif', async () => {
  await sb.from('recettes').update({ actif: false }).eq('id', createdRecetteId)
  const { data } = await sb.from('recettes').select('actif').eq('id', createdRecetteId).single()
  if (data.actif === false) ok('actif = false')
  else ko('toggle false', data.actif)
})

// ─── 7. Delete + cascade sur recette_ingredients ─────────────────────
await step('delete recette → cascade ingredients', async () => {
  await sb.from('recettes').delete().eq('id', createdRecetteId)
  cleanupRecetteIds.splice(cleanupRecetteIds.indexOf(createdRecetteId), 1)
  const { data: lignes } = await sb.from('recette_ingredients').select('id').eq('recette_id', createdRecetteId)
  if (lignes.length === 0) ok('cascade DELETE recette_ingredients ✓')
  else ko('cascade', `${lignes.length} lignes orphelines`)
})

// ─── Cleanup ─────────────────────────────────────────────────────────
console.log('\n→ Cleanup…')
// Restaurer les prix d'ingrédients modifiés
for (const r of restorePrices) {
  await sb.from('ingredients').update({ prix_achat_ht: r.prix }).eq('id', r.id)
}
if (restorePrices.length > 0) console.log(`  ✓ ${restorePrices.length} prix d'ingrédients restaurés`)
if (cleanupRecetteIds.length > 0) {
  await sb.from('recettes').delete().in('id', cleanupRecetteIds)
  console.log(`  ✓ ${cleanupRecetteIds.length} recettes résiduelles supprimées`)
}

// ─── Bilan ───────────────────────────────────────────────────────────
console.log(`\n╔══════════════════════════════════════════════════════════╗`)
console.log(`║ ✓ ${nbOk}/${nbOk + nbKo}  réussites${' '.repeat(Math.max(0, 42 - String(nbOk).length - String(nbOk + nbKo).length))}║`)
console.log(`║ ✗ ${nbKo}/${nbOk + nbKo}  échecs${' '.repeat(Math.max(0, 45 - String(nbKo).length - String(nbOk + nbKo).length))}║`)
console.log(`╚══════════════════════════════════════════════════════════╝`)
if (nbKo > 0) {
  console.log('\nÉchecs :')
  for (const f of fails) console.log(`  • ${f}`)
  process.exit(1)
}
console.log('\n🎉 Module 4 — recettes + food cost OK.')
