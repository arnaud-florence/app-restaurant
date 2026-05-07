// Test d'intégration Module 18 — Déchets /admin/dechets.

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
const cleanup = { peseesIds: [], collectesIds: [] }

function ok(m) { console.log(`  ✓ ${m}`); nbOk++ }
function ko(m, e) { console.log(`  ✗ ${m} — ${e}`); nbKo++; fails.push(`${m}: ${e}`) }
async function step(name, fn) { console.log(`\n→ ${name}`); try { await fn() } catch (e) { ko(`${name} (exception)`, e.message) } }

console.log(`╔══════════════════════════════════════════════════════════╗`)
console.log(`║ Test Module 18 — Déchets /admin/dechets                 ║`)
console.log(`╚══════════════════════════════════════════════════════════╝`)

// ─── 1. Schéma ──────────────────────────────────────────────────────
await step('schéma : tables suivi_dechets + collectes_dechets', async () => {
  for (const t of ['suivi_dechets', 'collectes_dechets']) {
    const { error } = await sb.from(t).select('*').limit(1)
    if (error) ko(`table ${t}`, error.message); else ok(`table ${t} accessible`)
  }
})

// ─── 2. CRUD pesées ────────────────────────────────────────────────
await step('suivi_dechets : 3 pesées (bio + carton + huile)', async () => {
  const today = new Date().toISOString().slice(0, 10)
  for (const [type, poids, cout] of [['biodechet', 3.5, 12.50], ['carton', 8.0, 0], ['huile', 5.0, 0]]) {
    const { data, error } = await sb.from('suivi_dechets').insert({
      date_pesee: today, type_dechet: type, poids_kg: poids, cout_estime: cout,
    }).select('id, type_dechet, poids_kg').single()
    if (error) throw new Error(`${type}: ${error.message}`)
    cleanup.peseesIds.push(data.id)
    ok(`pesée ${type} : ${data.poids_kg} kg`)
  }
})

// ─── 3. Agrégat par type ───────────────────────────────────────────
await step('agrégat : sum poids par type', async () => {
  const { data } = await sb.from('suivi_dechets').select('type_dechet, poids_kg').in('id', cleanup.peseesIds)
  const m = new Map()
  for (const p of data ?? []) m.set(p.type_dechet, (m.get(p.type_dechet) ?? 0) + Number(p.poids_kg))
  if (m.get('biodechet') === 3.5) ok('agrégat biodéchet = 3.5 kg ✓')
  else ko('biodechet', m.get('biodechet'))
  const total = (data ?? []).reduce((s, p) => s + Number(p.poids_kg), 0)
  if (Math.abs(total - 16.5) < 0.01) ok(`total 3 pesées = ${total} kg ✓`)
})

// ─── 4. Collecte avec BSD ──────────────────────────────────────────
await step('collectes_dechets : enlèvement biodéchet avec BSD', async () => {
  const { data, error } = await sb.from('collectes_dechets').insert({
    type_dechet: 'biodechet',
    date_collecte: new Date().toISOString().slice(0, 10),
    prestataire: 'TEST18-Veolia',
    poids_total_kg: 25.5,
    num_bsd: 'BSD-TEST18-2026-001',
    cout_collecte: 45.00,
  }).select('id, num_bsd, poids_total_kg').single()
  if (error) throw new Error(error.message)
  cleanup.collectesIds.push(data.id)
  if (data.num_bsd === 'BSD-TEST18-2026-001') ok(`BSD ${data.num_bsd} enregistré ✓`)
  else ko('bsd', data.num_bsd)
  if (Number(data.poids_total_kg) === 25.5) ok('poids 25.5 kg enregistré ✓')
})

// ─── 5. HTTP : routes ──────────────────────────────────────────────
if (BASE) {
  await step(`HTTP : GET /admin/dechets + rapport-annuel/print`, async () => {
    let serverUp = false
    try { const r = await fetch(BASE, { signal: AbortSignal.timeout(2000) }); serverUp = r.ok || r.status < 500 }
    catch { console.log('  ⚠ pas de dev server'); return }
    if (!serverUp) { console.log('  ⚠ injoignable'); return }

    const r1 = await fetch(`${BASE}/admin/dechets`, { signal: AbortSignal.timeout(60000) })
    if (r1.status !== 200) { ko('GET /admin/dechets', `HTTP ${r1.status}`); return }
    ok(`GET /admin/dechets → 200`)

    const r2 = await fetch(`${BASE}/admin/dechets/rapport-annuel/print`, { signal: AbortSignal.timeout(60000) })
    if (r2.status !== 200) { ko('GET rapport-annuel/print', `HTTP ${r2.status}`); return }
    const html = await r2.text()
    ok(`GET rapport-annuel/print → 200`)
    if (html.includes('Rapport annuel')) ok('contient "Rapport annuel"')
  })
} else {
  console.log('\n→ HTTP : skip (PORT non défini)')
}

// ─── Cleanup ────────────────────────────────────────────────────────
console.log('\n→ Cleanup…')
if (cleanup.collectesIds.length > 0) {
  await sb.from('collectes_dechets').delete().in('id', cleanup.collectesIds)
  console.log(`  ✓ ${cleanup.collectesIds.length} collecte(s) supprimée(s)`)
}
if (cleanup.peseesIds.length > 0) {
  await sb.from('suivi_dechets').delete().in('id', cleanup.peseesIds)
  console.log(`  ✓ ${cleanup.peseesIds.length} pesée(s) supprimée(s)`)
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
console.log('\n🎉 Module 18 — Déchets OK.')
