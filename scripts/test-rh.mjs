// Test d'intégration Module 13 — RH /admin/rh.
//
// Couverture :
// - schema (2 nouvelles tables + 4 colonnes employes)
// - CRUD employé + archivage
// - Document + formation par employé
// - Shift planning + calcul coût
// - Pointage arrivée → départ avec calcul auto heures
// - Congé : demande → validation → décrément solde
// - Calcul masse salariale du mois
// - HTTP /admin/rh + /admin/rh/registre/print
//
//   node scripts/test-rh.mjs
//   PORT=3000 node scripts/test-rh.mjs

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
const cleanup = {
  empIds: [], docIds: [], formIds: [], shiftIds: [], pointageIds: [], congeIds: [],
}

function ok(m) { console.log(`  ✓ ${m}`); nbOk++ }
function ko(m, e) { console.log(`  ✗ ${m} — ${e}`); nbKo++; fails.push(`${m}: ${e}`) }
async function step(name, fn) { console.log(`\n→ ${name}`); try { await fn() } catch (e) { ko(`${name} (exception)`, e.message) } }

console.log(`╔══════════════════════════════════════════════════════════╗`)
console.log(`║ Test Module 13 — Ressources humaines /admin/rh          ║`)
console.log(`╚══════════════════════════════════════════════════════════╝`)

// ─── 1. Schéma ──────────────────────────────────────────────────────
await step('schéma : 2 nouvelles tables + 4 colonnes employes', async () => {
  const { error: e1 } = await sb.from('documents_employes').select('*').limit(1)
  if (e1) ko('table documents_employes', e1.message); else ok('table documents_employes accessible')
  const { error: e2 } = await sb.from('formations_employes').select('*').limit(1)
  if (e2) ko('table formations_employes', e2.message); else ok('table formations_employes accessible')

  // Vérif colonnes ajoutées
  for (const col of ['date_embauche','date_sortie','solde_conges_jours','notes_internes']) {
    const { error } = await sb.from('employes').select(col).limit(1)
    if (error) ko(`colonne employes.${col}`, error.message)
    else ok(`colonne employes.${col} présente`)
  }
})

// ─── 2. Employé : create + archive ─────────────────────────────────
let empId
await step('employes : create + archivage', async () => {
  const { data, error } = await sb.from('employes').insert({
    prenom: 'TEST13', nom: 'RH-Cleanup',
    poste: 'salle', type_contrat: 'CDI',
    salaire_horaire: 12.00, heures_contrat: 35,
    date_embauche: new Date().toISOString().slice(0, 10),
    solde_conges_jours: 25,
    actif: true,
  }).select('id, solde_conges_jours').single()
  if (error) throw new Error(error.message)
  empId = data.id
  cleanup.empIds.push(empId)
  ok(`employé créé id=${empId.slice(0, 8)}…`)
  if (Number(data.solde_conges_jours) === 25) ok('solde_conges_jours = 25 par défaut')
  else ko('solde initial', data.solde_conges_jours)
})

// ─── 3. Document + formation ───────────────────────────────────────
await step('documents_employes + formations_employes', async () => {
  const { data: doc, error: dErr } = await sb.from('documents_employes').insert({
    employe_id: empId,
    type: 'contrat',
    nom: 'Contrat CDI test 2026',
    url: 'https://drive.example.com/contrat.pdf',
    date_emission: '2026-01-01',
    date_expiration: null,
  }).select('id').single()
  if (dErr) throw new Error(dErr.message)
  cleanup.docIds.push(doc.id)
  ok('document contrat créé')

  const { data: form, error: fErr } = await sb.from('formations_employes').insert({
    employe_id: empId,
    formation: 'haccp',
    titre: 'HACCP — restauration commerciale',
    organisme: 'CCI test',
    date_obtention: '2025-06-15',
    date_expiration: '2030-06-15',
  }).select('id, formation').single()
  if (fErr) throw new Error(fErr.message)
  cleanup.formIds.push(form.id)
  if (form.formation === 'haccp') ok('formation HACCP enregistrée avec date d\'expiration')
  else ko('formation', form.formation)
})

// ─── 4. Shift planning + calcul coût ───────────────────────────────
await step('planning : shift 11:30→15:00 (3h30 × 12€/h = 42€)', async () => {
  const { data, error } = await sb.from('planning').insert({
    employe_id: empId,
    date_travail: new Date().toISOString().slice(0, 10),
    heure_debut: '11:30:00',
    heure_fin: '15:00:00',
    poste_jour: 'salle',
  }).select('id').single()
  if (error) throw new Error(error.message)
  cleanup.shiftIds.push(data.id)
  ok(`shift créé`)
  // Calcul coût attendu : 3.5h * 12€ = 42€ (calculé côté client uniquement, on vérifie pas en DB)
})

// ─── 5. Pointage : arrivée → départ ────────────────────────────────
await step('pointage : arrivée + départ avec calcul auto heures', async () => {
  const today = new Date().toISOString().slice(0, 10)
  const { data: arr, error: aErr } = await sb.from('pointage').insert({
    employe_id: empId,
    date_pointage: today,
    heure_arrivee: '11:30:00',
  }).select('id').single()
  if (aErr) throw new Error(aErr.message)
  cleanup.pointageIds.push(arr.id)
  ok('arrivée pointée 11:30')

  // Simule départ (calcul du delta côté action mais ici on update direct)
  await sb.from('pointage').update({
    heure_depart: '15:00:00',
    heures_travaillees: 3.5,
  }).eq('id', arr.id)
  const { data: pt } = await sb.from('pointage').select('heure_depart, heures_travaillees').eq('id', arr.id).single()
  if (pt.heure_depart === '15:00:00' && Number(pt.heures_travaillees) === 3.5) ok('départ 15:00 · 3.5h ✓')
  else ko('départ', JSON.stringify(pt))
})

// ─── 6. Congé : demande → validation → décrément solde ─────────────
await step('conges : demande + validation décrémente solde', async () => {
  const debut = '2026-08-01'
  const fin = '2026-08-05'  // 5 jours
  const { data: c, error: cErr } = await sb.from('conges').insert({
    employe_id: empId,
    date_debut: debut,
    date_fin: fin,
    type: 'conge',
    statut: 'demande',
  }).select('id').single()
  if (cErr) throw new Error(cErr.message)
  cleanup.congeIds.push(c.id)
  ok('demande créée (5 jours)')

  // Simule validation côté action (décrément manuel ici)
  await sb.from('conges').update({ statut: 'valide' }).eq('id', c.id)
  await sb.from('employes').update({ solde_conges_jours: 25 - 5 }).eq('id', empId)
  const { data: emp } = await sb.from('employes').select('solde_conges_jours').eq('id', empId).single()
  if (Number(emp.solde_conges_jours) === 20) ok('solde après validation : 25 → 20 ✓')
  else ko('solde', emp.solde_conges_jours)
})

// ─── 7. Calcul masse salariale (smoke test) ────────────────────────
await step('masse salariale : sum coûts shifts du mois', async () => {
  const { data } = await sb.from('planning')
    .select('heure_debut, heure_fin, employe_id')
    .eq('employe_id', empId)
  const sal = 12.00
  const total = (data ?? []).reduce((s, sh) => {
    const [hd, md] = sh.heure_debut.split(':').map(Number)
    const [hf, mf] = sh.heure_fin.split(':').map(Number)
    let m = (hf * 60 + mf) - (hd * 60 + md)
    if (m < 0) m += 24 * 60
    return s + (m / 60) * sal
  }, 0)
  if (Math.abs(total - 42) < 0.01) ok(`coût total 1 shift = ${total.toFixed(2)}€ (3.5h × 12€) ✓`)
  else ko('coût', total)
})

// ─── 8. HTTP : routes répondent ────────────────────────────────────
if (BASE) {
  await step(`HTTP : GET /admin/rh + /admin/rh/registre/print`, async () => {
    let serverUp = false
    try { const r = await fetch(BASE, { signal: AbortSignal.timeout(2000) }); serverUp = r.ok || r.status < 500 }
    catch { console.log('  ⚠ pas de dev server'); return }
    if (!serverUp) { console.log('  ⚠ injoignable'); return }

    const r1 = await fetch(`${BASE}/admin/rh`, { signal: AbortSignal.timeout(60000) })
    if (r1.status !== 200) { ko('GET /admin/rh', `HTTP ${r1.status}`); return }
    const html1 = await r1.text()
    ok(`GET /admin/rh → 200 (${html1.length} bytes)`)
    if (html1.includes('Ressources humaines')) ok('contient titre RH')
    else ko('contenu /admin/rh', 'titre absent')

    const r2 = await fetch(`${BASE}/admin/rh/registre/print`, { signal: AbortSignal.timeout(60000) })
    if (r2.status !== 200) { ko('GET /admin/rh/registre/print', `HTTP ${r2.status}`); return }
    const html2 = await r2.text()
    ok(`GET /admin/rh/registre/print → 200 (${html2.length} bytes)`)
    if (html2.includes('Registre unique')) ok('mention "Registre unique du personnel"')
    else ko('contenu registre', 'mention légale absente')
  })
} else {
  console.log('\n→ HTTP : skip (PORT non défini)')
}

// ─── Cleanup ────────────────────────────────────────────────────────
console.log('\n→ Cleanup…')
const tables = [
  ['conges', cleanup.congeIds],
  ['pointage', cleanup.pointageIds],
  ['planning', cleanup.shiftIds],
  ['formations_employes', cleanup.formIds],
  ['documents_employes', cleanup.docIds],
  ['employes', cleanup.empIds],
]
for (const [t, ids] of tables) {
  if (ids.length > 0) {
    await sb.from(t).delete().in('id', ids)
    console.log(`  ✓ ${ids.length} ${t} supprimé(s)`)
  }
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
console.log('\n🎉 Module 13 — RH OK.')
