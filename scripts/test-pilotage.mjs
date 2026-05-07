// Test d'intégration Module 25 — Pilotage stratégique /admin/pilotage.

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
const cleanup = { objIds: [], actIds: [] }

function ok(m) { console.log(`  ✓ ${m}`); nbOk++ }
function ko(m, e) { console.log(`  ✗ ${m} — ${e}`); nbKo++; fails.push(`${m}: ${e}`) }
async function step(name, fn) { console.log(`\n→ ${name}`); try { await fn() } catch (e) { ko(`${name} (exception)`, e.message) } }

console.log(`╔══════════════════════════════════════════════════════════╗`)
console.log(`║ Test Module 25 — Pilotage /admin/pilotage               ║`)
console.log(`╚══════════════════════════════════════════════════════════╝`)

// ─── 1. Schéma ───────────────────────────────────────────────────
await step('schéma : objectifs + actions_strategiques', async () => {
  const { error: e1 } = await sb.from('objectifs').select('*').limit(1)
  if (e1) ko('table objectifs', e1.message); else ok('table objectifs accessible')
  const { error: e2 } = await sb.from('actions_strategiques').select('*').limit(1)
  if (e2) ko('table actions', e2.message); else ok('table actions_strategiques accessible')
})

// ─── 2. Objectifs CRUD + UNIQUE ────────────────────────────────
await step('objectifs : insert mensuel + annuel + UNIQUE', async () => {
  const mois = '2099-12'
  const { data: o1, error: e1 } = await sb.from('objectifs').insert({
    periode: 'mensuel', mois, annee: 2099, kpi: 'ca', valeur_cible: 30000, unite: 'eur',
  }).select('id').single()
  if (e1) throw new Error(e1.message)
  cleanup.objIds.push(o1.id)
  ok('objectif mensuel CA 30000€ créé')

  const { data: o2 } = await sb.from('objectifs').insert({
    periode: 'annuel', mois: null, annee: 2099, kpi: 'food_cost_pct', valeur_cible: 28, unite: 'pct',
  }).select('id').single()
  cleanup.objIds.push(o2.id)
  ok('objectif annuel food_cost créé')

  // UNIQUE — re-insert même clé doit échouer
  const { error: dup } = await sb.from('objectifs').insert({
    periode: 'mensuel', mois, annee: 2099, kpi: 'ca', valeur_cible: 35000, unite: 'eur',
  })
  if (dup) ok(`UNIQUE rejette le doublon (${dup.code})`)
  else ko('UNIQUE', 'doublon accepté')
})

// ─── 3. CHECK enum kpi ─────────────────────────────────────────
await step('CHECK : kpi limité à l\'enum', async () => {
  const { error } = await sb.from('objectifs').insert({
    periode: 'mensuel', mois: '2099-01', annee: 2099, kpi: 'kpi_inexistant', valeur_cible: 1, unite: 'eur',
  })
  if (error) ok(`kpi invalide rejeté (${error.code})`)
  else ko('CHECK kpi', 'aucune erreur')
})

// ─── 4. Actions stratégiques ────────────────────────────────────
await step('actions : CRUD + transitions statut', async () => {
  const { data, error } = await sb.from('actions_strategiques').insert({
    titre: 'TEST25 réviser carte été',
    description: 'Identifier 3 plats à retirer + 5 à ajouter',
    kpi_lie: 'food_cost_pct', priorite: 'haute', echeance: '2099-06-01',
  }).select('id').single()
  if (error) throw new Error(error.message)
  cleanup.actIds.push(data.id)
  ok('action créée')

  // transition statut
  await sb.from('actions_strategiques').update({ statut: 'en_cours' }).eq('id', data.id)
  await sb.from('actions_strategiques').update({ statut: 'fait', fait_le: new Date().toISOString() }).eq('id', data.id)
  const { data: check } = await sb.from('actions_strategiques').select('statut, fait_le').eq('id', data.id).single()
  if (check.statut === 'fait' && check.fait_le) ok('transitions statut + fait_le ok')
  else ko('statut', `${check.statut}/${check.fait_le}`)
})

// ─── 5. CHECK statut + priorite ──────────────────────────────
await step('CHECK : statut + priorite', async () => {
  const { error: e1 } = await sb.from('actions_strategiques').insert({
    titre: 'TEST25 bad statut', statut: 'invalid',
  })
  if (e1) ok(`statut invalide rejeté (${e1.code})`)

  const { error: e2 } = await sb.from('actions_strategiques').insert({
    titre: 'TEST25 bad priorite', priorite: 'urgent',
  })
  if (e2) ok(`priorite invalide rejetée (${e2.code})`)
})

// ─── 6. HTTP ─────────────────────────────────────────────────────
if (BASE) {
  await step(`HTTP : GET /admin/pilotage`, async () => {
    let serverUp = false
    try { const r = await fetch(BASE, { signal: AbortSignal.timeout(2000) }); serverUp = r.ok || r.status < 500 }
    catch { console.log('  ⚠ pas de dev server'); return }
    if (!serverUp) { console.log('  ⚠ injoignable'); return }
    const r = await fetch(`${BASE}/admin/pilotage`, { signal: AbortSignal.timeout(60000) })
    if (r.status !== 200) { ko('GET /admin/pilotage', `HTTP ${r.status}`); return }
    const html = await r.text()
    ok(`GET /admin/pilotage → 200`)
    if (html.includes('Pilotage')) ok('contient titre Pilotage')
    if (html.includes('Indicateurs') || html.includes('CA mois')) ok('contient KPIs')
  })

  await step(`HTTP : GET /manifest.webmanifest`, async () => {
    const r = await fetch(`${BASE}/manifest.webmanifest`)
    if (r.status !== 200) { ko('manifest', `HTTP ${r.status}`); return }
    const json = await r.json()
    ok(`manifest → 200`)
    if (json.name && json.icons?.length >= 2) ok(`manifest valide (${json.icons.length} icônes)`)
    if (json.start_url === '/admin/pilotage') ok('start_url = /admin/pilotage')
  })

  await step(`HTTP : GET /sw.js`, async () => {
    const r = await fetch(`${BASE}/sw.js`)
    if (r.status === 200) ok(`sw.js → 200`)
    else ko('sw.js', `HTTP ${r.status}`)
  })

  await step(`HTTP : GET /icon-192.png + /icon.svg`, async () => {
    const [r1, r2] = await Promise.all([
      fetch(`${BASE}/icon-192.png`),
      fetch(`${BASE}/icon.svg`),
    ])
    if (r1.status === 200) ok('icon-192.png → 200')
    if (r2.status === 200) ok('icon.svg → 200')
  })
} else {
  console.log('\n→ HTTP : skip (PORT non défini)')
}

// ─── Cleanup ────────────────────────────────────────────────────
console.log('\n→ Cleanup…')
if (cleanup.actIds.length) await sb.from('actions_strategiques').delete().in('id', cleanup.actIds)
if (cleanup.objIds.length) await sb.from('objectifs').delete().in('id', cleanup.objIds)
console.log(`  ✓ ${cleanup.actIds.length} action(s) + ${cleanup.objIds.length} objectif(s) supprimés`)

// ─── Bilan ─────────────────────────────────────────────────────
console.log(`\n╔══════════════════════════════════════════════════════════╗`)
console.log(`║ ✓ ${nbOk}/${nbOk + nbKo}  réussites${' '.repeat(Math.max(0, 42 - String(nbOk).length - String(nbOk + nbKo).length))}║`)
console.log(`║ ✗ ${nbKo}/${nbOk + nbKo}  échecs${' '.repeat(Math.max(0, 45 - String(nbKo).length - String(nbOk + nbKo).length))}║`)
console.log(`╚══════════════════════════════════════════════════════════╝`)
if (nbKo > 0) {
  console.log('\nÉchecs :')
  for (const f of fails) console.log(`  • ${f}`)
  process.exit(1)
}
console.log('\n🎉 Module 25 — Pilotage OK.')
