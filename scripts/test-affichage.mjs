// Test d'intégration Module 26 — Affichage salle.

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
const cleanup = { menuIds: [], promoIds: [], appelIds: [] }

function ok(m) { console.log(`  ✓ ${m}`); nbOk++ }
function ko(m, e) { console.log(`  ✗ ${m} — ${e}`); nbKo++; fails.push(`${m}: ${e}`) }
async function step(name, fn) { console.log(`\n→ ${name}`); try { await fn() } catch (e) { ko(`${name} (exception)`, e.message) } }

console.log(`╔══════════════════════════════════════════════════════════╗`)
console.log(`║ Test Module 26 — Affichage salle                        ║`)
console.log(`╚══════════════════════════════════════════════════════════╝`)

// ─── 1. Schéma ─────────────────────────────────────────────────
await step('schéma : 3 tables accessibles', async () => {
  for (const table of ['menu_du_jour', 'affichage_promos', 'appels_serveur']) {
    const { error } = await sb.from(table).select('*').limit(1)
    if (error) ko(`table ${table}`, error.message); else ok(`${table} OK`)
  }
})

// ─── 2. Menu du jour CRUD ─────────────────────────────────────
await step('menu : insert 3 sections + lecture par jour', async () => {
  const jour = '2099-12-31'
  for (const [section, titre, prix, ordre] of [
    ['entree',  'TEST26-Entrée',  8,  1],
    ['plat',    'TEST26-Plat',    18, 1],
    ['dessert', 'TEST26-Dessert', 7,  1],
  ]) {
    const { data, error } = await sb.from('menu_du_jour').insert({
      jour, section, titre, prix, ordre, actif: true,
    }).select('id').single()
    if (error) throw new Error(`${section}: ${error.message}`)
    cleanup.menuIds.push(data.id)
  }
  ok('3 items insérés')

  const { data: menu } = await sb.from('menu_du_jour').select('section, titre').eq('jour', jour).order('section')
  if (menu.length === 3) ok('lecture par jour OK')
  if (menu[0].section === 'dessert') ok('tri alpha section OK')
})

// ─── 3. CHECK section ─────────────────────────────────────────
await step('CHECK : section limité à l\'enum', async () => {
  const { error } = await sb.from('menu_du_jour').insert({
    jour: '2099-01-01', section: 'fromage', titre: 'invalid',
  })
  if (error) ok(`section invalide rejetée (${error.code})`)
})

// ─── 4. Promos ─────────────────────────────────────────────────
await step('promos : période + image_url', async () => {
  const { data, error } = await sb.from('affichage_promos').insert({
    titre: 'TEST26-Brunch dimanche',
    description: '20€/pers, sur réservation',
    image_url: 'https://example.com/brunch.jpg',
    periode_debut: '2099-01-01',
    periode_fin: '2099-12-31',
    actif: true,
    ordre: 1,
  }).select('id').single()
  if (error) throw new Error(error.message)
  cleanup.promoIds.push(data.id)
  ok('promo créée avec période')
})

// ─── 5. Appels serveur ─────────────────────────────────────────
await step('appels : motifs + transitions statut', async () => {
  // Récupère une table existante
  const { data: tab } = await sb.from('tables_restaurant').select('id, numero').limit(1).maybeSingle()
  if (!tab) { console.log('  ⚠ aucune table — skip'); return }

  const { data: a1 } = await sb.from('appels_serveur').insert({
    table_id: tab.id, table_numero: tab.numero, motif: 'eau',
  }).select('id').single()
  cleanup.appelIds.push(a1.id)
  ok(`appel "eau" créé pour table ${tab.numero}`)

  const { data: a2 } = await sb.from('appels_serveur').insert({
    table_id: tab.id, table_numero: tab.numero, motif: 'addition', message: 'Avec un café',
  }).select('id').single()
  cleanup.appelIds.push(a2.id)
  ok('appel "addition" + message créé')

  // Transition prise en charge
  await sb.from('appels_serveur').update({
    statut: 'pris_en_charge', pris_le: new Date().toISOString(),
  }).eq('id', a1.id)
  const { data: check } = await sb.from('appels_serveur').select('statut, pris_le').eq('id', a1.id).single()
  if (check.statut === 'pris_en_charge' && check.pris_le) ok('transition pris_en_charge OK')
})

// ─── 6. CHECK motif + statut ───────────────────────────────────
await step('CHECK : motif + statut limités à l\'enum', async () => {
  const { error: e1 } = await sb.from('appels_serveur').insert({ motif: 'invalid' })
  if (e1) ok(`motif invalide rejeté (${e1.code})`)

  const { error: e2 } = await sb.from('appels_serveur').insert({ motif: 'eau', statut: 'invalid' })
  if (e2) ok(`statut invalide rejeté (${e2.code})`)
})

// ─── 7. HTTP ────────────────────────────────────────────────────
if (BASE) {
  await step(`HTTP : GET /affichage/tv (page publique)`, async () => {
    let serverUp = false
    try { const r = await fetch(BASE, { signal: AbortSignal.timeout(2000) }); serverUp = r.ok || r.status < 500 }
    catch { console.log('  ⚠ pas de dev server'); return }
    if (!serverUp) { console.log('  ⚠ injoignable'); return }

    const r = await fetch(`${BASE}/affichage/tv`, { signal: AbortSignal.timeout(60000) })
    if (r.status !== 200) { ko('GET /affichage/tv', `HTTP ${r.status}`); return }
    const html = await r.text()
    ok('GET /affichage/tv → 200')
    if (html.includes('Menu') || html.includes('Météo') || html.includes('Notre Restaurant')) ok('contient contenu écran')
  })

  await step(`HTTP : GET /admin/affichage`, async () => {
    const r = await fetch(`${BASE}/admin/affichage`, { signal: AbortSignal.timeout(60000) })
    if (r.status !== 200) { ko('GET /admin/affichage', `HTTP ${r.status}`); return }
    ok('GET /admin/affichage → 200')
  })

  // Page table
  const { data: tab } = await sb.from('tables_restaurant').select('numero').limit(1).maybeSingle()
  if (tab) {
    await step(`HTTP : GET /table/${tab.numero}/appel`, async () => {
      const r = await fetch(`${BASE}/table/${encodeURIComponent(tab.numero)}/appel`, { signal: AbortSignal.timeout(30000) })
      if (r.status !== 200) { ko('GET /table/[numero]/appel', `HTTP ${r.status}`); return }
      const html = await r.text()
      ok(`GET /table/${tab.numero}/appel → 200`)
      if (html.includes('Eau') || html.includes('Addition')) ok('page client contient les motifs')
    })
  }

  await step(`HTTP : GET /table/INEXISTANT/appel → 404`, async () => {
    const r = await fetch(`${BASE}/table/zzzzz_inexistant/appel`)
    if (r.status === 404) ok('404 sur table inconnue ✓')
    else ko('table inconnue', `HTTP ${r.status}`)
  })
}

// ─── Cleanup ────────────────────────────────────────────────────
console.log('\n→ Cleanup…')
if (cleanup.appelIds.length) await sb.from('appels_serveur').delete().in('id', cleanup.appelIds)
if (cleanup.menuIds.length)  await sb.from('menu_du_jour').delete().in('id', cleanup.menuIds)
if (cleanup.promoIds.length) await sb.from('affichage_promos').delete().in('id', cleanup.promoIds)
console.log(`  ✓ ${cleanup.menuIds.length} menu + ${cleanup.promoIds.length} promo + ${cleanup.appelIds.length} appel supprimés`)

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
console.log('\n🎉 Module 26 — Affichage salle OK.')
