// Test d'intégration Module 19 — Groupes /admin/groupes.

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
const cleanup = { groupeIds: [] }  // cascade supprimera menus + paiements

function ok(m) { console.log(`  ✓ ${m}`); nbOk++ }
function ko(m, e) { console.log(`  ✗ ${m} — ${e}`); nbKo++; fails.push(`${m}: ${e}`) }
async function step(name, fn) { console.log(`\n→ ${name}`); try { await fn() } catch (e) { ko(`${name} (exception)`, e.message) } }

console.log(`╔══════════════════════════════════════════════════════════╗`)
console.log(`║ Test Module 19 — Groupes /admin/groupes                 ║`)
console.log(`╚══════════════════════════════════════════════════════════╝`)

// ─── 1. Schéma ──────────────────────────────────────────────────────
await step('schéma : 3 tables Module 19', async () => {
  for (const t of ['groupes', 'groupes_menus', 'groupes_paiements']) {
    const { error } = await sb.from(t).select('*').limit(1)
    if (error) ko(`table ${t}`, error.message); else ok(`table ${t} accessible`)
  }
})

// ─── 2. Création groupe ────────────────────────────────────────────
let groupeId
await step('groupes : create avec tour-opérateur + nb_personnes 25 × 35€', async () => {
  const { data, error } = await sb.from('groupes').insert({
    nom: 'TEST19 — CE Renault',
    type: 'entreprise',
    tour_operateur: 'TO Test',
    contact_nom: 'M. Durand',
    contact_email: 'durand@test.fr',
    date_visite: '2026-06-15',
    heure_arrivee: '12:00:00',
    heure_depart: '14:30:00',
    nb_personnes: 25,
    prix_par_personne_ht: 35.00,
    taux_tva: 10,
    facturation_via_to: true,
    statut: 'confirme',
  }).select('id, nb_personnes, prix_par_personne_ht').single()
  if (error) throw new Error(error.message)
  groupeId = data.id
  cleanup.groupeIds.push(groupeId)
  ok(`groupe créé id=${groupeId.slice(0, 8)}…`)

  // Vérifie calcul attendu : 25 × 35 = 875 HT, × 1.10 = 962.50 TTC
  const ht = data.nb_personnes * Number(data.prix_par_personne_ht)
  if (ht === 875) ok('total HT = 875€ (25 × 35€) ✓')
  else ko('total HT', ht)
})

// ─── 3. Menu groupe : 3 plats ──────────────────────────────────────
await step('groupes_menus : 3 plats (entrée + plat + dessert)', async () => {
  for (const [cat, nom, ordre] of [['entree','Salade chèvre chaud',1],['plat','Magret de canard',2],['dessert','Tarte Tatin',3]]) {
    const { error } = await sb.from('groupes_menus').insert({
      groupe_id: groupeId, recette_nom_libre: nom,
      categorie: cat, quantite_par_personne: 1, ordre,
    })
    if (error) throw new Error(`${cat}: ${error.message}`)
  }
  const { data, count } = await sb.from('groupes_menus').select('*', { count: 'exact' }).eq('groupe_id', groupeId)
  if (count === 3) ok(`3 plats au menu : ${data.map(m => m.recette_nom_libre).join(', ')}`)
  else ko('menus', count)
})

// ─── 4. Paiements : arrhes + solde ─────────────────────────────────
await step('groupes_paiements : arrhes 30% + solde', async () => {
  const totalTTC = 962.50
  const arrhes = Math.round(totalTTC * 0.3 * 100) / 100  // 288.75
  const solde = totalTTC - arrhes

  const { error: e1 } = await sb.from('groupes_paiements').insert({
    groupe_id: groupeId, type: 'arrhes', date_paiement: '2026-06-01',
    montant: arrhes, methode: 'virement', reference: 'VIR-TEST19-001',
  })
  if (e1) throw new Error(`arrhes: ${e1.message}`)
  ok(`arrhes ${arrhes}€ enregistrées (30% de ${totalTTC})`)

  const { error: e2 } = await sb.from('groupes_paiements').insert({
    groupe_id: groupeId, type: 'solde', date_paiement: '2026-06-15',
    montant: solde, methode: 'virement', reference: 'VIR-TEST19-002',
  })
  if (e2) throw new Error(`solde: ${e2.message}`)
  ok(`solde ${solde}€ enregistré`)

  const { data: paies } = await sb.from('groupes_paiements').select('montant').eq('groupe_id', groupeId)
  const totalPaye = paies.reduce((s, p) => s + Number(p.montant), 0)
  if (Math.abs(totalPaye - totalTTC) < 0.01) ok(`total payé = total TTC ✓ (${totalPaye})`)
  else ko('total paye', totalPaye)
})

// ─── 5. Cascade DELETE ────────────────────────────────────────────
await step('cascade : suppression groupe → menus + paiements', async () => {
  // Test sur un groupe temporaire
  const { data: gTemp } = await sb.from('groupes').insert({
    nom: 'TEST19-CASCADE', type: 'autre',
    date_visite: '2026-12-31', nb_personnes: 1, prix_par_personne_ht: 10,
  }).select('id').single()
  await sb.from('groupes_menus').insert({ groupe_id: gTemp.id, recette_nom_libre: 'cascade test' })
  await sb.from('groupes_paiements').insert({ groupe_id: gTemp.id, type: 'arrhes', date_paiement: '2026-12-01', montant: 5, methode: 'especes' })

  await sb.from('groupes').delete().eq('id', gTemp.id)
  const { count: nbMenus } = await sb.from('groupes_menus').select('*', {count:'exact', head:true}).eq('groupe_id', gTemp.id)
  const { count: nbPaies } = await sb.from('groupes_paiements').select('*', {count:'exact', head:true}).eq('groupe_id', gTemp.id)
  if (nbMenus === 0 && nbPaies === 0) ok('cascade ON DELETE OK : menus + paiements supprimés')
  else ko('cascade', `menus=${nbMenus} paiements=${nbPaies}`)
})

// ─── 6. HTTP : routes ──────────────────────────────────────────────
if (BASE) {
  await step(`HTTP : GET /admin/groupes + facture/print`, async () => {
    let serverUp = false
    try { const r = await fetch(BASE, { signal: AbortSignal.timeout(2000) }); serverUp = r.ok || r.status < 500 }
    catch { console.log('  ⚠ pas de dev server'); return }
    if (!serverUp) { console.log('  ⚠ injoignable'); return }

    const r1 = await fetch(`${BASE}/admin/groupes`, { signal: AbortSignal.timeout(60000) })
    if (r1.status !== 200) { ko('GET /admin/groupes', `HTTP ${r1.status}`); return }
    ok(`GET /admin/groupes → 200`)

    const r2 = await fetch(`${BASE}/admin/groupes/${groupeId}/facture/print`, { signal: AbortSignal.timeout(60000) })
    if (r2.status !== 200) { ko('GET facture/print', `HTTP ${r2.status}`); return }
    const html = await r2.text()
    ok(`GET facture/print → 200`)
    if (html.includes('TEST19')) ok('facture contient le nom du groupe')
    if (html.includes('TOTAL TTC')) ok('facture contient "TOTAL TTC"')
  })
} else {
  console.log('\n→ HTTP : skip (PORT non défini)')
}

// ─── Cleanup ────────────────────────────────────────────────────────
console.log('\n→ Cleanup…')
if (cleanup.groupeIds.length > 0) {
  await sb.from('groupes').delete().in('id', cleanup.groupeIds)
  console.log(`  ✓ ${cleanup.groupeIds.length} groupe(s) supprimé(s) — cascade auto sur menus/paiements`)
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
console.log('\n🎉 Module 19 — Groupes OK.')
