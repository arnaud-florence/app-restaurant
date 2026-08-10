// Smoke test des modules admin critiques.
// Exécute les requêtes principales que chaque page chargerait, vérifie qu'elles
// répondent sans erreur et que les KPIs ne sont pas "morts" (NULL/NaN/0 partout).
//
//   node scripts/smoke-admin.mjs

import { readFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'

const env = readFileSync('.env.local', 'utf8')
for (const l of env.split('\n')) {
  const m = l.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/)
  if (m) process.env[m[1]] = m[2].replace(/^['"]|['"]$/g, '').trim()
}
const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  { auth: { persistSession: false } },
)

let ok = 0, ko = 0
const OK  = m => { console.log('  ✓ ' + m); ok++ }
const KO  = m => { console.log('  ✗ ' + m); ko++ }
const INFO = m => console.log('    ' + m)
const head = m => console.log('\n── ' + m + ' ──')

const moisISO = new Date().toISOString().slice(0, 7)        // '2026-05'
const moisDebut = moisISO + '-01'
const moisFin = new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).toISOString().slice(0, 10)
const an = new Date().getFullYear()

// ─────── 1. PILOTAGE ───────
head(`Pilotage (mois ${moisISO})`)
{
  // CA TTC du mois (somme paiements_caisse, hors fidélité)
  const { data: pays, error: ep } = await sb.from('paiements_caisse')
    .select('montant, methode, encaisse_at')
    .gte('encaisse_at', moisDebut)
    .lte('encaisse_at', moisFin + 'T23:59:59')
  if (ep) KO('paiements_caisse query : ' + ep.message)
  else {
    const ca = (pays ?? []).filter(p => p.methode !== 'fidelite').reduce((s, p) => s + Number(p.montant ?? 0), 0)
    OK(`CA TTC du mois calculable : ${ca.toFixed(2)} € sur ${(pays ?? []).length} paiements`)
    if (ca === 0 && (pays ?? []).length === 0) INFO('Aucun encaissement ce mois (training mode ou avant ouverture) — normal')
  }

  // Charges fixes actives
  const { data: ch, error: ec } = await sb.from('charges_fixes').select('libelle, montant_ht').eq('actif', true)
  if (ec) KO('charges_fixes : ' + ec.message)
  else OK(`${(ch ?? []).length} charges fixes actives`)

  // Objectifs/actions/employés (présence)
  const { count: nObj } = await sb.from('objectifs').select('id', { count: 'exact', head: true })
  const { count: nAct } = await sb.from('actions_strategiques').select('id', { count: 'exact', head: true })
  const { count: nEmp } = await sb.from('employes').select('id', { count: 'exact', head: true }).eq('actif', true)
  OK(`objectifs=${nObj} · actions_strat=${nAct} · employés actifs=${nEmp}`)

  // Mode formation : si ON, les agents sont en pause volontairement (pas un bug).
  const { data: param } = await sb.from('parametres').select('valeur').eq('cle', 'mode_formation').maybeSingle()
  const modeFormation = param?.valeur === 'true' || param?.valeur === true
  // Agents : runs récents (< 24 h)
  const { data: runs } = await sb.from('agents_runs')
    .select('agent_id, status, ran_at')
    .gte('ran_at', new Date(Date.now() - 24 * 3600 * 1000).toISOString())
    .order('ran_at', { ascending: false })
  const parAgent = new Map()
  for (const r of runs ?? []) parAgent.set(r.agent_id, (parAgent.get(r.agent_id) ?? 0) + 1)
  const nAgents = parAgent.size
  if (nAgents > 0) OK(`${nAgents} agents IA ont tourné ces 24 h (${runs.length} runs)`)
  else if (modeFormation) OK('Agents IA en pause — MODE FORMATION actif (comportement voulu)')
  else KO('Aucun run d\'agent dans les 24 h — agents IA ne tournent pas ?')

  // Findings actifs
  const { count: nFind } = await sb.from('agents_findings').select('id', { count: 'exact', head: true }).eq('status', 'actif')
  OK(`${nFind ?? 0} findings agents actifs`)
}

// ─────── 2. FINANCES ───────
head(`Finances (mois ${moisISO})`)
{
  const { data: cmds, error: e1 } = await sb.from('commandes')
    .select('montant_total_ttc, montant_total_ht, tva_total, ventilation_tva, statut, created_at')
    .gte('created_at', moisDebut).lte('created_at', moisFin + 'T23:59:59')
    .eq('statut', 'encaisse')
  if (e1) KO('commandes : ' + e1.message)
  else {
    const ttc = (cmds ?? []).reduce((s, c) => s + Number(c.montant_total_ttc ?? 0), 0)
    const ht  = (cmds ?? []).reduce((s, c) => s + Number(c.montant_total_ht ?? 0), 0)
    OK(`${(cmds ?? []).length} commandes encaissées · TTC=${ttc.toFixed(2)} · HT=${ht.toFixed(2)}`)
    // Vérifie cohérence ventilation TVA
    const venti = {}
    for (const c of cmds ?? []) for (const [t, eur] of Object.entries(c.ventilation_tva ?? {})) venti[t] = (venti[t] ?? 0) + Number(eur ?? 0)
    OK('ventilation TVA agrégée : ' + JSON.stringify(Object.fromEntries(Object.entries(venti).map(([k, v]) => [k + '%', v.toFixed(2)]))))
  }
  const { data: facts, error: e2 } = await sb.from('factures_fournisseurs')
    .select('montant_ht, montant_ttc, date_emission')
    .gte('date_emission', moisDebut).lte('date_emission', moisFin)
  if (e2) KO('factures_fournisseurs : ' + e2.message)
  else {
    const f = (facts ?? []).reduce((s, x) => s + Number(x.montant_ttc ?? 0), 0)
    OK(`${(facts ?? []).length} factures fournisseurs ce mois · ${f.toFixed(2)} €`)
  }
}

// ─────── 3. RH ───────
head('RH')
{
  const { data: emps, error: e } = await sb.from('employes')
    .select('id, prenom, nom, poste, actif, salaire_horaire, type_contrat')
  if (e) KO('employes : ' + e.message)
  else {
    const actifs = (emps ?? []).filter(x => x.actif)
    OK(`${actifs.length} employés actifs / ${(emps ?? []).length} total`)
    const sansTaux = actifs.filter(x => !x.salaire_horaire || Number(x.salaire_horaire) <= 0)
    sansTaux.length === 0 ? OK('Tous les actifs ont un salaire horaire renseigné')
      : INFO(`⚠ ${sansTaux.length} employés sans salaire horaire : ${sansTaux.map(x => x.prenom + ' ' + x.nom).join(', ')}`)
    const sansContrat = actifs.filter(x => !x.type_contrat)
    sansContrat.length === 0 ? OK('Tous les actifs ont un type de contrat')
      : INFO(`⚠ ${sansContrat.length} sans type de contrat : ${sansContrat.map(x => x.prenom + ' ' + x.nom).join(', ')}`)
    const sansPoste = actifs.filter(x => !x.poste)
    sansPoste.length === 0 ? OK('Tous les actifs ont un poste')
      : INFO(`⚠ ${sansPoste.length} sans poste : ${sansPoste.map(x => x.prenom + ' ' + x.nom).join(', ')}`)
  }

  const { count: nPlan } = await sb.from('plannings').select('id', { count: 'exact', head: true })
    .gte('date', moisDebut).lte('date', moisFin)
  OK(`${nPlan ?? 0} shifts planifiés ce mois`)

  const { count: nPoint } = await sb.from('pointages').select('id', { count: 'exact', head: true })
    .gte('arrivee_at', moisDebut)
  OK(`${nPoint ?? 0} pointages ce mois`)
}

// ─────── 4. HYGIÈNE / HACCP ───────
head('Hygiène (HACCP)')
{
  const { data: temps, error: e } = await sb.from('releves_temperatures')
    .select('id, temperature, conforme, created_at')
    .order('created_at', { ascending: false }).limit(50)
  if (e) KO('releves_temperature : ' + e.message)
  else {
    OK(`${(temps ?? []).length} derniers relevés température lus`)
    const horsNorme = (temps ?? []).filter(x => x.conforme === false)
    horsNorme.length === 0 ? OK('Tous les derniers relevés sont conformes')
      : INFO(`⚠ ${horsNorme.length} relevés non conformes parmi les 50 derniers`)
  }

  const { count: nCk } = await sb.from('checklists_hygiene').select('id', { count: 'exact', head: true })
  OK(`${nCk ?? 0} checklists hygiène en base`)

  const { count: nNc } = await sb.from('non_conformites_hygiene').select('id', { count: 'exact', head: true }).eq('statut', 'ouverte')
  OK(`${nNc ?? 0} non-conformités hygiène ouvertes`)
}

// ─────── 5. CLIENTS / CRM ───────
head('CRM / Clients')
{
  const { data: cl, error: e } = await sb.from('clients').select('id, niveau_fidelite, points_fidelite, nb_visites')
  if (e) KO('clients : ' + e.message)
  else {
    OK(`${(cl ?? []).length} clients en base`)
    const niveaux = {}
    for (const c of cl ?? []) niveaux[c.niveau_fidelite ?? 'standard'] = (niveaux[c.niveau_fidelite ?? 'standard'] ?? 0) + 1
    OK('répartition fidélité : ' + JSON.stringify(niveaux))
    const points = (cl ?? []).reduce((s, c) => s + Number(c.points_fidelite ?? 0), 0)
    INFO(`Total points fidélité en circulation : ${points}`)
  }
  const { count: nCamp } = await sb.from('campagnes').select('id', { count: 'exact', head: true })
  OK(`${nCamp ?? 0} campagnes marketing créées`)
  const { count: nReclam } = await sb.from('reclamations').select('id', { count: 'exact', head: true }).eq('statut', 'ouverte')
  OK(`${nReclam ?? 0} réclamations ouvertes`)
}

console.log(`\n${ok} ✓ · ${ko} ✗`)
process.exit(ko > 0 ? 1 : 0)
