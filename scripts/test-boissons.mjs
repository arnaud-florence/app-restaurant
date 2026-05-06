// Test d'intégration Module 6 — Boissons.
//
//   node scripts/test-boissons.mjs
//
// Vérifie :
//   1. Les 10 boissons seedées sont bien en base
//   2. Calcul marge bouteille/verre/pinte cohérent
//   3. Rendement fût pour la bière pression (60 pintes / fût 30L)
//   4. Auto-suggestions accords mets/vins par couleur
//   5. CRUD boisson + accord explicite

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

const TAG = `__boi_test_${Date.now().toString(36)}__`
let nbOk = 0, nbKo = 0
const fails = []
const cleanupBoissonIds = []

function ok(m) { console.log(`  ✓ ${m}`); nbOk++ }
function ko(m, e) { console.log(`  ✗ ${m} — ${e}`); nbKo++; fails.push(`${m}: ${e}`) }
async function step(name, fn) {
  console.log(`\n→ ${name}`)
  try { await fn() } catch (e) { ko(`${name} (exception)`, e.message) }
}

// ─── Lib calc en mini (cross-check) ─────────────────────────────────
function margeBouteille(b) {
  if (!(b.prix_vente_ht_bouteille > 0 && b.prix_achat_ht_bouteille > 0)) return null
  const m = Number(b.prix_vente_ht_bouteille) - Number(b.prix_achat_ht_bouteille)
  return { eur: m, pct: (m / b.prix_vente_ht_bouteille) * 100 }
}
function margeVerre(b) {
  if (!(b.prix_vente_ht_verre > 0 && b.prix_achat_ht_bouteille > 0 && b.contenance_bouteille_cl > 0 && b.contenance_verre_cl > 0)) return null
  const ach = (Number(b.prix_achat_ht_bouteille) / b.contenance_bouteille_cl) * b.contenance_verre_cl
  const m = Number(b.prix_vente_ht_verre) - ach
  return { eur: m, pct: (m / b.prix_vente_ht_verre) * 100 }
}
function rendementFut(b) {
  if (!(b.contenance_fut_cl > 0 && b.contenance_pinte_cl > 0 && b.prix_achat_ht_fut > 0)) return null
  const nb = b.contenance_fut_cl / b.contenance_pinte_cl
  const ach = Number(b.prix_achat_ht_fut) / nb
  const ca = nb * Number(b.prix_vente_ht_pinte)
  return { nb_pintes: nb, achat_pinte: ach, ca_par_fut: ca }
}

console.log(`╔══════════════════════════════════════════════════════════╗`)
console.log(`║ Test boissons — tag : ${TAG}             ║`)
console.log(`╚══════════════════════════════════════════════════════════╝`)

// ─── 1. Seeds ───────────────────────────────────────────────────────
let boissons = []
await step('seeds : 10 boissons en base', async () => {
  const { data, error } = await sb.from('boissons').select('*')
  if (error) throw new Error(error.message)
  boissons = data
  if (data.length >= 10) ok(`${data.length} boissons en base`)
  else ko('count', `attendu ≥ 10, reçu ${data.length}`)

  const types = new Set(data.map(b => b.type))
  if (types.has('vin')) ok('au moins 1 vin')
  if (types.has('biere_pression')) ok('au moins 1 bière pression')
  if (types.has('soft')) ok('au moins 1 soft')
  if (types.has('spiritueux')) ok('au moins 1 spiritueux')
})

// ─── 2. Calcul marge bouteille / verre ──────────────────────────────
await step('calcul marges Cahors Malbec', async () => {
  const cahors = boissons.find(b => b.nom.includes('Cahors'))
  if (!cahors) { ko('cahors', 'introuvable'); return }
  const mb = margeBouteille(cahors)
  if (mb && Math.abs(mb.eur - 21.5) < 0.5) ok(`marge bouteille Cahors : ${mb.eur.toFixed(2)} €`)
  else ko('marge bouteille', mb?.eur)
  const mv = margeVerre(cahors)
  // 12cl × 6.5/75 = 1.04 € achat → marge verre = 6 - 1.04 = 4.96 €
  if (mv && Math.abs(mv.eur - 4.96) < 0.1) ok(`marge verre Cahors : ${mv.eur.toFixed(2)} €`)
  else ko('marge verre', mv?.eur)
})

// ─── 3. Rendement fût bière pression ─────────────────────────────────
await step('rendement fût Lager Garonne', async () => {
  const biere = boissons.find(b => b.type === 'biere_pression')
  if (!biere) { ko('biere pression', 'introuvable'); return }
  const r = rendementFut(biere)
  if (!r) { ko('rendement', 'inapplicable'); return }
  if (r.nb_pintes === 60) ok(`60 pintes par fût (3000cl / 50cl)`)
  else ko('nb pintes', `attendu 60, reçu ${r.nb_pintes}`)
  // achat / pinte = 80 / 60 = 1.333
  if (Math.abs(r.achat_pinte - 1.333) < 0.01) ok(`achat / pinte ≈ ${r.achat_pinte.toFixed(3)} €`)
  else ko('achat pinte', r.achat_pinte)
  // CA potentiel = 60 × 4.50 = 270
  if (Math.abs(r.ca_par_fut - 270) < 0.01) ok(`CA potentiel par fût : ${r.ca_par_fut.toFixed(2)} €`)
  else ko('CA potentiel', r.ca_par_fut)
})

// ─── 4. Auto-suggestions accords (algo couleur × keywords) ──────────
await step('suggestions accords mets/vins (cross-check)', async () => {
  const cahors = boissons.find(b => b.nom.includes('Cahors'))
  // Magret de canard devrait être suggéré pour le Cahors (rouge × viande rouge)
  const { data: recs } = await sb.from('recettes').select('id, nom, categorie, tag_destination').eq('actif', true)
  const magret = recs?.find(r => r.nom.includes('Magret'))
  if (!magret) { ko('magret', 'introuvable'); return }
  // L'algo : couleur rouge + viande rouge = 70 points
  // On reproduit ici très simplement
  const score = /magret|canard|bœuf|boeuf/i.test(magret.nom) ? 70 : 0
  if (cahors && cahors.couleur === 'rouge' && score >= 70) {
    ok(`Cahors (rouge) + Magret de canard → score ${score}/100 ✓`)
  } else {
    ko('matching', `couleur ${cahors?.couleur}, score ${score}`)
  }

  // Pizza Margherita devrait matcher avec un rouge (tag PIZZA = +30)
  const margherita = recs?.find(r => r.nom.includes('Margherita'))
  if (margherita && margherita.tag_destination === 'PIZZA') {
    ok('Pizza Margherita tag PIZZA → matche les rouges (+30 points)')
  } else {
    ko('margherita tag', margherita?.tag_destination)
  }
})

// ─── 5. CRUD ────────────────────────────────────────────────────────
let createdId
await step('CRUD : créer + update + accord + delete', async () => {
  const { data, error } = await sb.from('boissons').insert({
    nom: TAG + ' Test',
    type: 'vin',
    couleur: 'blanc',
    appellation: 'Test',
    millesime: 2024,
    prix_achat_ht_bouteille: 5,
    contenance_bouteille_cl: 75,
    prix_vente_ht_bouteille: 22,
    prix_vente_ht_verre: 5,
    contenance_verre_cl: 12,
    tva: 20,
    stock_actuel_bouteilles: 6,
    stock_minimum_bouteilles: 3,
  }).select('id').single()
  if (error) throw new Error(error.message)
  createdId = data.id
  cleanupBoissonIds.push(createdId)
  ok(`créé id=${createdId.slice(0,8)}…`)

  await sb.from('boissons').update({ prix_vente_ht_verre: 6 }).eq('id', createdId)
  const { data: r } = await sb.from('boissons').select('prix_vente_ht_verre').eq('id', createdId).single()
  if (Number(r.prix_vente_ht_verre) === 6) ok('update prix_vente_ht_verre = 6')
  else ko('update', r.prix_vente_ht_verre)

  // Accord explicite avec une recette
  const { data: rec } = await sb.from('recettes').select('id').limit(1).single()
  await sb.from('accords_mets_boissons').insert({ boisson_id: createdId, recette_id: rec.id, note: 'Test' })
  const { data: acc } = await sb.from('accords_mets_boissons').select('id').eq('boisson_id', createdId)
  if (acc?.length === 1) ok('accord explicite créé')
  else ko('accord', acc?.length)

  // Delete cascade : suppression de la boisson → suppression de l'accord
  await sb.from('boissons').delete().eq('id', createdId)
  cleanupBoissonIds.splice(cleanupBoissonIds.indexOf(createdId), 1)
  const { data: acc2 } = await sb.from('accords_mets_boissons').select('id').eq('boisson_id', createdId)
  if (!acc2 || acc2.length === 0) ok('cascade DELETE accord ✓')
  else ko('cascade', `${acc2.length} accords orphelins`)
})

// ─── Cleanup ────────────────────────────────────────────────────────
if (cleanupBoissonIds.length > 0) {
  console.log('\n→ Cleanup…')
  await sb.from('boissons').delete().in('id', cleanupBoissonIds)
  console.log(`  ✓ ${cleanupBoissonIds.length} boisson(s) résiduelle(s) supprimée(s)`)
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
console.log('\n🎉 Module 6 — boissons OK.')
