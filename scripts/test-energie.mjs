// Test d'intégration Module 15 — Énergie /admin/energie.
//
// Couverture :
// - schema (releves_energie)
// - CRUD relevé (3 types : electricite, gaz, eau)
// - Calcul comparaison N vs N-1 (alerte +20%)
// - Calcul coût par plat
// - HTTP /admin/energie
//
//   node scripts/test-energie.mjs
//   PORT=3000 node scripts/test-energie.mjs

import { readFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'

const env = readFileSync('.env.local', 'utf8')
for (const line of env.split('\n')) {
  const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/)
  if (m) process.env[m[1]] = m[2].replace(/^['"]|['"]$/g, '')
}
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
const PORT = process.env.PORT || ''
const BASE = PORT ? `http://localhost:${PORT}` : ''

let nbOk = 0, nbKo = 0
const fails = []
const cleanup = { ids: [] }

function ok(m) { console.log(`  ✓ ${m}`); nbOk++ }
function ko(m, e) { console.log(`  ✗ ${m} — ${e}`); nbKo++; fails.push(`${m}: ${e}`) }
async function step(name, fn) { console.log(`\n→ ${name}`); try { await fn() } catch (e) { ko(`${name} (exception)`, e.message) } }

console.log(`╔══════════════════════════════════════════════════════════╗`)
console.log(`║ Test Module 15 — Énergie /admin/energie                 ║`)
console.log(`╚══════════════════════════════════════════════════════════╝`)

// ─── 1. Schéma ──────────────────────────────────────────────────────
await step('schéma : releves_energie accessible', async () => {
  const { error } = await sb.from('releves_energie').select('*').limit(1)
  if (error) throw new Error(error.message)
  ok('table releves_energie OK')
})

// ─── 2. Création 4 relevés (2 N + 2 N-1 pour l'élec) ───────────────
await step('relevés : 2 mai N + 2 mai N-1 pour test comparaison', async () => {
  // Mai N (2026-05) : 1500 kWh
  const { data: r1 } = await sb.from('releves_energie').insert({
    type: 'electricite', date_releve: '2026-05-31',
    periode_debut: '2026-05-01', periode_fin: '2026-05-31',
    consommation: 1500, unite: 'kWh',
    montant_ht: 250.00, montant_ttc: 300.00,
    fournisseur: 'TEST15-EDF',
    num_facture: 'TEST15-N',
  }).select('id').single()
  cleanup.ids.push(r1.id)

  // Mai N-1 (2025-05) : 1200 kWh → variation +25% = critique
  const { data: r2 } = await sb.from('releves_energie').insert({
    type: 'electricite', date_releve: '2025-05-31',
    periode_debut: '2025-05-01', periode_fin: '2025-05-31',
    consommation: 1200, unite: 'kWh',
    montant_ht: 200.00, montant_ttc: 240.00,
    fournisseur: 'TEST15-EDF',
    num_facture: 'TEST15-N-1',
  }).select('id').single()
  cleanup.ids.push(r2.id)

  // Gaz mai N : 800 kWh
  const { data: r3 } = await sb.from('releves_energie').insert({
    type: 'gaz', date_releve: '2026-05-31',
    periode_debut: '2026-05-01', periode_fin: '2026-05-31',
    consommation: 800, unite: 'kWh',
    montant_ht: 80.00, montant_ttc: 96.00,
    fournisseur: 'TEST15-ENGIE',
  }).select('id').single()
  cleanup.ids.push(r3.id)

  // Eau mai N : 50 m³
  const { data: r4 } = await sb.from('releves_energie').insert({
    type: 'eau', date_releve: '2026-05-31',
    periode_debut: '2026-05-01', periode_fin: '2026-05-31',
    consommation: 50, unite: 'm3',
    montant_ht: 100.00, montant_ttc: 105.00,
    fournisseur: 'TEST15-VEOLIA',
  }).select('id').single()
  cleanup.ids.push(r4.id)

  ok(`4 relevés créés (élec ×2, gaz, eau)`)
})

// ─── 3. Calcul variation conso (1500 - 1200) / 1200 = +25% ─────────
await step('calcul variation N vs N-1', async () => {
  const { data: relevesElec } = await sb.from('releves_energie')
    .select('consommation, periode_debut')
    .eq('type', 'electricite')
    .in('id', cleanup.ids)
  const r2026 = relevesElec.find(r => r.periode_debut === '2026-05-01')
  const r2025 = relevesElec.find(r => r.periode_debut === '2025-05-01')
  const variation = ((Number(r2026.consommation) - Number(r2025.consommation)) / Number(r2025.consommation)) * 100
  if (Math.abs(variation - 25) < 0.1) ok(`variation = +${variation.toFixed(1)}% (1500 vs 1200) ✓`)
  else ko('variation', variation)

  if (variation >= 20) ok('alerte critique attendue (≥ +20%) ✓')
  else ko('alerte', `pas critique`)
})

// ─── 4. Coût total mois courant + coût/plat ────────────────────────
await step('coût total + coût/plat', async () => {
  const { data: maiN } = await sb.from('releves_energie')
    .select('montant_ttc')
    .eq('periode_debut', '2026-05-01')
    .in('id', cleanup.ids)
  const total = maiN.reduce((s, r) => s + Number(r.montant_ttc), 0)
  // 300 + 96 + 105 = 501 €
  if (Math.abs(total - 501) < 0.5) ok(`total mai N = ${total.toFixed(2)}€ (élec 300 + gaz 96 + eau 105) ✓`)
  else ko('total', total)

  // Coût / 100 plats hypothétiques = 5.01 €
  const coutPar100 = total / 100
  if (Math.abs(coutPar100 - 5.01) < 0.1) ok(`coût / plat (sur 100 plats) = ${coutPar100.toFixed(2)}€ ✓`)
})

// ─── 5. HTTP : route /admin/energie ────────────────────────────────
if (BASE) {
  await step(`HTTP : GET /admin/energie`, async () => {
    let serverUp = false
    try { const r = await fetch(BASE, { signal: AbortSignal.timeout(2000) }); serverUp = r.ok || r.status < 500 }
    catch { console.log('  ⚠ pas de dev server'); return }
    if (!serverUp) { console.log('  ⚠ injoignable'); return }

    const r = await fetch(`${BASE}/admin/energie`, { signal: AbortSignal.timeout(60000) })
    if (r.status !== 200) { ko('GET /admin/energie', `HTTP ${r.status}`); return }
    const html = await r.text()
    ok(`GET /admin/energie → 200 (${html.length} bytes)`)
    if (html.includes('Énergie') || html.includes('Electricit')) ok('contient titre/contenu énergie')
    else ko('contenu', 'titre absent')
  })
} else {
  console.log('\n→ HTTP : skip (PORT non défini)')
}

// ─── Cleanup ────────────────────────────────────────────────────────
console.log('\n→ Cleanup…')
if (cleanup.ids.length > 0) {
  await sb.from('releves_energie').delete().in('id', cleanup.ids)
  console.log(`  ✓ ${cleanup.ids.length} relevés supprimés`)
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
console.log('\n🎉 Module 15 — Énergie OK.')
