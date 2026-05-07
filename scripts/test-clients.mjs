// Test d'intégration Module 20 — Clients & fidélité /admin/clients.

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
const cleanup = { clientIds: [], campagneIds: [], reclamIds: [], retourIds: [] }

function ok(m) { console.log(`  ✓ ${m}`); nbOk++ }
function ko(m, e) { console.log(`  ✗ ${m} — ${e}`); nbKo++; fails.push(`${m}: ${e}`) }
async function step(name, fn) { console.log(`\n→ ${name}`); try { await fn() } catch (e) { ko(`${name} (exception)`, e.message) } }

console.log(`╔══════════════════════════════════════════════════════════╗`)
console.log(`║ Test Module 20 — Clients /admin/clients                 ║`)
console.log(`╚══════════════════════════════════════════════════════════╝`)

// ─── 1. Schéma ──────────────────────────────────────────────────────
await step('schéma : 4 tables Module 20', async () => {
  for (const t of ['clients','campagnes','reclamations','retours_plats']) {
    const { error } = await sb.from(t).select('*').limit(1)
    if (error) ko(`table ${t}`, error.message); else ok(`table ${t} accessible`)
  }
  // Vérif colonnes ajoutées
  for (const col of ['code_parrainage','parraine_par_id','opt_in_marketing','total_depense','nb_visites']) {
    const { error } = await sb.from('clients').select(col).limit(1)
    if (error) ko(`colonne clients.${col}`, error.message); else ok(`colonne clients.${col} présente`)
  }
})

// ─── 2. CRUD client + parrainage ──────────────────────────────────
let parrainId, filleulId
await step('clients : parrain + filleul avec lien parraine_par_id', async () => {
  const { data: p, error: pErr } = await sb.from('clients').insert({
    prenom: 'TEST20-Parrain', nom: 'Dupont',
    email: 'parrain.test20@example.com',
    code_parrainage: 'PARTEST20-001',
    opt_in_marketing: true,
  }).select('id, code_parrainage').single()
  if (pErr) throw new Error(pErr.message)
  parrainId = p.id
  cleanup.clientIds.push(parrainId)
  ok(`parrain créé code=${p.code_parrainage}`)

  const { data: f, error: fErr } = await sb.from('clients').insert({
    prenom: 'TEST20-Filleul', nom: 'Martin',
    email: 'filleul.test20@example.com',
    code_parrainage: 'FILTEST20-001',
    parraine_par_id: parrainId,
    opt_in_marketing: false,
  }).select('id, parraine_par_id').single()
  if (fErr) throw new Error(fErr.message)
  filleulId = f.id
  cleanup.clientIds.push(filleulId)
  if (f.parraine_par_id === parrainId) ok('filleul lié au parrain ✓')
  else ko('parrainage', f.parraine_par_id)
})

// ─── 3. Campagne avec segment ──────────────────────────────────────
await step('campagnes : create + segment opt-in', async () => {
  const { data, error } = await sb.from('campagnes').insert({
    titre: 'TEST20-Promo Saint-Valentin',
    type: 'email', segment: 'tous',
    sujet: 'Une soirée romantique pour vous !',
    contenu: 'Cher {prenom}, profitez de notre menu spécial...',
    nb_destinataires: 1,  // seul le parrain a opt-in dans ce test
    statut: 'brouillon',
  }).select('id, statut').single()
  if (error) throw new Error(error.message)
  cleanup.campagneIds.push(data.id)
  if (data.statut === 'brouillon') ok('campagne créée en brouillon ✓')

  // Marquer envoyée
  await sb.from('campagnes').update({ statut: 'envoyee', date_envoi: new Date().toISOString() }).eq('id', data.id)
  const { data: check } = await sb.from('campagnes').select('statut, date_envoi').eq('id', data.id).single()
  if (check.statut === 'envoyee' && check.date_envoi) ok('marquage envoyée + horodatage ✓')
})

// ─── 4. Réclamation : workflow ─────────────────────────────────────
await step('reclamations : create + résolution', async () => {
  const { data, error } = await sb.from('reclamations').insert({
    client_id: parrainId,
    date_reclamation: '2026-05-07',
    type: 'plat',
    gravite: 'majeure',
    description: 'TEST20 — Plat froid',
    geste_commercial: 'Plat refait',
  }).select('id, statut').single()
  if (error) throw new Error(error.message)
  cleanup.reclamIds.push(data.id)
  ok(`réclamation créée (statut=${data.statut})`)

  // Résoudre
  await sb.from('reclamations').update({
    statut: 'resolue',
    action_corrective: 'Sensibilisation équipe cuisine',
    resolved_at: new Date().toISOString(),
  }).eq('id', data.id)
  const { data: check } = await sb.from('reclamations').select('statut, resolved_at').eq('id', data.id).single()
  if (check.statut === 'resolue' && check.resolved_at) ok('résolution + horodatage ✓')
})

// ─── 5. Retour plat avec impact food cost ─────────────────────────
await step('retours_plats : enregistrement avec coût matière', async () => {
  const { data, error } = await sb.from('retours_plats').insert({
    client_id: filleulId,
    date_retour: '2026-05-07',
    recette_nom_libre: 'TEST20-Magret',
    motif: 'cuisson',
    description: 'Trop saignant',
    cout_food_cost: 8.50,
    geste_commercial: 'Plat refait',
    refait: true,
  }).select('id, cout_food_cost, refait').single()
  if (error) throw new Error(error.message)
  cleanup.retourIds.push(data.id)
  if (Number(data.cout_food_cost) === 8.50) ok('coût food cost 8.50€ enregistré ✓')
  if (data.refait === true) ok('plat marqué refait ✓')
})

// ─── 6. HTTP : routes ──────────────────────────────────────────────
if (BASE) {
  await step(`HTTP : GET /admin/clients + /wifi-signup`, async () => {
    let serverUp = false
    try { const r = await fetch(BASE, { signal: AbortSignal.timeout(2000) }); serverUp = r.ok || r.status < 500 }
    catch { console.log('  ⚠ pas de dev server'); return }
    if (!serverUp) { console.log('  ⚠ injoignable'); return }

    const r1 = await fetch(`${BASE}/admin/clients`, { signal: AbortSignal.timeout(60000) })
    if (r1.status !== 200) { ko('GET /admin/clients', `HTTP ${r1.status}`); return }
    ok(`GET /admin/clients → 200`)

    const r2 = await fetch(`${BASE}/wifi-signup`, { signal: AbortSignal.timeout(60000) })
    if (r2.status !== 200) { ko('GET /wifi-signup', `HTTP ${r2.status}`); return }
    const html = await r2.text()
    ok(`GET /wifi-signup → 200`)
    if (html.includes('WiFi')) ok('page WiFi contient "WiFi"')
    if (html.includes('RGPD')) ok('page WiFi contient mention RGPD')
  })
} else {
  console.log('\n→ HTTP : skip (PORT non défini)')
}

// ─── Cleanup ────────────────────────────────────────────────────────
console.log('\n→ Cleanup…')
if (cleanup.retourIds.length > 0) { await sb.from('retours_plats').delete().in('id', cleanup.retourIds); console.log(`  ✓ ${cleanup.retourIds.length} retours`) }
if (cleanup.reclamIds.length > 0) { await sb.from('reclamations').delete().in('id', cleanup.reclamIds); console.log(`  ✓ ${cleanup.reclamIds.length} réclamations`) }
if (cleanup.campagneIds.length > 0) { await sb.from('campagnes').delete().in('id', cleanup.campagneIds); console.log(`  ✓ ${cleanup.campagneIds.length} campagnes`) }
if (cleanup.clientIds.length > 0) { await sb.from('clients').delete().in('id', cleanup.clientIds); console.log(`  ✓ ${cleanup.clientIds.length} clients`) }

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
console.log('\n🎉 Module 20 — Clients OK.')
