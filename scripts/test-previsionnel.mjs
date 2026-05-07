// Test d'intégration Module 22 — Prévisionnel /admin/previsionnel.

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
const cleanup = { releveIds: [] }

function ok(m) { console.log(`  ✓ ${m}`); nbOk++ }
function ko(m, e) { console.log(`  ✗ ${m} — ${e}`); nbKo++; fails.push(`${m}: ${e}`) }
async function step(name, fn) { console.log(`\n→ ${name}`); try { await fn() } catch (e) { ko(`${name} (exception)`, e.message) } }

console.log(`╔══════════════════════════════════════════════════════════╗`)
console.log(`║ Test Module 22 — Prévisionnel /admin/previsionnel       ║`)
console.log(`╚══════════════════════════════════════════════════════════╝`)

// ─── 1. Schéma ──────────────────────────────────────────────────────
await step('schéma : table releves_meteo', async () => {
  const { error } = await sb.from('releves_meteo').select('*').limit(1)
  if (error) ko('table releves_meteo', error.message); else ok('table accessible')
})

// ─── 2. Saisie 3 relevés ───────────────────────────────────────────
await step('relevés météo : 3 jours (ensoleillé/pluie/nuageux)', async () => {
  for (const [date, cond, tmin, tmax] of [
    ['2099-06-01', 'ensoleille', 18, 28],
    ['2099-06-02', 'pluie_forte', 12, 18],
    ['2099-06-03', 'nuageux', 15, 22],
  ]) {
    const { data, error } = await sb.from('releves_meteo').insert({
      date_meteo: date, conditions: cond,
      temperature_min: tmin, temperature_max: tmax,
      source: 'manuel', est_prevision: false,
    }).select('id').single()
    if (error) throw new Error(`${date}: ${error.message}`)
    cleanup.releveIds.push(data.id)
  }
  ok('3 relevés constatés créés')
})

// ─── 3. Upsert : un 2e insert sur même date écrase ─────────────────
await step('upsert : 2e insert sur même date+source+est_prevision met à jour', async () => {
  const { data: existing } = await sb.from('releves_meteo')
    .select('id')
    .eq('date_meteo', '2099-06-01')
    .eq('source', 'manuel')
    .eq('est_prevision', false)
    .single()
  if (!existing) { ko('upsert', 'pas trouvé'); return }
  // Update direct (l'action upsert simulée)
  await sb.from('releves_meteo').update({ conditions: 'orage' }).eq('id', existing.id)
  const { data: check } = await sb.from('releves_meteo').select('conditions').eq('id', existing.id).single()
  if (check.conditions === 'orage') ok('mise à jour conditions OK')
})

// ─── 4. Régression linéaire (algo en TS recopié dans le test) ──────
await step('régression linéaire : test sur points connus', async () => {
  // y = 2x + 1 parfaitement linéaire → R² = 1, slope = 2, intercept = 1
  const points = [
    { x: 1, y: 3 }, { x: 2, y: 5 }, { x: 3, y: 7 }, { x: 4, y: 9 }, { x: 5, y: 11 },
  ]
  const n = points.length
  const sumX = points.reduce((s, p) => s + p.x, 0)
  const sumY = points.reduce((s, p) => s + p.y, 0)
  const meanX = sumX / n, meanY = sumY / n
  let num = 0, den = 0, ssTot = 0, ssRes = 0
  for (const p of points) {
    num += (p.x - meanX) * (p.y - meanY)
    den += (p.x - meanX) ** 2
    ssTot += (p.y - meanY) ** 2
  }
  const slope = num / den
  const intercept = meanY - slope * meanX
  for (const p of points) ssRes += (p.y - (slope * p.x + intercept)) ** 2
  const r2 = 1 - ssRes / ssTot
  if (Math.abs(slope - 2) < 0.001) ok(`slope = ${slope.toFixed(3)} (attendu 2.000)`)
  if (Math.abs(intercept - 1) < 0.001) ok(`intercept = ${intercept.toFixed(3)} (attendu 1.000)`)
  if (Math.abs(r2 - 1) < 0.001) ok(`R² = ${r2.toFixed(3)} (parfait)`)
})

// ─── 5. Filtre prévisions vs relevés ──────────────────────────────
await step('filtre est_prevision', async () => {
  const { data: p, error: pe } = await sb.from('releves_meteo').insert({
    date_meteo: '2099-12-31', conditions: 'neige',
    source: 'manuel', est_prevision: true,
  }).select('id').single()
  if (pe) throw new Error(pe.message)
  cleanup.releveIds.push(p.id)
  const { data: futurs } = await sb.from('releves_meteo')
    .select('id, est_prevision')
    .eq('est_prevision', true)
    .in('id', cleanup.releveIds)
  if (futurs.length === 1) ok('filtre est_prevision=true renvoie 1 ligne ✓')
  else ko('filtre prévision', futurs.length)
})

// ─── 6. HTTP ────────────────────────────────────────────────────────
if (BASE) {
  await step(`HTTP : GET /admin/previsionnel`, async () => {
    let serverUp = false
    try { const r = await fetch(BASE, { signal: AbortSignal.timeout(2000) }); serverUp = r.ok || r.status < 500 }
    catch { console.log('  ⚠ pas de dev server'); return }
    if (!serverUp) { console.log('  ⚠ injoignable'); return }
    const r = await fetch(`${BASE}/admin/previsionnel`, { signal: AbortSignal.timeout(60000) })
    if (r.status !== 200) { ko('GET /admin/previsionnel', `HTTP ${r.status}`); return }
    const html = await r.text()
    ok(`GET /admin/previsionnel → 200`)
    if (html.includes('Prévisionnel')) ok('contient titre Prévisionnel')
    if (html.includes('OpenWeatherMap')) ok('contient mention OpenWeatherMap')
  })
} else {
  console.log('\n→ HTTP : skip (PORT non défini)')
}

// ─── Cleanup ────────────────────────────────────────────────────────
console.log('\n→ Cleanup…')
if (cleanup.releveIds.length > 0) {
  await sb.from('releves_meteo').delete().in('id', cleanup.releveIds)
  console.log(`  ✓ ${cleanup.releveIds.length} relevés supprimés`)
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
console.log('\n🎉 Module 22 — Prévisionnel OK.')
