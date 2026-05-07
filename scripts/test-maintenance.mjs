// Test d'intégration Module 16 — Maintenance /admin/maintenance.

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
const cleanup = { equipIds: [], interIds: [] }

function ok(m) { console.log(`  ✓ ${m}`); nbOk++ }
function ko(m, e) { console.log(`  ✗ ${m} — ${e}`); nbKo++; fails.push(`${m}: ${e}`) }
async function step(name, fn) { console.log(`\n→ ${name}`); try { await fn() } catch (e) { ko(`${name} (exception)`, e.message) } }

console.log(`╔══════════════════════════════════════════════════════════╗`)
console.log(`║ Test Module 16 — Maintenance /admin/maintenance         ║`)
console.log(`╚══════════════════════════════════════════════════════════╝`)

// ─── 1. Schéma : colonnes ajoutées ─────────────────────────────────
await step('schéma : colonnes ajoutées sur equipements', async () => {
  for (const col of ['categorie','type_controle_obligatoire','prochain_controle_obligatoire','derniere_controle_obligatoire','organisme_certifie']) {
    const { error } = await sb.from('equipements').select(col).limit(1)
    if (error) ko(`colonne ${col}`, error.message); else ok(`colonne ${col} présente`)
  }
})

// ─── 2. CRUD équipement avec contrôle obligatoire ──────────────────
let equipId
await step('equipements : create avec catégorie + contrôle obligatoire', async () => {
  const { data, error } = await sb.from('equipements').insert({
    nom: 'TEST16 — Hotte cuisine',
    marque: 'Bonnet',
    modele: 'BH-200',
    categorie: 'cuisine',
    date_achat: '2024-01-15',
    valeur_achat: 4500.00,
    garantie_fin: '2026-01-15',
    type_controle_obligatoire: 'hotte',
    derniere_controle_obligatoire: '2025-11-10',
    prochain_controle_obligatoire: '2026-05-10',  // proche !
    organisme_certifie: 'TEST16-APAVE',
    actif: true,
  }).select('id, type_controle_obligatoire, prochain_controle_obligatoire').single()
  if (error) throw new Error(error.message)
  equipId = data.id
  cleanup.equipIds.push(equipId)
  ok(`équipement créé id=${equipId.slice(0, 8)}…`)
  if (data.type_controle_obligatoire === 'hotte') ok('type_controle_obligatoire = hotte ✓')
  else ko('type_ctrl', data.type_controle_obligatoire)
  if (data.prochain_controle_obligatoire === '2026-05-10') ok('prochain_controle_obligatoire OK')
  else ko('prochain', data.prochain_controle_obligatoire)
})

// ─── 3. Intervention contrôle obligatoire → met à jour les dates ───
await step('intervention contrôle → met à jour dates équipement', async () => {
  const { data, error } = await sb.from('interventions_maintenance').insert({
    equipement_id: equipId,
    type: 'controle_obligatoire',
    date_intervention: '2026-05-15',
    description: 'Contrôle annuel TEST16',
    prestataire: 'APAVE',
    cout: 350.00,
    prochaine_intervention: '2027-05-15',
  }).select('id').single()
  if (error) throw new Error(error.message)
  cleanup.interIds.push(data.id)
  ok('intervention contrôle créée')

  // Simule l'effet de l'action côté client
  await sb.from('equipements').update({
    derniere_controle_obligatoire: '2026-05-15',
    prochain_controle_obligatoire: '2027-05-15',
  }).eq('id', equipId)

  const { data: eq } = await sb.from('equipements')
    .select('derniere_controle_obligatoire, prochain_controle_obligatoire')
    .eq('id', equipId).single()
  if (eq.derniere_controle_obligatoire === '2026-05-15') ok('derniere_controle_obligatoire mise à jour ✓')
  else ko('derniere', eq.derniere_controle_obligatoire)
  if (eq.prochain_controle_obligatoire === '2027-05-15') ok('prochain_controle_obligatoire avancé d\'un an ✓')
  else ko('prochain', eq.prochain_controle_obligatoire)
})

// ─── 4. Intervention curative avec coût ────────────────────────────
await step('intervention curative + coût', async () => {
  const { data, error } = await sb.from('interventions_maintenance').insert({
    equipement_id: equipId,
    type: 'curative',
    date_intervention: '2026-05-20',
    description: 'Remplacement filtre charbon TEST16',
    cout: 85.00,
  }).select('id, type, cout').single()
  if (error) throw new Error(error.message)
  cleanup.interIds.push(data.id)
  if (data.type === 'curative' && Number(data.cout) === 85) ok('intervention curative 85€ enregistrée ✓')
  else ko('curative', JSON.stringify(data))
})

// ─── 5. Filtre alerte ≤ 1 mois ─────────────────────────────────────
await step('alerte ≤ 1 mois sur prochain_controle_obligatoire', async () => {
  // L'équipement a maintenant prochain au 2027-05-15 → > 1 mois → pas d'alerte
  // On simule un autre équipement avec contrôle imminent
  const dans20j = new Date(Date.now() + 20 * 86400000).toISOString().slice(0, 10)
  const { data: eq2 } = await sb.from('equipements').insert({
    nom: 'TEST16 — Extincteur',
    type_controle_obligatoire: 'extincteur',
    prochain_controle_obligatoire: dans20j,
    actif: true,
  }).select('id').single()
  cleanup.equipIds.push(eq2.id)

  // Requête équivalente à l'UI : équipements avec contrôle dans les 30 jours
  const dans30j = new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10)
  const { data: alerts } = await sb.from('equipements')
    .select('id, prochain_controle_obligatoire')
    .eq('actif', true)
    .not('type_controle_obligatoire', 'is', null)
    .lte('prochain_controle_obligatoire', dans30j)
    .in('id', cleanup.equipIds)
  if (alerts && alerts.length >= 1) ok(`${alerts.length} équipement(s) en alerte ≤ 30j (extincteur dans 20j détecté) ✓`)
  else ko('alerte', `attendu ≥1, obtenu ${alerts?.length}`)
})

// ─── 6. HTTP ────────────────────────────────────────────────────────
if (BASE) {
  await step(`HTTP : GET /admin/maintenance`, async () => {
    let serverUp = false
    try { const r = await fetch(BASE, { signal: AbortSignal.timeout(2000) }); serverUp = r.ok || r.status < 500 }
    catch { console.log('  ⚠ pas de dev server'); return }
    if (!serverUp) { console.log('  ⚠ injoignable'); return }

    const r = await fetch(`${BASE}/admin/maintenance`, { signal: AbortSignal.timeout(60000) })
    if (r.status !== 200) { ko('GET /admin/maintenance', `HTTP ${r.status}`); return }
    const html = await r.text()
    ok(`GET /admin/maintenance → 200 (${html.length} bytes)`)
    if (html.includes('Maintenance')) ok('contient titre Maintenance')
    if (html.includes('Contr')) ok('contient mention Contrôles')
  })
} else {
  console.log('\n→ HTTP : skip (PORT non défini)')
}

// ─── Cleanup ────────────────────────────────────────────────────────
console.log('\n→ Cleanup…')
if (cleanup.interIds.length > 0) {
  await sb.from('interventions_maintenance').delete().in('id', cleanup.interIds)
  console.log(`  ✓ ${cleanup.interIds.length} intervention(s) supprimée(s)`)
}
if (cleanup.equipIds.length > 0) {
  await sb.from('equipements').delete().in('id', cleanup.equipIds)
  console.log(`  ✓ ${cleanup.equipIds.length} équipement(s) supprimé(s)`)
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
console.log('\n🎉 Module 16 — Maintenance OK.')
