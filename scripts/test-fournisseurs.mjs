// Test d'intégration Module 8 — Fournisseurs.
//
//   node scripts/test-fournisseurs.mjs

import { readFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'

const env = readFileSync('.env.local', 'utf8')
for (const line of env.split('\n')) {
  const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/)
  if (m) process.env[m[1]] = m[2].replace(/^['"]|['"]$/g, '')
}
const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
if (!url || !key) { console.error('❌ env manquant'); process.exit(1) }
const sb = createClient(url, key)

let nbOk = 0, nbKo = 0
const fails = []
const cleanup = { fournisseurIds: [], bonIds: [], factureIds: [] }

function ok(m) { console.log(`  ✓ ${m}`); nbOk++ }
function ko(m, e) { console.log(`  ✗ ${m} — ${e}`); nbKo++; fails.push(`${m}: ${e}`) }
async function step(name, fn) {
  console.log(`\n→ ${name}`)
  try { await fn() } catch (e) { ko(`${name} (exception)`, e.message) }
}

const TAG = `__fr_test_${Date.now().toString(36)}__`

console.log(`╔══════════════════════════════════════════════════════════╗`)
console.log(`║ Test fournisseurs — tag : ${TAG}          ║`)
console.log(`╚══════════════════════════════════════════════════════════╝`)

// ─── 1. Seeds : 6 fournisseurs + 3 bons + 3 factures ────────────────
await step('seeds : fournisseurs / bons / factures', async () => {
  const { data: f } = await sb.from('fournisseurs').select('id, nom, note_qualite, note_ponctualite')
  if (f.length >= 6) ok(`${f.length} fournisseurs en base`)
  else ko('count fournisseurs', f.length)

  const { data: b } = await sb.from('bons_commande').select('id, statut')
  if (b.length >= 3) ok(`${b.length} bons de commande en base`)
  else ko('count bons', b.length)

  const { data: fact } = await sb.from('factures_fournisseurs').select('id, statut')
  if (fact.length >= 3) ok(`${fact.length} factures en base`)
  else ko('count factures', fact.length)
})

// ─── 2. Schéma : nouvelles colonnes contrôle réception ──────────────
await step('schéma : colonnes contrôle réception', async () => {
  const { data, error } = await sb.from('bon_commande_lignes').select('*').limit(1)
  if (error) throw new Error(error.message)
  const sample = data[0] ?? {}
  const cols = ['temperature_reception', 'dlc_observee', 'etat_emballage', 'note_qualite_ligne', 'commentaire']
  for (const c of cols) {
    if (c in sample) ok(`colonne ${c} présente`)
    else ko(`colonne ${c}`, 'manquante')
  }
})

// ─── 3. Alertes factures — la facture en retard est détectée ────────
await step('factures : détection en retard', async () => {
  const today = new Date().toISOString().slice(0, 10)
  const { data } = await sb
    .from('factures_fournisseurs')
    .select('id, numero, statut, date_echeance')
    .lt('date_echeance', today)
    .neq('statut', 'paye')
    .neq('statut', 'annule')
  if (data.length >= 1) ok(`${data.length} facture(s) en retard détectée(s)`)
  else ko('en retard', `attendu ≥ 1, reçu ${data.length}`)
})

// ─── 4. Comparateur prix : Mozzarella avec 2 fournisseurs ───────────
await step('comparateur : Mozzarella avec >= 2 fournisseurs', async () => {
  const { data: ing } = await sb.from('ingredients').select('id').eq('nom', 'Mozzarella di Bufala').single()
  if (!ing) { ko('mozza', 'introuvable'); return }
  const { data: hist } = await sb
    .from('historique_prix_ingredients')
    .select('fournisseur_id, prix_achat_ht')
    .eq('ingredient_id', ing.id)
    .not('fournisseur_id', 'is', null)
  const fournisseursUniques = new Set(hist.map(h => h.fournisseur_id))
  if (fournisseursUniques.size >= 2) ok(`${fournisseursUniques.size} fournisseurs avec prix mozzarella`)
  else ko('comparateur mozza', `${fournisseursUniques.size} fournisseur(s) seulement`)
})

// ─── 5. CRUD fournisseur ────────────────────────────────────────────
let createdF
await step('CRUD fournisseur', async () => {
  const { data, error } = await sb.from('fournisseurs').insert({
    nom: TAG + ' Test Fournisseur',
    contact: 'Test Contact',
    telephone: '0123456789',
    email: 'test@test.fr',
    note_qualite: 4,
    note_ponctualite: 5,
    actif: true,
  }).select('id').single()
  if (error) throw new Error(error.message)
  createdF = data.id
  cleanup.fournisseurIds.push(createdF)
  ok(`fournisseur créé id=${createdF.slice(0,8)}…`)

  await sb.from('fournisseurs').update({ note_qualite: 3 }).eq('id', createdF)
  const { data: r } = await sb.from('fournisseurs').select('note_qualite').eq('id', createdF).single()
  if (Number(r.note_qualite) === 3) ok('update note_qualite = 3')
  else ko('update', r.note_qualite)
})

// ─── 6. CRUD facture ────────────────────────────────────────────────
await step('CRUD facture', async () => {
  if (!createdF) { ko('facture', 'pas de fournisseur'); return }
  const { data, error } = await sb.from('factures_fournisseurs').insert({
    fournisseur_id: createdF,
    numero: TAG + '-FA-001',
    date_emission: new Date().toISOString().slice(0, 10),
    date_echeance: new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10),
    montant_ht: 100,
    montant_ttc: 110,
    statut: 'a_payer',
  }).select('id').single()
  if (error) throw new Error(error.message)
  cleanup.factureIds.push(data.id)
  ok('facture créée')

  await sb.from('factures_fournisseurs').update({ statut: 'paye', paye_le: new Date().toISOString() }).eq('id', data.id)
  const { data: r } = await sb.from('factures_fournisseurs').select('statut, paye_le').eq('id', data.id).single()
  if (r.statut === 'paye' && r.paye_le) ok('marquée payée + paye_le rempli')
  else ko('paye_le', JSON.stringify(r))
})

// ─── 7. CRUD bon de commande + ligne ────────────────────────────────
await step('CRUD bon de commande + ligne avec contrôle réception', async () => {
  if (!createdF) { ko('bon', 'pas de fournisseur'); return }
  const { data: ing } = await sb.from('ingredients').select('id').limit(1).single()

  const { data: bon, error } = await sb.from('bons_commande').insert({
    fournisseur_id: createdF,
    statut: 'envoye',
    date_commande: new Date().toISOString().slice(0, 10),
    montant_total_ht: 50,
    notes: 'Test',
  }).select('id').single()
  if (error) throw new Error(error.message)
  cleanup.bonIds.push(bon.id)
  ok('bon de commande créé')

  // Ligne avec contrôles réception complets
  await sb.from('bon_commande_lignes').insert({
    bon_commande_id: bon.id,
    ingredient_id: ing.id,
    quantite_commandee: 5,
    prix_unitaire_ht: 10,
    quantite_recue: 5,
    temperature_reception: 4.5,
    dlc_observee: new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10),
    etat_emballage: 'parfait',
    note_qualite_ligne: 5,
    commentaire: 'Réception OK',
  })

  const { data: l } = await sb.from('bon_commande_lignes').select('temperature_reception, etat_emballage, note_qualite_ligne').eq('bon_commande_id', bon.id).single()
  if (Number(l.temperature_reception) === 4.5) ok('temperature_reception = 4,5°C')
  else ko('temp', l.temperature_reception)
  if (l.etat_emballage === 'parfait') ok(`etat_emballage = 'parfait'`)
  else ko('etat', l.etat_emballage)
  if (Number(l.note_qualite_ligne) === 5) ok('note_qualite_ligne = 5')
  else ko('note', l.note_qualite_ligne)
})

// ─── Cleanup ────────────────────────────────────────────────────────
console.log('\n→ Cleanup…')
if (cleanup.factureIds.length > 0) {
  await sb.from('factures_fournisseurs').delete().in('id', cleanup.factureIds)
  console.log(`  ✓ ${cleanup.factureIds.length} factures de test supprimées`)
}
if (cleanup.bonIds.length > 0) {
  // bons cascade les lignes via on delete cascade
  await sb.from('bons_commande').delete().in('id', cleanup.bonIds)
  console.log(`  ✓ ${cleanup.bonIds.length} bons de commande de test supprimés`)
}
if (cleanup.fournisseurIds.length > 0) {
  await sb.from('fournisseurs').delete().in('id', cleanup.fournisseurIds)
  console.log(`  ✓ ${cleanup.fournisseurIds.length} fournisseurs de test supprimés`)
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
console.log('\n🎉 Module 8 — fournisseurs OK.')
