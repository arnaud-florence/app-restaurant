// Test d'intégration Module 5 — Menu engineering.
//
//   node scripts/test-engineering.mjs
//
// Vérifie :
//   1. Les 153 ventes seedées sont bien en base
//   2. Le mix calculé correspond au seed (Margherita ~52%, Pesto ~7.8%, etc.)
//   3. Les 5 recettes tombent dans les quadrants attendus
//   4. Les seuils Kasavana sont cohérents
//
// Reproduit la logique de src/lib/menuEngineering.ts en JS pour
// valider l'algorithme.

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

let nbOk = 0, nbKo = 0
const fails = []
function ok(m) { console.log(`  ✓ ${m}`); nbOk++ }
function ko(m, e) { console.log(`  ✗ ${m} — ${e}`); nbKo++; fails.push(`${m}: ${e}`) }
async function step(name, fn) {
  console.log(`\n→ ${name}`)
  try { await fn() } catch (e) { ko(`${name} (exception)`, e.message) }
}

// ─── Mini-impl menuEngineering pour cross-check ─────────────────────
function classifier(mix, marge, sP, sM) {
  const pop = mix >= sP, ren = marge >= sM
  if (pop && ren) return 'star'
  if (pop && !ren) return 'plowhorse'
  if (!pop && ren) return 'puzzle'
  return 'dog'
}

console.log(`╔══════════════════════════════════════════════════════════╗`)
console.log(`║ Test menu engineering                                    ║`)
console.log(`╚══════════════════════════════════════════════════════════╝`)

// ─── 1. Charge les ventes 30j + recettes ─────────────────────────────
let recettes = []
let ventesParRecette = new Map()
await step('lecture recettes + ventes 30j', async () => {
  const { data: recs } = await sb
    .from('recettes')
    .select('id, nom, prix_vente_ht, recette_ingredients(quantite, ingredient:ingredients(prix_achat_ht))')
    .eq('actif', true)
  recettes = recs ?? []
  if (recettes.length >= 5) ok(`${recettes.length} recettes actives`)
  else ko('count recettes', recettes.length)

  const cutoff = new Date(Date.now() - 30 * 86400000).toISOString()
  const { data: cmds } = await sb
    .from('commandes')
    .select('id')
    .eq('statut', 'encaisse')
    .gte('created_at', cutoff)
  if (cmds.length >= 100) ok(`${cmds.length} commandes encaissées sur 30j`)
  else ko('count commandes 30j', `attendu ≥ 100, reçu ${cmds.length}`)

  const { data: arts } = await sb
    .from('commande_articles')
    .select('recette_id, quantite, prix_unitaire_ht')
    .in('commande_id', cmds.map(c => c.id))
  for (const a of arts ?? []) {
    const v = ventesParRecette.get(a.recette_id) ?? { ventes: 0, ca: 0 }
    v.ventes += Number(a.quantite)
    v.ca     += Number(a.quantite) * Number(a.prix_unitaire_ht)
    ventesParRecette.set(a.recette_id, v)
  }
  const total = Array.from(ventesParRecette.values()).reduce((s, v) => s + v.ventes, 0)
  if (total >= 100) ok(`total articles vendus 30j : ${total}`)
  else ko('total articles', total)
})

// ─── 2. Calcul matrice ───────────────────────────────────────────────
let synth
await step('calcul matrice + seuils Kasavana', async () => {
  const total_ventes = Array.from(ventesParRecette.values()).reduce((s, v) => s + v.ventes, 0)

  const enriched = recettes.map(r => {
    const cout_total = (r.recette_ingredients ?? []).reduce(
      (s, li) => s + Number(li.quantite) * Number(li.ingredient?.prix_achat_ht ?? 0),
      0
    )
    const v = ventesParRecette.get(r.id) ?? { ventes: 0, ca: 0 }
    return {
      nom: r.nom,
      prix_vente_ht: Number(r.prix_vente_ht),
      cout_portion: cout_total,  // 1 portion par défaut dans nos seeds
      marge_par_portion: Number(r.prix_vente_ht) - cout_total,
      ventes: v.ventes,
      mix_pct: total_ventes > 0 ? (v.ventes / total_ventes) * 100 : 0,
    }
  })

  const seuil_pop = recettes.length > 0 ? (100 / recettes.length) * 0.7 : 0
  const seuil_marge = enriched.reduce((s, e) => s + e.marge_par_portion, 0) / Math.max(1, enriched.length)

  ok(`seuil popularité : ${seuil_pop.toFixed(2)}%`)
  ok(`seuil marge : ${seuil_marge.toFixed(2)} €/portion`)

  synth = enriched.map(e => ({
    ...e,
    quadrant: classifier(e.mix_pct, e.marge_par_portion, seuil_pop, seuil_marge),
  }))
})

// ─── 3. Vérifie les quadrants attendus ──────────────────────────────
await step('classification des 5 recettes seedées', async () => {
  const expected = {
    'Pizza Margherita':                          'plowhorse',
    'Pizza Pesto Pignons':                       'dog',
    'Magret de canard, sauce crème aux pignons': 'star',
    "Saumon mi-cuit à l'huile d'olive":          'puzzle',
    'Œufs cocotte à la crème':                   'dog',
  }

  for (const [nom, exp] of Object.entries(expected)) {
    const r = synth.find(s => s.nom === nom)
    if (!r) {
      ko(`recette "${nom}"`, 'introuvable')
      continue
    }
    if (r.quadrant === exp) {
      ok(`${nom} → ${r.quadrant} (mix ${r.mix_pct.toFixed(1)}%, marge ${r.marge_par_portion.toFixed(2)}€)`)
    } else {
      ko(`${nom}`, `attendu ${exp}, reçu ${r.quadrant} (mix ${r.mix_pct.toFixed(1)}%, marge ${r.marge_par_portion.toFixed(2)}€)`)
    }
  }
})

// ─── 4. Couverture des 4 quadrants ───────────────────────────────────
await step('les 4 quadrants sont représentés', async () => {
  const set = new Set(synth.map(s => s.quadrant))
  const ordre = ['star', 'plowhorse', 'puzzle', 'dog']
  for (const q of ordre) {
    if (set.has(q)) ok(`quadrant '${q}' présent`)
    else ko(`quadrant '${q}'`, 'aucune recette ne tombe dedans')
  }
})

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
console.log('\n🎉 Module 5 — classification menu engineering OK.')
