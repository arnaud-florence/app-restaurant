// Test d'intégration Module 7 — Stocks.
//
//   node scripts/test-stock.mjs
//
// Vérifie :
//   1. Les 10 mouvements seedés sont bien en base
//   2. Les colonnes ajoutées (date_peremption, prix_unitaire_ht, fournisseur) sont là
//   3. Trigger sortie auto : insérer une commande_articles avec statut='servi'
//      → vérifier que stock_actuel a baissé et qu'un mouvement type='sortie' a été créé
//   4. Cleanup tous les artefacts de test

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

const TAG = `__stk_test_${Date.now().toString(36)}__`
let nbOk = 0, nbKo = 0
const fails = []
const cleanup = { mouvementIds: [], commandeIds: [], articleIds: [] }
const restoreStocks = []  // pour restaurer les stocks après test

function ok(m) { console.log(`  ✓ ${m}`); nbOk++ }
function ko(m, e) { console.log(`  ✗ ${m} — ${e}`); nbKo++; fails.push(`${m}: ${e}`) }
async function step(name, fn) {
  console.log(`\n→ ${name}`)
  try { await fn() } catch (e) { ko(`${name} (exception)`, e.message) }
}

console.log(`╔══════════════════════════════════════════════════════════╗`)
console.log(`║ Test stock — tag : ${TAG}                ║`)
console.log(`╚══════════════════════════════════════════════════════════╝`)

// ─── 1. Seeds + colonnes ─────────────────────────────────────────────
await step('mouvements seedés', async () => {
  const { data, error } = await sb.from('mouvements_stock').select('*').limit(50)
  if (error) throw new Error(error.message)
  if (data.length >= 10) ok(`${data.length} mouvements en base`)
  else ko('count', `attendu ≥ 10, reçu ${data.length}`)

  const sample = data[0]
  if ('date_peremption' in sample) ok(`colonne date_peremption présente`)
  else ko('colonne date_peremption', 'manquante')
  if ('prix_unitaire_ht' in sample) ok('colonne prix_unitaire_ht présente')
  else ko('colonne prix_unitaire_ht', 'manquante')
  if ('fournisseur' in sample) ok('colonne fournisseur présente')
  else ko('colonne fournisseur', 'manquante')
})

// ─── 2. Alertes DLC (seed magret J+5, saumon J+2) ───────────────────
await step('alertes DLC', async () => {
  const today = new Date().toISOString().slice(0, 10)
  const cutoff = new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10)
  const { data, error } = await sb
    .from('mouvements_stock')
    .select('ingredient_id, date_peremption, ingredient:ingredients(nom)')
    .eq('type', 'entree')
    .not('date_peremption', 'is', null)
    .gte('date_peremption', today)
    .lte('date_peremption', cutoff)
  if (error) throw new Error(error.message)
  if (data.length >= 1) {
    const noms = data.map(d => d.ingredient?.nom).filter(Boolean).join(', ')
    ok(`${data.length} alerte(s) DLC ≤ 3j : ${noms}`)
  } else {
    ko('alertes', `attendu ≥ 1 (saumon DLC J+2), reçu ${data.length}`)
  }
})

// ─── 3. Trigger sortie automatique ──────────────────────────────────
await step('trigger sortie auto sur article servi', async () => {
  // Sélectionne une recette avec ingrédients
  const { data: recs } = await sb
    .from('recettes')
    .select('id, nom, nb_portions, tag_destination, recette_ingredients(ingredient_id, quantite)')
    .eq('actif', true)
    .limit(5)
  const recette = recs?.find(r => r.recette_ingredients?.length >= 2)
  if (!recette) { ko('recette test', 'aucune recette avec >= 2 ingrédients'); return }
  ok(`recette test : ${recette.nom} (${recette.recette_ingredients.length} ingrédients)`)

  // Snapshot stock initial des ingrédients impliqués
  const ingredientIds = recette.recette_ingredients.map(li => li.ingredient_id)
  const { data: ingsAvant } = await sb
    .from('ingredients')
    .select('id, nom, stock_actuel')
    .in('id', ingredientIds)
  const stocksAvant = new Map(ingsAvant.map(i => [i.id, Number(i.stock_actuel)]))

  // Sauvegarde pour restoration finale
  for (const i of ingsAvant) {
    restoreStocks.push({ id: i.id, stock: Number(i.stock_actuel) })
  }

  // Crée une commande factice puis un article servi
  const numeroCmd = 'TEST-' + Date.now()
  const { data: cmd, error: cmdErr } = await sb.from('commandes').insert({
    numero: numeroCmd,
    source: 'TABLE',
    statut: 'encaisse',
    montant_total_ht: 10,
  }).select('id').single()
  if (cmdErr) throw new Error(`cmd: ${cmdErr.message}`)
  cleanup.commandeIds.push(cmd.id)

  // Snapshot mouvements avant
  const { data: mvAvant } = await sb
    .from('mouvements_stock')
    .select('id')
    .eq('type', 'sortie')
    .in('ingredient_id', ingredientIds)
  const nbMvAvant = mvAvant.length

  // Insère l'article DIRECTEMENT avec statut='servi' → trigger doit tirer
  const { data: art, error: artErr } = await sb.from('commande_articles').insert({
    commande_id: cmd.id,
    recette_id: recette.id,
    quantite: 2,  // ×2 pour bien voir la déduction
    prix_unitaire_ht: 10,
    tag_destination: recette.tag_destination,
    statut: 'servi',
  }).select('id').single()
  if (artErr) throw new Error(`article: ${artErr.message}`)
  cleanup.articleIds.push(art.id)
  ok('article inséré avec statut=servi')

  // Vérifie que les stocks ont diminué
  const { data: ingsApres } = await sb
    .from('ingredients')
    .select('id, nom, stock_actuel')
    .in('id', ingredientIds)
  let nbDeductions = 0
  for (const i of ingsApres) {
    const avant = stocksAvant.get(i.id)
    const apres = Number(i.stock_actuel)
    const ri = recette.recette_ingredients.find(x => x.ingredient_id === i.id)
    const attendu = avant - (Number(ri.quantite) * 2 / Math.max(1, recette.nb_portions))
    if (Math.abs(apres - attendu) < 0.001) {
      ok(`stock ${i.nom} : ${avant.toFixed(3)} → ${apres.toFixed(3)} ✓`)
      nbDeductions++
    } else {
      ko(`stock ${i.nom}`, `attendu ${attendu.toFixed(3)}, reçu ${apres.toFixed(3)}`)
    }
  }
  if (nbDeductions === ingredientIds.length) ok(`${nbDeductions} ingrédients tous correctement déduits`)

  // Vérifie que des mouvements 'sortie' ont été créés
  const { data: mvApres } = await sb
    .from('mouvements_stock')
    .select('id, ingredient_id, quantite, motif')
    .eq('type', 'sortie')
    .in('ingredient_id', ingredientIds)
  const nbNouveauxMv = mvApres.length - nbMvAvant
  if (nbNouveauxMv === ingredientIds.length) {
    ok(`${nbNouveauxMv} mouvements 'sortie' créés par le trigger`)
    // Track for cleanup
    const nouveauxIds = mvApres.slice(-nbNouveauxMv).map(m => m.id)
    cleanup.mouvementIds.push(...nouveauxIds)
  } else {
    ko('mouvements créés', `attendu ${ingredientIds.length}, reçu ${nbNouveauxMv}`)
  }
})

// ─── 4. Cleanup ──────────────────────────────────────────────────────
console.log('\n→ Cleanup…')

// Supprimer les articles & commandes (cascade les mouvements liés via commande_id ?
// Non — mouvements_stock n'a pas de cascade. On supprime explicitement.)
if (cleanup.mouvementIds.length > 0) {
  await sb.from('mouvements_stock').delete().in('id', cleanup.mouvementIds)
  console.log(`  ✓ ${cleanup.mouvementIds.length} mouvements de test supprimés`)
}
if (cleanup.articleIds.length > 0) {
  await sb.from('commande_articles').delete().in('id', cleanup.articleIds)
  console.log(`  ✓ ${cleanup.articleIds.length} articles de test supprimés`)
}
if (cleanup.commandeIds.length > 0) {
  await sb.from('commandes').delete().in('id', cleanup.commandeIds)
  console.log(`  ✓ ${cleanup.commandeIds.length} commandes de test supprimées`)
}
// Restaurer les stocks
for (const r of restoreStocks) {
  await sb.from('ingredients').update({ stock_actuel: r.stock }).eq('id', r.id)
}
if (restoreStocks.length > 0) console.log(`  ✓ ${restoreStocks.length} stocks d'ingrédients restaurés`)

// ─── Bilan ──────────────────────────────────────────────────────────
console.log(`\n╔══════════════════════════════════════════════════════════╗`)
console.log(`║ ✓ ${nbOk}/${nbOk + nbKo}  réussites${' '.repeat(Math.max(0, 42 - String(nbOk).length - String(nbOk + nbKo).length))}║`)
console.log(`║ ✗ ${nbKo}/${nbOk + nbKo}  échecs${' '.repeat(Math.max(0, 45 - String(nbKo).length - String(nbOk + nbKo).length))}║`)
console.log(`╚══════════════════════════════════════════════════════════╝`)
if (nbKo > 0) {
  console.log('\nÉchecs :')
  for (const f of fails) console.log(`  • ${f}`)
  process.exit(1)
}
console.log('\n🎉 Module 7 — stocks + trigger sortie auto OK.')
