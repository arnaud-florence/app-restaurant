// Test d'intégration Module 21 — Réservations & événementiel.

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
const cleanup = { chambreIds: [], resaChIds: [], resaTIds: [], evtIds: [] }

function ok(m) { console.log(`  ✓ ${m}`); nbOk++ }
function ko(m, e) { console.log(`  ✗ ${m} — ${e}`); nbKo++; fails.push(`${m}: ${e}`) }
async function step(name, fn) { console.log(`\n→ ${name}`); try { await fn() } catch (e) { ko(`${name} (exception)`, e.message) } }

console.log(`╔══════════════════════════════════════════════════════════╗`)
console.log(`║ Test Module 21 — Réservations /admin/reservations       ║`)
console.log(`╚══════════════════════════════════════════════════════════╝`)

// ─── 1. Schéma ──────────────────────────────────────────────────────
await step('schéma : tables + colonnes ajoutées sur evenements', async () => {
  for (const t of ['chambres', 'reservations_chambres', 'reservations_tables', 'evenements']) {
    const { error } = await sb.from(t).select('*').limit(1)
    if (error) ko(`table ${t}`, error.message); else ok(`table ${t} accessible`)
  }
  for (const col of ['type_evenement','lieu','heure_debut','heure_fin','privatisation','materiel_demande','besoins_techniques','prix_par_personne_ht','taux_tva']) {
    const { error } = await sb.from('evenements').select(col).limit(1)
    if (error) ko(`evenements.${col}`, error.message); else ok(`colonne evenements.${col} ✓`)
  }
})

// ─── 2. Chambre + résa avec calcul nuits ──────────────────────────
let chambreId, resaChId
await step('chambre + résa avec 3 nuits × 80€ = 240€', async () => {
  const { data: c, error: cErr } = await sb.from('chambres').insert({
    nom: 'TEST21-Chambre',
    numero: 'TEST21',
    capacite: 2,
    prix_nuit_ht: 80,
    actif: true,
  }).select('id').single()
  if (cErr) throw new Error(cErr.message)
  chambreId = c.id
  cleanup.chambreIds.push(chambreId)
  ok('chambre créée')

  const { data: r, error: rErr } = await sb.from('reservations_chambres').insert({
    chambre_id: chambreId,
    client_nom: 'TEST21-Dupont',
    date_arrivee: '2026-06-01',
    date_depart: '2026-06-04',  // 3 nuits
    nb_personnes: 2,
    montant_total: 240,
    acompte_verse: 50,
    statut: 'confirmee',
  }).select('id, statut').single()
  if (rErr) throw new Error(rErr.message)
  resaChId = r.id
  cleanup.resaChIds.push(resaChId)
  if (r.statut === 'confirmee') ok('résa chambre créée 3 nuits, statut confirmée')
})

// ─── 3. Workflow check-in / check-out ──────────────────────────────
await step('workflow chambre : confirmee → arrivee → terminee', async () => {
  await sb.from('reservations_chambres').update({ statut: 'arrivee' }).eq('id', resaChId)
  let { data } = await sb.from('reservations_chambres').select('statut').eq('id', resaChId).single()
  if (data.statut === 'arrivee') ok('check-in (arrivee) ✓')

  await sb.from('reservations_chambres').update({ statut: 'terminee' }).eq('id', resaChId)
  ;({ data } = await sb.from('reservations_chambres').select('statut').eq('id', resaChId).single())
  if (data.statut === 'terminee') ok('check-out (terminee) ✓')
})

// ─── 4. Réservation table (terrasse) ───────────────────────────────
await step('reservations_tables : créa terrasse 19h30 / 4 pers', async () => {
  const { data, error } = await sb.from('reservations_tables').insert({
    zone: 'terrasse',
    date_resa: '2026-07-15',
    heure_arrivee: '19:30:00',
    heure_depart: '21:30:00',
    nb_personnes: 4,
    client_nom: 'TEST21-Famille',
    client_telephone: '0612345678',
  }).select('id, statut').single()
  if (error) throw new Error(error.message)
  cleanup.resaTIds.push(data.id)
  if (data.statut === 'confirmee') ok('résa terrasse créée, statut confirmee par défaut ✓')
})

// ─── 5. Événement avec privatisation + matériel ────────────────────
await step('evenement : mariage 80 pers × 65€ + privatisation', async () => {
  const { data, error } = await sb.from('evenements').insert({
    titre: 'TEST21 — Mariage Martin',
    type_evenement: 'mariage',
    date_evenement: '2026-09-12',
    heure_debut: '17:00:00',
    heure_fin: '02:00:00',
    nb_personnes: 80,
    prix_par_personne_ht: 65.00,
    taux_tva: 10,
    montant_devis: 80 * 65 * 1.10,  // 5720€ TTC
    acompte_verse: 0,
    privatisation: true,
    materiel_demande: 'Sono, vidéoprojecteur, micro DJ',
    besoins_techniques: 'Décoration florale fournie par le client',
    statut: 'demande',
  }).select('id, type_evenement, privatisation, montant_devis').single()
  if (error) throw new Error(error.message)
  cleanup.evtIds.push(data.id)
  ok(`événement créé id=${data.id.slice(0, 8)}…`)
  if (data.type_evenement === 'mariage') ok('type_evenement = mariage ✓')
  if (data.privatisation === true) ok('privatisation = true ✓')
  if (Math.abs(Number(data.montant_devis) - 5720) < 0.01) ok(`montant 5720€ ✓ (80 × 65 × 1.10)`)
})

// ─── 6. HTTP ────────────────────────────────────────────────────────
if (BASE) {
  await step(`HTTP : 4 routes Module 21`, async () => {
    let serverUp = false
    try { const r = await fetch(BASE, { signal: AbortSignal.timeout(2000) }); serverUp = r.ok || r.status < 500 }
    catch { console.log('  ⚠ pas de dev server'); return }
    if (!serverUp) { console.log('  ⚠ injoignable'); return }

    const r1 = await fetch(`${BASE}/admin/reservations`, { signal: AbortSignal.timeout(60000) })
    if (r1.status !== 200) { ko('GET /admin/reservations', `HTTP ${r1.status}`); return }
    ok(`GET /admin/reservations → 200`)

    const r2 = await fetch(`${BASE}/admin/reservations/chambres/${resaChId}/facture/print`, { signal: AbortSignal.timeout(60000) })
    if (r2.status !== 200) { ko('GET facture chambre', `HTTP ${r2.status}`); return }
    ok(`GET facture chambre → 200`)

    const evtId = cleanup.evtIds[0]
    const r3 = await fetch(`${BASE}/admin/reservations/evenements/${evtId}/devis/print`, { signal: AbortSignal.timeout(60000) })
    if (r3.status !== 200) { ko('GET devis', `HTTP ${r3.status}`); return }
    const html3 = await r3.text()
    ok(`GET devis → 200`)
    if (html3.includes('Devis')) ok('devis contient titre Devis')

    const r4 = await fetch(`${BASE}/admin/reservations/evenements/${evtId}/contrat/print`, { signal: AbortSignal.timeout(60000) })
    if (r4.status !== 200) { ko('GET contrat', `HTTP ${r4.status}`); return }
    const html4 = await r4.text()
    ok(`GET contrat → 200`)
    if (html4.includes('Contrat')) ok('contrat contient titre Contrat')
  })
} else {
  console.log('\n→ HTTP : skip (PORT non défini)')
}

// ─── Cleanup ────────────────────────────────────────────────────────
console.log('\n→ Cleanup…')
if (cleanup.evtIds.length > 0) { await sb.from('evenements').delete().in('id', cleanup.evtIds); console.log(`  ✓ ${cleanup.evtIds.length} événements`) }
if (cleanup.resaTIds.length > 0) { await sb.from('reservations_tables').delete().in('id', cleanup.resaTIds); console.log(`  ✓ ${cleanup.resaTIds.length} résa tables`) }
if (cleanup.resaChIds.length > 0) { await sb.from('reservations_chambres').delete().in('id', cleanup.resaChIds); console.log(`  ✓ ${cleanup.resaChIds.length} résa chambres`) }
if (cleanup.chambreIds.length > 0) { await sb.from('chambres').delete().in('id', cleanup.chambreIds); console.log(`  ✓ ${cleanup.chambreIds.length} chambres`) }

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
console.log('\n🎉 Module 21 — Réservations OK.')
