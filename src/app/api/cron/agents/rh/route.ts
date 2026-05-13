// ─── Agent 5 — Manager RH ──────────────────────────────────────
// Cron : chaque soir à 22h00.
//
// Tâches :
//   (1) Productivité du jour par employé : CA × tranche horaire / coût salarial
//   (2) Heures sup détectées (> 8h/jour ou > 35h sur 7 jours glissants)
//   (3) Masse salariale 7j courants vs CA — alerte si projection > 35%
//   (4) Pourboires de la journée → suggestion répartition par heures pointées
//
// Auth : Bearer CRON_SECRET. Manuel : GET /api/cron/agents/rh

import { NextResponse } from 'next/server'
import { runAgent, emitFinding, authCron, type AgentContext } from '@/lib/agents/runner'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

const SEUIL_MASSE_SAL_PROJ = 35       // % du CA, alerte rouge si projection dépasse
const SEUIL_HEURES_JOUR    = 8        // h/jour, alerte si dépassé
const SEUIL_HEURES_SEMAINE = 35       // h/sem, alerte si dépassé

export async function GET(req: Request) {
  try { authCron(req) } catch { return new NextResponse('Unauthorized', { status: 401 }) }

  const result = await runAgent('rh', async (ctx) => {
    const productivite = await analyseProductiviteJour(ctx)
    const heuresSup    = await detecterHeuresSup(ctx)
    const projection   = await projeterMasseSalariale(ctx)
    const pourboires   = await suggererRepartitionPourboires(ctx)

    const summary = [
      productivite.nbEmployes > 0 ? `${productivite.nbEmployes} employé(s) actifs aujourd'hui` : 'Aucun pointage aujourd\'hui',
      heuresSup.nbAlertes > 0 ? `${heuresSup.nbAlertes} alerte(s) heures sup` : null,
      projection.tension ? `Masse sal projetée ${projection.ratioProj.toFixed(1)}%` : null,
      pourboires.montant > 0 ? `${pourboires.montant.toFixed(0)}€ pourboires à répartir` : null,
    ].filter(Boolean).join(' · ')

    return {
      summary: summary || 'Journée RH calme',
      data: { productivite, heuresSup, projection, pourboires },
    }
  })

  return NextResponse.json(result)
}

export const POST = GET

// ─────────────────────────────────────────────────────────────
// (1) Productivité par employé sur la journée
// ─────────────────────────────────────────────────────────────
async function analyseProductiviteJour(ctx: AgentContext) {
  const today = new Date()
  const todayStr = today.toISOString().slice(0, 10)
  const jourDebut = new Date(`${todayStr}T00:00:00`).toISOString()
  const jourFin = new Date(`${todayStr}T23:59:59`).toISOString()

  // Pointages du jour
  const { data: pointages } = await ctx.supabase
    .from('pointage')
    .select('employe_id, heure_arrivee, heure_depart, heures_travaillees, employe:employes(prenom, nom, salaire_horaire, coef_charges_patronales, poste)')
    .eq('date_pointage', todayStr)

  type PointageRow = {
    employe_id: string
    heures_travaillees: number | null
    employe: { prenom: string; nom: string; salaire_horaire: number | null; coef_charges_patronales: number | null; poste: string | null } | Array<{ prenom: string; nom: string; salaire_horaire: number | null; coef_charges_patronales: number | null; poste: string | null }> | null
  }
  const rows = (pointages ?? []) as PointageRow[]
  if (rows.length === 0) return { nbEmployes: 0, productiviteParEmploye: [] }

  // CA du jour
  const { data: cmds } = await ctx.supabase
    .from('commandes')
    .select('montant_total_ttc')
    .eq('statut', 'encaisse')
    .gte('created_at', jourDebut)
    .lte('created_at', jourFin)
  const caJour = (cmds ?? []).reduce((s, c) => s + Number(c.montant_total_ttc ?? 0), 0)

  // Coût salarial total chargé
  const productiviteParEmploye: Array<{ employe: string; heures: number; cout: number; partCA: number }> = []
  let coutTotal = 0
  for (const p of rows) {
    const emp = Array.isArray(p.employe) ? p.employe[0] : p.employe
    if (!emp) continue
    const heures = Number(p.heures_travaillees ?? 0)
    const taux = Number(emp.salaire_horaire ?? 0)
    const coef = Number(emp.coef_charges_patronales ?? 1.42)
    const cout = heures * taux * coef
    coutTotal += cout
    productiviteParEmploye.push({
      employe: `${emp.prenom} ${emp.nom}`,
      heures, cout, partCA: 0,
    })
  }
  if (coutTotal > 0) {
    for (const p of productiviteParEmploye) p.partCA = caJour * (p.cout / coutTotal)
  }
  productiviteParEmploye.sort((a, b) => b.partCA - a.partCA)

  return { nbEmployes: rows.length, caJour, coutTotal, productiviteParEmploye }
}

// ─────────────────────────────────────────────────────────────
// (2) Heures supplémentaires (> 8h/j ou > 35h sur 7j glissants)
// ─────────────────────────────────────────────────────────────
async function detecterHeuresSup(ctx: AgentContext) {
  const today = new Date()
  const sept = new Date(); sept.setDate(sept.getDate() - 6)   // 7 jours dont aujourd'hui

  const { data: pointages } = await ctx.supabase
    .from('pointage')
    .select('employe_id, date_pointage, heures_travaillees, employe:employes(prenom, nom)')
    .gte('date_pointage', sept.toISOString().slice(0, 10))
    .lte('date_pointage', today.toISOString().slice(0, 10))

  type PointageHsRow = {
    employe_id: string
    date_pointage: string
    heures_travaillees: number | null
    employe: { prenom: string; nom: string } | Array<{ prenom: string; nom: string }> | null
  }
  const rows = (pointages ?? []) as PointageHsRow[]

  // Agrège par employé
  const parEmploye = new Map<string, { nom: string; totalSem: number; joursDepasse: string[] }>()
  for (const p of rows) {
    const emp = Array.isArray(p.employe) ? p.employe[0] : p.employe
    if (!emp) continue
    const cur = parEmploye.get(p.employe_id) ?? { nom: `${emp.prenom} ${emp.nom}`, totalSem: 0, joursDepasse: [] }
    const h = Number(p.heures_travaillees ?? 0)
    cur.totalSem += h
    if (h > SEUIL_HEURES_JOUR) cur.joursDepasse.push(p.date_pointage)
    parEmploye.set(p.employe_id, cur)
  }

  let nbAlertes = 0
  for (const [id, info] of parEmploye) {
    const depasseSem = info.totalSem > SEUIL_HEURES_SEMAINE
    const depasseJour = info.joursDepasse.length > 0
    if (!depasseSem && !depasseJour) continue
    nbAlertes++
    if (await findingDejaActif(ctx, 'heures_sup', { employe_id: id, semaine: sept.toISOString().slice(0, 10) })) continue
    const detail = []
    if (depasseSem) detail.push(`${info.totalSem.toFixed(1)}h sur 7 jours (seuil ${SEUIL_HEURES_SEMAINE}h)`)
    if (depasseJour) detail.push(`${info.joursDepasse.length} jour(s) > ${SEUIL_HEURES_JOUR}h`)
    await emitFinding(ctx, {
      urgence: depasseSem ? 'rouge' : 'jaune',
      type: 'heures_sup',
      titre: `${info.nom} : heures supplémentaires détectées`,
      message: `${detail.join(' · ')}. À déclarer en heures supplémentaires (majoration légale 25% / 50%) et ajuster planning.`,
      action_label: 'Voir RH',
      action_url:   '/admin/rh',
      data: { employe_id: id, nom: info.nom, totalSem: info.totalSem, joursDepasse: info.joursDepasse, semaine: sept.toISOString().slice(0, 10) },
    })
  }
  return { nbAlertes }
}

// ─────────────────────────────────────────────────────────────
// (3) Projection masse salariale 7j vs CA 7j
// ─────────────────────────────────────────────────────────────
async function projeterMasseSalariale(ctx: AgentContext) {
  const sept = new Date(); sept.setDate(sept.getDate() - 6)
  const today = new Date()

  // Coût salarial chargé sur 7j glissants
  const { data: pointages } = await ctx.supabase
    .from('pointage')
    .select('employe_id, heures_travaillees, employe:employes(salaire_horaire, coef_charges_patronales)')
    .gte('date_pointage', sept.toISOString().slice(0, 10))
    .lte('date_pointage', today.toISOString().slice(0, 10))

  type ProjRow = {
    heures_travaillees: number | null
    employe: { salaire_horaire: number | null; coef_charges_patronales: number | null } | Array<{ salaire_horaire: number | null; coef_charges_patronales: number | null }> | null
  }
  let cout = 0
  for (const p of (pointages ?? []) as ProjRow[]) {
    const emp = Array.isArray(p.employe) ? p.employe[0] : p.employe
    if (!emp) continue
    cout += Number(p.heures_travaillees ?? 0) * Number(emp.salaire_horaire ?? 0) * Number(emp.coef_charges_patronales ?? 1.42)
  }

  // CA sur 7j glissants
  const { data: cmds } = await ctx.supabase
    .from('commandes')
    .select('montant_total_ttc')
    .eq('statut', 'encaisse')
    .gte('created_at', sept.toISOString())
  const ca = (cmds ?? []).reduce((s, c) => s + Number(c.montant_total_ttc ?? 0), 0)

  const ratioProj = ca > 0 ? (cout / ca) * 100 : 0
  const tension = ratioProj > SEUIL_MASSE_SAL_PROJ && ca > 0

  if (tension) {
    const semaineCle = sept.toISOString().slice(0, 10)
    if (!(await findingDejaActif(ctx, 'masse_sal_projection', { semaine: semaineCle }))) {
      await emitFinding(ctx, {
        urgence: 'rouge',
        type: 'masse_sal_projection',
        titre: `Masse salariale 7j : ${ratioProj.toFixed(1)}% du CA — au-dessus du seuil`,
        message: `Coût salarial chargé : ${cout.toFixed(0)}€ · CA : ${ca.toFixed(0)}€. Ajuste les plannings de la semaine prochaine pour rester sous 35%.`,
        action_label: 'Voir planning RH',
        action_url:   '/admin/rh',
        data: { semaine: semaineCle, cout, ca, ratioProj },
      })
    }
  }
  return { cout, ca, ratioProj, tension }
}

// ─────────────────────────────────────────────────────────────
// (4) Pourboires du jour — suggestion répartition par heures
// ─────────────────────────────────────────────────────────────
async function suggererRepartitionPourboires(ctx: AgentContext) {
  const today = new Date()
  const todayStr = today.toISOString().slice(0, 10)
  const jourDebut = new Date(`${todayStr}T00:00:00`).toISOString()
  const jourFin = new Date(`${todayStr}T23:59:59`).toISOString()

  // Pourboires du jour (paiements_caisse avec tip > 0)
  const { data: paiements } = await ctx.supabase
    .from('paiements_caisse')
    .select('tip')
    .gte('created_at', jourDebut)
    .lte('created_at', jourFin)
    .gt('tip', 0)
  const montant = (paiements ?? []).reduce((s, p) => s + Number(p.tip ?? 0), 0)
  if (montant <= 0) return { montant: 0, repartition: [] }

  // Pointages du jour, postes en salle (serveur, barman) ont la part la plus grosse
  const { data: pointages } = await ctx.supabase
    .from('pointage')
    .select('employe_id, heures_travaillees, employe:employes(prenom, nom, poste)')
    .eq('date_pointage', todayStr)

  type PourRow = {
    employe_id: string
    heures_travaillees: number | null
    employe: { prenom: string; nom: string; poste: string | null } | Array<{ prenom: string; nom: string; poste: string | null }> | null
  }
  // Coefficients par poste (modifiables : c'est juste une suggestion)
  const coefPoste: Record<string, number> = { serveur: 1.0, barman: 1.0, gerant: 0.5, cuisinier: 0.4, second: 0.4, pizzaiolo: 0.4, snacking: 0.5, default: 0.5 }
  type LigneSug = { employe: string; poste: string; heures: number; part: number; coef: number }
  const lignes: LigneSug[] = []
  let sommeUnites = 0
  for (const p of (pointages ?? []) as PourRow[]) {
    const emp = Array.isArray(p.employe) ? p.employe[0] : p.employe
    if (!emp) continue
    const heures = Number(p.heures_travaillees ?? 0)
    const poste = (emp.poste ?? 'default').toLowerCase()
    const coef = coefPoste[poste] ?? coefPoste.default
    const unites = heures * coef
    sommeUnites += unites
    lignes.push({ employe: `${emp.prenom} ${emp.nom}`, poste, heures, part: 0, coef })
  }
  for (const l of lignes) {
    l.part = sommeUnites > 0 ? Math.round((l.coef * l.heures / sommeUnites) * montant * 100) / 100 : 0
  }
  lignes.sort((a, b) => b.part - a.part)

  // Finding info (vert) sauf si le montant est important (> 50€) → jaune pour visibilité
  if (await findingDejaActif(ctx, 'pourboires_jour', { date: todayStr })) {
    return { montant, repartition: lignes }
  }
  await emitFinding(ctx, {
    urgence: montant > 50 ? 'jaune' : 'vert',
    type: 'pourboires_jour',
    titre: `Pourboires du ${todayStr.slice(8)}/${todayStr.slice(5,7)} : ${montant.toFixed(2)}€`,
    message: `Suggestion répartition (postes salle × heures) : ${lignes.slice(0, 5).map(l => `${l.employe} ${l.part.toFixed(2)}€`).join(' · ')}.`,
    action_label: 'Valider la répartition',
    action_url:   '/admin/finances/pourboires',
    data: { date: todayStr, montant, repartition: lignes },
  })
  return { montant, repartition: lignes }
}

// ─────────────────────────────────────────────────────────────
async function findingDejaActif(ctx: AgentContext, type: string, data: Record<string, string>): Promise<boolean> {
  const [key, val] = Object.entries(data)[0] ?? []
  if (!key || !val) return false
  const jsonPath = `data->>${key}` as unknown as 'id'
  const { count } = await ctx.supabase
    .from('agent_findings')
    .select('*', { count: 'exact', head: true })
    .eq('agent_id', ctx.agentId)
    .eq('type', type)
    .eq('resolu', false)
    .eq(jsonPath, val)
  return (count ?? 0) > 0
}
