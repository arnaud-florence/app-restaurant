// Test d'intégration Module 3 — Ingrédients.
//
//   node scripts/test-ingredients.mjs
//
// Reproduit le chemin des server actions (create / update / toggle /
// delete + lecture historique) contre la DB réelle, vérifie le trigger
// historique_prix_ingredients, nettoie ses traces.

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

const TAG = `__ingr_test_${Date.now().toString(36)}__`
let nbOk = 0, nbKo = 0
const fails = []
const cleanupIds = []

function ok(m) { console.log(`  ✓ ${m}`); nbOk++ }
function ko(m, e) { console.log(`  ✗ ${m} — ${e}`); nbKo++; fails.push(`${m}: ${e}`) }
async function step(name, fn) {
  console.log(`\n→ ${name}`)
  try { await fn() } catch (e) { ko(`${name} (exception)`, e.message) }
}

console.log(`╔══════════════════════════════════════════════════════════╗`)
console.log(`║ Test ingrédients — tag : ${TAG}             ║`)
console.log(`╚══════════════════════════════════════════════════════════╝`)

// ─── 1. Création ─────────────────────────────────────────────────────
let createdId
await step('create — nouvel ingrédient', async () => {
  const { data, error } = await sb.from('ingredients').insert({
    nom: TAG + ' Mozza',
    categorie: 'Crémerie',
    unite: 'kg',
    prix_achat_ht: 10.5000,
    fournisseur_principal: 'Test SA',
    fournisseur_secondaire: null,
    stock_actuel: 5,
    stock_minimum: 2,
    stock_maximum: 10,
    dlc_moyenne_jours: 14,
    allergenes: ['lait'],
    actif: true,
  }).select('*').single()
  if (error) throw new Error(error.message)
  createdId = data.id
  cleanupIds.push(createdId)
  ok(`créé id=${createdId}`)
  if (Number(data.prix_achat_ht) === 10.5) ok('prix_achat_ht = 10.5000')
  else ko('prix_achat_ht', `attendu 10.5, reçu ${data.prix_achat_ht}`)
  if (Array.isArray(data.allergenes) && data.allergenes.includes('lait')) ok('allergenes round-trip')
  else ko('allergenes', JSON.stringify(data.allergenes))
})

// ─── 2. Trigger historique : entrée 'creation' créée auto ───────────
await step('trigger : historique au create', async () => {
  const { data, error } = await sb
    .from('historique_prix_ingredients')
    .select('*')
    .eq('ingredient_id', createdId)
    .order('created_at', { ascending: true })
  if (error) throw new Error(error.message)
  if (data.length === 1) ok('1 entrée historique créée')
  else ko('historique count', `attendu 1, reçu ${data.length}`)
  if (data[0]?.source === 'creation') ok(`source = 'creation'`)
  else ko('source', `attendu 'creation', reçu '${data[0]?.source}'`)
  if (Number(data[0]?.prix_achat_ht) === 10.5) ok('prix archivé = 10.5000')
  else ko('prix archivé', data[0]?.prix_achat_ht)
})

// ─── 3. Update prix → trigger historique 'manuel' ───────────────────
await step('update — changer prix', async () => {
  const { error } = await sb.from('ingredients').update({ prix_achat_ht: 12.7500 }).eq('id', createdId)
  if (error) throw new Error(error.message)
  ok('UPDATE prix → 12.7500')

  const { data: hist } = await sb
    .from('historique_prix_ingredients')
    .select('*')
    .eq('ingredient_id', createdId)
    .order('created_at', { ascending: true })
  if (hist.length === 2) ok('2 entrées historique')
  else ko('historique count après update', `attendu 2, reçu ${hist.length}`)
  if (hist[1]?.source === 'manuel') ok(`source = 'manuel'`)
  else ko('source update', `attendu 'manuel', reçu '${hist[1]?.source}'`)
  if (Number(hist[1]?.prix_achat_ht) === 12.75) ok('nouveau prix archivé')
  else ko('prix archivé update', hist[1]?.prix_achat_ht)
})

// ─── 4. Update sans changer le prix → pas de nouvelle entrée ────────
await step('update — sans changer le prix', async () => {
  const { error } = await sb.from('ingredients').update({ stock_actuel: 7 }).eq('id', createdId)
  if (error) throw new Error(error.message)
  ok('UPDATE stock_actuel → 7')

  const { data: hist } = await sb
    .from('historique_prix_ingredients')
    .select('*')
    .eq('ingredient_id', createdId)
  if (hist.length === 2) ok('toujours 2 entrées (aucune nouvelle)')
  else ko('historique count après update sans prix', `attendu 2, reçu ${hist.length}`)
})

// ─── 5. Toggle actif ────────────────────────────────────────────────
await step('toggle actif', async () => {
  await sb.from('ingredients').update({ actif: false }).eq('id', createdId)
  const { data: a } = await sb.from('ingredients').select('actif').eq('id', createdId).single()
  if (a.actif === false) ok('actif = false')
  else ko('actif false', a.actif)
  await sb.from('ingredients').update({ actif: true }).eq('id', createdId)
  const { data: b } = await sb.from('ingredients').select('actif').eq('id', createdId).single()
  if (b.actif === true) ok('actif = true (réactivé)')
  else ko('actif true', b.actif)
})

// ─── 6. Lecture liste (vérifie que les 10 seeds + le créé sont là) ──
await step('list — seeds + création visible', async () => {
  const { data, error } = await sb.from('ingredients').select('id, nom, allergenes, actif').order('nom')
  if (error) throw new Error(error.message)
  if (data.length >= 11) ok(`liste : ${data.length} ingrédients`)
  else ko('list count', `attendu ≥ 11, reçu ${data.length}`)
  if (data.find(i => i.id === createdId)) ok('ingrédient créé bien dans la liste')
  else ko('createdId dans liste', 'introuvable')
})

// ─── 7. Suppression ──────────────────────────────────────────────────
await step('delete — suppression définitive', async () => {
  const { error } = await sb.from('ingredients').delete().eq('id', createdId)
  if (error) throw new Error(error.message)
  cleanupIds.splice(cleanupIds.indexOf(createdId), 1)
  ok('DELETE ingrédient')

  // L'historique doit cascader (on delete cascade dans la migration 0003)
  const { data: hist } = await sb
    .from('historique_prix_ingredients')
    .select('id')
    .eq('ingredient_id', createdId)
  if (hist.length === 0) ok('historique cascade-deleté (FK ON DELETE CASCADE)')
  else ko('cascade delete', `${hist.length} entrées orphelines`)
})

// ─── Cleanup (au cas où un test a échoué avant la suppression) ──────
if (cleanupIds.length > 0) {
  console.log('\n→ Nettoyage…')
  await sb.from('ingredients').delete().in('id', cleanupIds)
  console.log(`  ✓ ${cleanupIds.length} ingrédients résiduels supprimés`)
}

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
console.log('\n🎉 Module 3 — CRUD ingrédients + trigger historique OK.')
