// Test d'intégration Module 17 — Légal /admin/legal.

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
const cleanup = { oblIds: [], accIds: [], affIds: [] }

function ok(m) { console.log(`  ✓ ${m}`); nbOk++ }
function ko(m, e) { console.log(`  ✗ ${m} — ${e}`); nbKo++; fails.push(`${m}: ${e}`) }
async function step(name, fn) { console.log(`\n→ ${name}`); try { await fn() } catch (e) { ko(`${name} (exception)`, e.message) } }

console.log(`╔══════════════════════════════════════════════════════════╗`)
console.log(`║ Test Module 17 — Légal /admin/legal                     ║`)
console.log(`╚══════════════════════════════════════════════════════════╝`)

// ─── 1. Schéma + seed ─────────────────────────────────────────────
await step('schéma : tables + seed 14 affichages obligatoires', async () => {
  for (const t of ['accidents_travail','affichages_verifications','obligations_legales']) {
    const { error } = await sb.from(t).select('*').limit(1)
    if (error) ko(`table ${t}`, error.message); else ok(`table ${t} accessible`)
  }
  const { count } = await sb.from('affichages_verifications').select('*', {count:'exact', head:true}).eq('obligatoire', true)
  if ((count ?? 0) >= 14) ok(`seed 14 affichages obligatoires : ${count} présents ✓`)
  else ko('seed', `attendu ≥14, obtenu ${count}`)
})

// ─── 2. Obligation légale ──────────────────────────────────────────
await step('obligations_legales : create + statut', async () => {
  const dans20j = new Date(Date.now() + 20 * 86400000).toISOString().slice(0, 10)
  const { data, error } = await sb.from('obligations_legales').insert({
    titre: 'TEST17 — Renouvellement Licence IV',
    categorie: 'licence_iv',
    description: 'Renouvellement obligatoire',
    date_echeance: dans20j,
    frequence: '10 ans',
    statut: 'a_faire',
    prestataire: 'Mairie',
  }).select('id, statut, date_echeance').single()
  if (error) throw new Error(error.message)
  cleanup.oblIds.push(data.id)
  if (data.statut === 'a_faire' && data.date_echeance === dans20j) ok(`obligation créée à échéance dans 20j ✓`)
  else ko('obligation', JSON.stringify(data))
})

// ─── 3. Accident du travail ────────────────────────────────────────
await step('accidents_travail : create avec gravité + déclaration CPAM', async () => {
  const { data: emps } = await sb.from('employes').select('id').eq('actif', true).limit(1)
  const { data, error } = await sb.from('accidents_travail').insert({
    employe_id: emps?.[0]?.id ?? null,
    date_accident: '2026-05-07',
    heure_accident: '14:30:00',
    lieu: 'Cuisine TEST17',
    description: 'Coupure couteau lors préparation légumes',
    gravite: 'legere',
    jours_arret: 3,
    declaration_cpam: true,
    declaration_cpam_date: '2026-05-08',
    temoin: 'Chef de partie',
  }).select('id, gravite, declaration_cpam').single()
  if (error) throw new Error(error.message)
  cleanup.accIds.push(data.id)
  if (data.gravite === 'legere') ok('gravité = légère')
  if (data.declaration_cpam) ok('déclaration CPAM tracée ✓')
})

// ─── 4. Affichage : verification présence ──────────────────────────
await step('affichages : marquer un obligatoire comme présent', async () => {
  const { data: aff } = await sb.from('affichages_verifications').select('id, titre').eq('obligatoire', true).limit(1).single()
  if (!aff) throw new Error('aucun affichage obligatoire')
  await sb.from('affichages_verifications').update({
    present: true, date_verification: '2026-05-07',
  }).eq('id', aff.id)
  const { data: check } = await sb.from('affichages_verifications').select('present, date_verification').eq('id', aff.id).single()
  if (check.present === true && check.date_verification === '2026-05-07') ok(`"${aff.titre}" marqué présent le 2026-05-07 ✓`)
  else ko('marquage', JSON.stringify(check))
  // Reset pour ne pas polluer le state visible
  await sb.from('affichages_verifications').update({ present: false, date_verification: null }).eq('id', aff.id)
})

// ─── 5. Affichage libre (création + suppression) ───────────────────
await step('affichages : création d\'un affichage personnalisé non obligatoire', async () => {
  const { data, error } = await sb.from('affichages_verifications').insert({
    titre: 'TEST17 — Affichage carte vins',
    obligatoire: false, present: true,
    date_verification: '2026-05-07',
    ordre: 99,
  }).select('id, obligatoire').single()
  if (error) throw new Error(error.message)
  cleanup.affIds.push(data.id)
  if (data.obligatoire === false) ok('affichage non obligatoire créé ✓')
})

// ─── 6. HTTP ────────────────────────────────────────────────────────
if (BASE) {
  await step(`HTTP : GET /admin/legal + /admin/legal/registre-securite/print`, async () => {
    let serverUp = false
    try { const r = await fetch(BASE, { signal: AbortSignal.timeout(2000) }); serverUp = r.ok || r.status < 500 }
    catch { console.log('  ⚠ pas de dev server'); return }
    if (!serverUp) { console.log('  ⚠ injoignable'); return }

    const r1 = await fetch(`${BASE}/admin/legal`, { signal: AbortSignal.timeout(60000) })
    if (r1.status !== 200) { ko('GET /admin/legal', `HTTP ${r1.status}`); return }
    const html1 = await r1.text()
    ok(`GET /admin/legal → 200 (${html1.length} bytes)`)
    if (html1.includes('Légal')) ok('contient titre Légal')

    const r2 = await fetch(`${BASE}/admin/legal/registre-securite/print`, { signal: AbortSignal.timeout(60000) })
    if (r2.status !== 200) { ko('GET registre-securite/print', `HTTP ${r2.status}`); return }
    const html2 = await r2.text()
    ok(`GET registre-securite/print → 200 (${html2.length} bytes)`)
    if (html2.includes('Registre de s')) ok('mention "Registre de sécurité"')
  })
} else {
  console.log('\n→ HTTP : skip (PORT non défini)')
}

// ─── Cleanup ────────────────────────────────────────────────────────
console.log('\n→ Cleanup…')
if (cleanup.affIds.length > 0) {
  await sb.from('affichages_verifications').delete().in('id', cleanup.affIds)
  console.log(`  ✓ ${cleanup.affIds.length} affichage(s) custom supprimé(s)`)
}
if (cleanup.accIds.length > 0) {
  await sb.from('accidents_travail').delete().in('id', cleanup.accIds)
  console.log(`  ✓ ${cleanup.accIds.length} accident(s) supprimé(s)`)
}
if (cleanup.oblIds.length > 0) {
  await sb.from('obligations_legales').delete().in('id', cleanup.oblIds)
  console.log(`  ✓ ${cleanup.oblIds.length} obligation(s) supprimée(s)`)
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
console.log('\n🎉 Module 17 — Légal OK.')
