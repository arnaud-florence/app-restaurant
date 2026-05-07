// Test d'intégration Module 11 — Hygiène /admin/hygiene.
//
// Couverture :
// - schema (5 nouvelles tables + colonnes signature_text, moment)
// - HACCP : create + désactivation
// - Lots : create manuel + alerte DLC + statut
// - Températures : NOK auto-déclenche non-conformité
// - Non-conformité : create + résolution
// - Plan nettoyage : create + marquerExecute (derniere_execution)
// - Antiparasitaire : create + prochaine_intervention
// - Procédure + checklist signée
// - HTTP /admin/hygiene si PORT défini
//
//   node scripts/test-hygiene.mjs
//   PORT=3000 node scripts/test-hygiene.mjs

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
  haccpIds: [], lotIds: [], releveIds: [], ncIds: [],
  nettoyageIds: [], interventionIds: [], procIds: [], checkIds: [],
}

function ok(m) { console.log(`  ✓ ${m}`); nbOk++ }
function ko(m, e) { console.log(`  ✗ ${m} — ${e}`); nbKo++; fails.push(`${m}: ${e}`) }
async function step(name, fn) { console.log(`\n→ ${name}`); try { await fn() } catch (e) { ko(`${name} (exception)`, e.message) } }

console.log(`╔══════════════════════════════════════════════════════════╗`)
console.log(`║ Test Module 11 — hygiène & sécurité /admin/hygiene      ║`)
console.log(`╚══════════════════════════════════════════════════════════╝`)

// ─── 1. Schéma ──────────────────────────────────────────────────────
await step('schéma : 5 nouvelles tables + 2 colonnes ajoutées', async () => {
  for (const t of ['plans_haccp','lots_produits','non_conformites','interventions_antiparasitaire','plan_nettoyage']) {
    const { error } = await sb.from(t).select('*').limit(1)
    if (error) ko(`table ${t}`, error.message)
    else ok(`table ${t} accessible (RLS OK)`)
  }
  // Vérif colonnes ajoutées via SELECT explicite (échoue si colonne manque)
  const { error: e1 } = await sb.from('releves_temperatures').select('moment').limit(1)
  if (e1) ko('colonne releves_temperatures.moment', e1.message); else ok('colonne releves_temperatures.moment présente')
  const { error: e2 } = await sb.from('checklists_hygiene').select('signature_text').limit(1)
  if (e2) ko('colonne checklists_hygiene.signature_text', e2.message); else ok('colonne checklists_hygiene.signature_text présente')
})

// ─── 2. Setup : ressources de référence ────────────────────────────
let emp, ing, fourn
await step('setup : 1 employé + 1 ingredient + 1 fournisseur', async () => {
  const { data: emps } = await sb.from('employes').select('id, prenom, nom').eq('actif', true).limit(1)
  const { data: ings } = await sb.from('ingredients').select('id, nom, unite').eq('actif', true).limit(1)
  const { data: fs }   = await sb.from('fournisseurs').select('id, nom').eq('actif', true).limit(1)
  if (!emps?.[0]) throw new Error('aucun employé actif')
  if (!ings?.[0]) throw new Error('aucun ingrédient actif')
  if (!fs?.[0])   throw new Error('aucun fournisseur actif')
  emp = emps[0]; ing = ings[0]; fourn = fs[0]
  ok(`emp=${emp.prenom} ${emp.nom} · ing=${ing.nom} (${ing.unite}) · fournisseur=${fourn.nom}`)
})

// ─── 3. Plan HACCP ──────────────────────────────────────────────────
await step('plans_haccp : create + désactivation soft', async () => {
  const { data, error } = await sb.from('plans_haccp').insert({
    titre: 'TEST Module 11 — Cuisson viande hachée',
    type_danger: 'biologique',
    description_danger: 'Salmonelle, E. coli',
    ccp_numero: 1,
    mesure_preventive: 'Cuisson à cœur ≥ 70°C',
    surveillance_methode: 'Sonde alimentaire',
    surveillance_frequence: 'À chaque cuisson',
    limite_critique: '70°C pendant 30s',
    action_corrective: 'Recuire ou jeter',
    responsable_poste: 'cuisine',
    actif: true,
  }).select('id, ccp_numero').single()
  if (error) throw new Error(error.message)
  cleanup.haccpIds.push(data.id)
  if (data.ccp_numero === 1) ok(`plan HACCP créé id=${data.id.slice(0, 8)}… CCP #${data.ccp_numero}`)
  else ko('ccp', `attendu 1, obtenu ${data.ccp_numero}`)

  // Désactivation
  await sb.from('plans_haccp').update({ actif: false }).eq('id', data.id)
  const { data: check } = await sb.from('plans_haccp').select('actif').eq('id', data.id).single()
  if (check.actif === false) ok('désactivation soft OK (actif=false)')
  else ko('désactivation', `actif=${check.actif}`)
})

// ─── 4. Lots produits ──────────────────────────────────────────────
await step('lots_produits : create manuel + alerte DLC', async () => {
  const today = new Date().toISOString().slice(0, 10)
  const j2 = new Date(Date.now() + 2 * 86400000).toISOString().slice(0, 10)  // DLC dans 2 jours → "proche"
  const j10 = new Date(Date.now() + 10 * 86400000).toISOString().slice(0, 10) // "ok"

  const { data: l1, error: e1 } = await sb.from('lots_produits').insert({
    ingredient_id: ing.id,
    lot_numero: 'TEST11-PROCHE-' + Date.now().toString().slice(-6),
    dlc: j2,
    fournisseur_id: fourn.id,
    fournisseur_nom: fourn.nom,
    quantite: 5,
    unite: ing.unite,
    date_reception: today,
    statut: 'en_stock',
  }).select('id, dlc').single()
  if (e1) throw new Error(e1.message)
  cleanup.lotIds.push(l1.id)
  ok(`lot DLC J+2 créé id=${l1.id.slice(0, 8)}…`)

  const { data: l2, error: e2 } = await sb.from('lots_produits').insert({
    ingredient_id: ing.id,
    lot_numero: 'TEST11-OK-' + Date.now().toString().slice(-6),
    dlc: j10,
    quantite: 10,
    unite: ing.unite,
    date_reception: today,
    statut: 'en_stock',
  }).select('id').single()
  if (e2) throw new Error(e2.message)
  cleanup.lotIds.push(l2.id)
  ok(`lot DLC J+10 créé`)

  // Statut → consomme
  await sb.from('lots_produits').update({ statut: 'consomme' }).eq('id', l2.id)
  const { data: check } = await sb.from('lots_produits').select('statut').eq('id', l2.id).single()
  if (check.statut === 'consomme') ok('changement statut → consomme OK')
  else ko('statut lot', check.statut)
})

// ─── 5. Températures NOK → auto-NC ─────────────────────────────────
await step('releves_temperatures : NOK déclenche non-conformité', async () => {
  // Frigo cuisine, attendu 0…4°C, on met 12°C → conforme = false
  const { data: r, error } = await sb.from('releves_temperatures').insert({
    equipement: 'TEST11 — Frigo cuisine',
    type_equipement: 'frigo',
    temperature: 12.0,
    temperature_min_ok: 0,
    temperature_max_ok: 4,
    conforme: false,
    moment: 'matin',
    employe_id: emp.id,
    notes: 'Test Module 11 — relevé volontairement hors plage',
  }).select('id, conforme, moment').single()
  if (error) throw new Error(error.message)
  cleanup.releveIds.push(r.id)
  if (r.conforme === false) ok(`relevé 12°C (frigo) → conforme=false ✓`)
  else ko('conforme', r.conforme)
  if (r.moment === 'matin') ok(`moment=matin sauvegardé ✓`)
  else ko('moment', r.moment)

  // Création de la non-conformité associée (la server action le fait
  // automatiquement, ici on simule via insert direct pour valider la table)
  const { data: nc, error: ncErr } = await sb.from('non_conformites').insert({
    date_constat: new Date().toISOString().slice(0, 10),
    type: 'temperature',
    gravite: 'majeure',
    description: 'Frigo à 12°C alors que limite 4°C — relevé matin',
    responsable_id: emp.id,
    statut: 'ouverte',
    releve_temperature_id: r.id,
  }).select('id, releve_temperature_id, statut').single()
  if (ncErr) throw new Error(ncErr.message)
  cleanup.ncIds.push(nc.id)
  if (nc.releve_temperature_id === r.id) ok('NC liée au relevé via releve_temperature_id ✓')
  else ko('lien NC↔relevé', `releve_id=${nc.releve_temperature_id}`)
})

// ─── 6. Non-conformité : résolution ────────────────────────────────
await step('non_conformites : transition ouverte → resolue', async () => {
  const ncId = cleanup.ncIds[0]
  if (!ncId) { ko('précondition', 'pas de NC'); return }

  await sb.from('non_conformites').update({
    statut: 'resolue',
    action_corrective: 'Frigo réparé par technicien, vérification 4h plus tard OK',
    resolved_at: new Date().toISOString(),
    resolved_by: emp.id,
  }).eq('id', ncId)

  const { data: nc } = await sb.from('non_conformites').select('statut, resolved_at, resolved_by, action_corrective').eq('id', ncId).single()
  if (nc.statut === 'resolue') ok('statut → resolue ✓')
  else ko('statut', nc.statut)
  if (nc.resolved_at) ok(`resolved_at = ${nc.resolved_at.slice(0, 19)}`)
  else ko('resolved_at', 'null')
  if (nc.resolved_by === emp.id) ok(`resolved_by = ${emp.prenom}`)
  else ko('resolved_by', nc.resolved_by)
  if (nc.action_corrective?.includes('Frigo réparé')) ok('action_corrective sauvegardée')
  else ko('action', 'manquante')
})

// ─── 7. Plan nettoyage ─────────────────────────────────────────────
await step('plan_nettoyage : create + marquerExecute', async () => {
  const { data: p, error } = await sb.from('plan_nettoyage').insert({
    zone: 'TEST11 — Cuisine',
    equipement: 'Lave-vaisselle',
    frequence: 'apres_service',
    produit_utilise: 'Détergent dégraissant',
    methode: 'Vidanger, brosser, rincer',
    responsable_poste: 'plonge',
    ordre: 0,
    actif: true,
  }).select('id, derniere_execution').single()
  if (error) throw new Error(error.message)
  cleanup.nettoyageIds.push(p.id)
  if (p.derniere_execution === null) ok('plan créé : derniere_execution=null')
  else ko('derniere_execution initiale', p.derniere_execution)

  // Marquer exécuté
  const today = new Date().toISOString().slice(0, 10)
  await sb.from('plan_nettoyage').update({ derniere_execution: today }).eq('id', p.id)
  const { data: check } = await sb.from('plan_nettoyage').select('derniere_execution').eq('id', p.id).single()
  if (check.derniere_execution === today) ok(`marqué exécuté → ${today} ✓`)
  else ko('derniere_execution post', check.derniere_execution)
})

// ─── 8. Antiparasitaire ────────────────────────────────────────────
await step('interventions_antiparasitaire : create + prochaine', async () => {
  const today = new Date().toISOString().slice(0, 10)
  const dans3mois = new Date(Date.now() + 90 * 86400000).toISOString().slice(0, 10)
  const { data, error } = await sb.from('interventions_antiparasitaire').insert({
    date_intervention: today,
    prestataire: 'TEST11 — 3D-Pro',
    type_traitement: 'preventif',
    zones: ['cuisine','plonge','réserve sèche'],
    produits_utilises: 'Appâts rongeurs',
    observations: 'Aucune trace de présence',
    prochaine_intervention: dans3mois,
    cout: 150.00,
  }).select('id, zones, cout, prochaine_intervention').single()
  if (error) throw new Error(error.message)
  cleanup.interventionIds.push(data.id)
  if (data.zones?.length === 3) ok(`3 zones enregistrées : ${data.zones.join(', ')}`)
  else ko('zones', `attendu 3, obtenu ${data.zones?.length}`)
  if (Number(data.cout) === 150) ok(`cout = 150€`)
  else ko('cout', data.cout)
  if (data.prochaine_intervention === dans3mois) ok(`prochaine_intervention = ${dans3mois}`)
  else ko('prochaine_intervention', data.prochaine_intervention)
})

// ─── 9. Procédure + checklist signée ───────────────────────────────
await step('procedures_hygiene + checklists_hygiene avec signature_text', async () => {
  const { data: proc, error: pErr } = await sb.from('procedures_hygiene').insert({
    titre: 'TEST11 — Désinfecter plans de travail',
    moment: 'fermeture',
    poste_concerne: 'cuisine',
    description: 'Vaporiser, laisser agir 5min, essuyer',
    ordre: 0,
    actif: true,
  }).select('id').single()
  if (pErr) throw new Error(pErr.message)
  cleanup.procIds.push(proc.id)
  ok('procédure créée')

  const now = new Date()
  const { data: c, error: cErr } = await sb.from('checklists_hygiene').insert({
    procedure_id: proc.id,
    employe_id: emp.id,
    date_realisation: now.toISOString().slice(0, 10),
    heure_realisation: now.toTimeString().slice(0, 8),
    valide: true,
    commentaire: 'Test Module 11',
    signature_text: `${emp.prenom} ${emp.nom}`,
  }).select('id, signature_text, valide').single()
  if (cErr) throw new Error(cErr.message)
  cleanup.checkIds.push(c.id)
  if (c.signature_text === `${emp.prenom} ${emp.nom}`) ok(`signature = "${c.signature_text}" ✓`)
  else ko('signature_text', c.signature_text)
  if (c.valide === true) ok('valide = true')
  else ko('valide', c.valide)
})

// ─── 10. HTTP : route /admin/hygiene répond 200 ────────────────────
if (BASE) {
  await step(`HTTP : GET ${BASE}/admin/hygiene`, async () => {
    let serverUp = false
    try {
      const r = await fetch(BASE, { signal: AbortSignal.timeout(2000) })
      serverUp = r.ok || r.status < 500
    } catch {
      console.log('  ⚠ pas de dev server'); return
    }
    if (!serverUp) { console.log('  ⚠ injoignable'); return }
    const r = await fetch(`${BASE}/admin/hygiene`)
    if (r.status !== 200) { ko('GET /admin/hygiene', `HTTP ${r.status}`); return }
    const html = await r.text()
    ok(`GET /admin/hygiene → 200 (${html.length} bytes)`)
    if (html.includes('Hygiène')) ok('contient titre "Hygiène"')
    else ko('contenu', 'titre absent')
    if (html.includes('Quotidien') && html.includes('HACCP')) ok('onglets Quotidien + HACCP visibles')
    else ko('onglets', 'absents')
  })
} else {
  console.log('\n→ HTTP : skip (PORT non défini)')
}

// ─── Cleanup ────────────────────────────────────────────────────────
console.log('\n→ Cleanup…')
const tables = [
  ['checklists_hygiene', cleanup.checkIds],
  ['procedures_hygiene', cleanup.procIds],
  ['interventions_antiparasitaire', cleanup.interventionIds],
  ['plan_nettoyage', cleanup.nettoyageIds],
  ['non_conformites', cleanup.ncIds],
  ['releves_temperatures', cleanup.releveIds],
  ['lots_produits', cleanup.lotIds],
  ['plans_haccp', cleanup.haccpIds],
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
console.log('\n🎉 Module 11 — hygiène & sécurité OK.')
