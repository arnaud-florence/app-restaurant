// Test d'intégration Module 23 — Journal /admin/journal.

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
const cleanup = { entreeIds: [] }

function ok(m) { console.log(`  ✓ ${m}`); nbOk++ }
function ko(m, e) { console.log(`  ✗ ${m} — ${e}`); nbKo++; fails.push(`${m}: ${e}`) }
async function step(name, fn) { console.log(`\n→ ${name}`); try { await fn() } catch (e) { ko(`${name} (exception)`, e.message) } }

console.log(`╔══════════════════════════════════════════════════════════╗`)
console.log(`║ Test Module 23 — Journal /admin/journal                 ║`)
console.log(`╚══════════════════════════════════════════════════════════╝`)

await step('schéma : table journal_entrees', async () => {
  const { error } = await sb.from('journal_entrees').select('*').limit(1)
  if (error) ko('table', error.message); else ok('table accessible')
})

await step('CRUD : 4 entrées avec humeurs différentes', async () => {
  for (const [date, humeur, titre, ca] of [
    ['2099-01-01', 'tres_bonne',  'TEST23-Excellent',  1500],
    ['2099-01-02', 'bonne',       'TEST23-Bien',        1200],
    ['2099-01-03', 'difficile',   'TEST23-Difficile',   600],
    ['2099-01-04', 'normale',     'TEST23-Normal',      900],
  ]) {
    const { data, error } = await sb.from('journal_entrees').insert({
      date_entree: date, humeur,
      titre, contenu: `Test contenu pour ${humeur}`,
      tags: ['test23', humeur],
      ca_jour_snap: ca,
      meteo_snap: 'ensoleille',
    }).select('id').single()
    if (error) throw new Error(`${humeur}: ${error.message}`)
    cleanup.entreeIds.push(data.id)
  }
  ok('4 entrées créées (très_bonne / bonne / difficile / normale)')
})

await step('analyses : score moyen + CA moyen par humeur', async () => {
  const { data } = await sb.from('journal_entrees').select('humeur, ca_jour_snap').in('id', cleanup.entreeIds)
  const scoreMap = { tres_bonne: 5, bonne: 4, normale: 3, difficile: 2, tres_difficile: 1 }
  const total = data.reduce((s, e) => s + scoreMap[e.humeur], 0)
  const moyenne = total / data.length
  // (5+4+2+3) / 4 = 14/4 = 3.5
  if (Math.abs(moyenne - 3.5) < 0.01) ok(`score moyen = ${moyenne.toFixed(2)} (attendu 3.5)`)
  else ko('score', moyenne)

  // CA moyen pour humeur = bonne (1200€)
  const bons = data.filter(e => e.humeur === 'bonne')
  const caBonneMoyen = bons.reduce((s, e) => s + Number(e.ca_jour_snap), 0) / bons.length
  if (caBonneMoyen === 1200) ok('CA moyen "bonne" = 1200€ ✓')
})

await step('recherche par tags : array contains', async () => {
  const { data } = await sb.from('journal_entrees').select('id').contains('tags', ['test23']).in('id', cleanup.entreeIds)
  if (data.length === 4) ok('4 entrées avec tag "test23" ✓')
  else ko('tags', data.length)
})

if (BASE) {
  await step(`HTTP : GET /admin/journal`, async () => {
    let serverUp = false
    try { const r = await fetch(BASE, { signal: AbortSignal.timeout(2000) }); serverUp = r.ok || r.status < 500 }
    catch { console.log('  ⚠ pas de dev server'); return }
    if (!serverUp) { console.log('  ⚠ injoignable'); return }
    const r = await fetch(`${BASE}/admin/journal`, { signal: AbortSignal.timeout(60000) })
    if (r.status !== 200) { ko('GET /admin/journal', `HTTP ${r.status}`); return }
    const html = await r.text()
    ok(`GET /admin/journal → 200`)
    if (html.includes('Journal')) ok('contient titre Journal')
  })
}

console.log('\n→ Cleanup…')
if (cleanup.entreeIds.length > 0) {
  await sb.from('journal_entrees').delete().in('id', cleanup.entreeIds)
  console.log(`  ✓ ${cleanup.entreeIds.length} entrées supprimées`)
}

console.log(`\n╔══════════════════════════════════════════════════════════╗`)
console.log(`║ ✓ ${nbOk}/${nbOk + nbKo}  réussites${' '.repeat(Math.max(0, 42 - String(nbOk).length - String(nbOk + nbKo).length))}║`)
console.log(`║ ✗ ${nbKo}/${nbOk + nbKo}  échecs${' '.repeat(Math.max(0, 45 - String(nbKo).length - String(nbOk + nbKo).length))}║`)
console.log(`╚══════════════════════════════════════════════════════════╝`)
if (nbKo > 0) {
  console.log('\nÉchecs :')
  for (const f of fails) console.log(`  • ${f}`)
  process.exit(1)
}
console.log('\n🎉 Module 23 — Journal OK.')
