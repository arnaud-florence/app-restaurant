// ─── Agent 6 — Responsable HACCP ───────────────────────────────
// Cron : chaque heure.
//
// Tâches :
//   (1) Températures : vérifie qu'un relevé existe par équipement × moment
//       (matin attendu après 11h, soir attendu après 21h). Si manquant → rouge.
//       Si un relevé est non conforme → rouge immédiat.
//   (2) Checklists : procédures du moment (ouverture/fermeture/etc.) validées
//       sur la journée. Si manquante en fin de service → rouge.
//   (3) DLC lots : alerte rouge si périmé / jaune si DLC ≤ J+2 (lots en_stock).
//   (4) Échéances obligations légales : J-1 → rouge, J-7 → jaune.
//   (5) Maintenance équipements : prochaine_maintenance ≤ J+30 → jaune/rouge.
//
// Anti-spam : dédup par clé (équipement+moment+date, procédure+date, lot, obligation).
//
// Auth : Bearer CRON_SECRET. Manuel : GET /api/cron/agents/haccp

import { NextResponse } from 'next/server'
import { runAgent, emitFinding, authCron, type AgentContext } from '@/lib/agents/runner'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

// Heures limites pour considérer qu'un relevé matin/soir est "en retard"
const LIMITE_MATIN_H = 11   // après 11h, le relevé matin DOIT être fait
const LIMITE_SOIR_H  = 21   // après 21h, le relevé soir DOIT être fait

export async function GET(req: Request) {
  try { authCron(req) } catch { return new NextResponse('Unauthorized', { status: 401 }) }

  const result = await runAgent('haccp', async (ctx) => {
    const temperatures = await analyseTemperatures(ctx)
    const checklists   = await analyseChecklists(ctx)
    const dlc          = await analyseDLC(ctx)
    const echeances    = await analyseEcheancesLegales(ctx)
    const maintenance  = await analyseMaintenance(ctx)
    const nc           = await analyseNonConformites(ctx)

    const summary = [
      temperatures.nbManquants > 0 ? `${temperatures.nbManquants} relevé(s) T° en retard` : null,
      temperatures.nbNonConformes > 0 ? `${temperatures.nbNonConformes} T° non conforme(s)` : null,
      checklists.nbManquantes > 0 ? `${checklists.nbManquantes} checklist(s) manquante(s)` : null,
      dlc.nbExpires > 0 ? `${dlc.nbExpires} lot(s) expiré(s)` : null,
      dlc.nbProches > 0 ? `${dlc.nbProches} DLC proche(s)` : null,
      echeances.nbAlertes > 0 ? `${echeances.nbAlertes} échéance(s) légale(s)` : null,
      maintenance.nbAlertes > 0 ? `${maintenance.nbAlertes} maintenance(s) à prévoir` : null,
      nc.nbOuvertes > 0 ? `${nc.nbOuvertes} NC ouverte(s)` : null,
    ].filter(Boolean).join(' · ')

    return {
      summary: summary || 'Conformité HACCP OK',
      data: { temperatures, checklists, dlc, echeances, maintenance, nc },
    }
  })

  return NextResponse.json(result)
}

export const POST = GET

// ─────────────────────────────────────────────────────────────
// (1) Températures
// ─────────────────────────────────────────────────────────────
async function analyseTemperatures(ctx: AgentContext) {
  const today = new Date()
  const todayStr = today.toISOString().slice(0, 10)
  const now = today.getHours()

  // Tous les relevés du jour
  const { data: relevesJour } = await ctx.supabase
    .from('releves_temperatures')
    .select('id, equipement, type_equipement, temperature, conforme, moment, created_at')
    .eq('date_releve', todayStr)

  // Liste des équipements connus = ceux qui ont eu au moins un relevé sur 30j
  const il30j = new Date(); il30j.setDate(il30j.getDate() - 30)
  const { data: histo30j } = await ctx.supabase
    .from('releves_temperatures')
    .select('equipement, type_equipement')
    .gte('created_at', il30j.toISOString())
  const equipementsConnus = new Map<string, string | null>()
  for (const r of (histo30j ?? []) as Array<{ equipement: string; type_equipement: string | null }>) {
    if (!equipementsConnus.has(r.equipement)) {
      equipementsConnus.set(r.equipement, r.type_equipement)
    }
  }

  let nbManquants = 0
  let nbNonConformes = 0

  // Pour chaque équipement, vérifie matin + soir
  type ReleveRow = { id: string; equipement: string; temperature: number | null; conforme: boolean | null; moment: string | null }
  const relevesParEqMoment = new Map<string, ReleveRow>()
  for (const r of (relevesJour ?? []) as ReleveRow[]) {
    const moment = r.moment ?? 'autre'
    relevesParEqMoment.set(`${r.equipement}|${moment}`, r)
  }

  for (const [equipement] of equipementsConnus) {
    // (a) Relevé matin manquant après 11h
    if (now >= LIMITE_MATIN_H && !relevesParEqMoment.has(`${equipement}|matin`)) {
      nbManquants++
      const key = `${todayStr}|${equipement}|matin`
      if (!(await findingDejaActif(ctx, 'temperature_manquante', { key }))) {
        await emitFinding(ctx, {
          urgence: 'rouge',
          type: 'temperature_manquante',
          titre: `Température matin manquante : ${equipement}`,
          message: `Aucun relevé de température enregistré ce matin pour ${equipement}. À faire dès que possible — exigence HACCP.`,
          action_label: 'Saisir le relevé',
          action_url:   '/admin/hygiene',
          data: { key, equipement, moment: 'matin', date: todayStr },
        })
      }
    }
    // (b) Relevé soir manquant après 21h
    if (now >= LIMITE_SOIR_H && !relevesParEqMoment.has(`${equipement}|soir`)) {
      nbManquants++
      const key = `${todayStr}|${equipement}|soir`
      if (!(await findingDejaActif(ctx, 'temperature_manquante', { key }))) {
        await emitFinding(ctx, {
          urgence: 'rouge',
          type: 'temperature_manquante',
          titre: `Température soir manquante : ${equipement}`,
          message: `Aucun relevé de température enregistré ce soir pour ${equipement}.`,
          action_label: 'Saisir le relevé',
          action_url:   '/admin/hygiene',
          data: { key, equipement, moment: 'soir', date: todayStr },
        })
      }
    }
  }

  // (c) Relevés non conformes du jour
  for (const r of (relevesJour ?? []) as ReleveRow[]) {
    if (r.conforme === false) {
      nbNonConformes++
      if (!(await findingDejaActif(ctx, 'temperature_non_conforme', { releve_id: r.id }))) {
        await emitFinding(ctx, {
          urgence: 'rouge',
          type: 'temperature_non_conforme',
          titre: `T° non conforme : ${r.equipement} (${r.temperature}°C)`,
          message: `Relevé hors fourchette. Action immédiate requise : vérifier équipement, déplacer produits si nécessaire, ouvrir non-conformité.`,
          action_label: 'Voir le relevé',
          action_url:   '/admin/hygiene',
          data: { releve_id: r.id, equipement: r.equipement, temperature: r.temperature },
        })
      }
    }
  }

  return { nbManquants, nbNonConformes, equipementsConnus: equipementsConnus.size }
}

// ─────────────────────────────────────────────────────────────
// (2) Checklists du jour
// ─────────────────────────────────────────────────────────────
async function analyseChecklists(ctx: AgentContext) {
  const today = new Date()
  const todayStr = today.toISOString().slice(0, 10)
  const now = today.getHours()
  const jourSemaine = today.getDay()  // 0=dim
  const estDebutSemaine = jourSemaine === 1                                  // lundi → checklists hebdomadaires
  const estDebutMois = today.getDate() === 1                                 // 1er du mois → checklists mensuelles

  const { data: procedures } = await ctx.supabase
    .from('procedures_hygiene')
    .select('id, titre, moment')
    .eq('actif', true)
  if (!procedures || procedures.length === 0) return { nbManquantes: 0 }

  const { data: faites } = await ctx.supabase
    .from('checklists_hygiene')
    .select('procedure_id, valide')
    .eq('date_realisation', todayStr)
    .eq('valide', true)
  const idsFaites = new Set((faites ?? []).map(c => c.procedure_id as string))

  let nbManquantes = 0
  for (const p of procedures) {
    // Filtre selon le moment et l'heure courante : on ne signale pas trop tôt
    const moment = p.moment as string | null
    let attendueMaintenant = false
    if (moment === 'ouverture' && now >= 11) attendueMaintenant = true
    else if (moment === 'service' && now >= 15) attendueMaintenant = true
    else if (moment === 'fermeture' && now >= 23) attendueMaintenant = true
    else if (moment === 'hebdomadaire' && estDebutSemaine && now >= 18) attendueMaintenant = true
    else if (moment === 'mensuel' && estDebutMois && now >= 18) attendueMaintenant = true
    else if (!moment) attendueMaintenant = false   // sans moment défini = pas d'alerte horaire
    if (!attendueMaintenant) continue

    if (!idsFaites.has(p.id as string)) {
      nbManquantes++
      const key = `${todayStr}|${p.id}`
      const urgence = (moment === 'fermeture' || moment === 'mensuel') ? 'rouge' : 'jaune'
      if (!(await findingDejaActif(ctx, 'checklist_manquante', { key }))) {
        await emitFinding(ctx, {
          urgence,
          type: 'checklist_manquante',
          titre: `Checklist manquante : ${p.titre}`,
          message: `Procédure ${moment ?? 'sans moment'} non validée aujourd'hui. À compléter et signer.`,
          action_label: 'Voir les checklists',
          action_url:   '/admin/hygiene',
          data: { key, procedure_id: p.id, titre: p.titre, moment, date: todayStr },
        })
      }
    }
  }
  return { nbManquantes }
}

// ─────────────────────────────────────────────────────────────
// (3) DLC lots produits
// ─────────────────────────────────────────────────────────────
async function analyseDLC(ctx: AgentContext) {
  const today = new Date()
  const todayStr = today.toISOString().slice(0, 10)
  const dans2j = new Date(); dans2j.setDate(dans2j.getDate() + 2)
  const dans2jStr = dans2j.toISOString().slice(0, 10)

  const { data: lots } = await ctx.supabase
    .from('lots_produits')
    .select('id, lot_numero, dlc, quantite, unite, ingredient_id, ingredient:ingredients(nom)')
    .eq('statut', 'en_stock')
    .not('dlc', 'is', null)
    .lte('dlc', dans2jStr)

  let nbExpires = 0
  let nbProches = 0
  type LotRow = { id: string; lot_numero: string; dlc: string; quantite: number | null; unite: string | null; ingredient_id: string | null; ingredient: { nom: string } | Array<{ nom: string }> | null }
  for (const lot of (lots ?? []) as LotRow[]) {
    const ingObj = Array.isArray(lot.ingredient) ? lot.ingredient[0] : lot.ingredient
    const nom = ingObj?.nom ?? 'Lot'
    const expire = lot.dlc < todayStr
    if (expire) nbExpires++
    else nbProches++

    if (await findingDejaActif(ctx, 'dlc_lot', { lot_id: lot.id })) continue

    await emitFinding(ctx, {
      urgence: expire ? 'rouge' : 'jaune',
      type: 'dlc_lot',
      titre: expire
        ? `${nom} EXPIRÉ : lot ${lot.lot_numero} (DLC ${lot.dlc})`
        : `${nom} : DLC le ${lot.dlc} (lot ${lot.lot_numero})`,
      message: expire
        ? `À retirer du stock immédiatement et passer en statut 'jeté'. Quantité : ${lot.quantite} ${lot.unite ?? ''}.`
        : `À utiliser en priorité (plat du jour ?). Quantité : ${lot.quantite} ${lot.unite ?? ''}.`,
      action_label: 'Voir la traçabilité',
      action_url:   '/admin/hygiene',
      data: { lot_id: lot.id, lot_numero: lot.lot_numero, dlc: lot.dlc, ingredient: nom, quantite: lot.quantite },
    })
  }
  return { nbExpires, nbProches }
}

// ─────────────────────────────────────────────────────────────
// (4) Échéances obligations légales
// ─────────────────────────────────────────────────────────────
async function analyseEcheancesLegales(ctx: AgentContext) {
  const today = new Date()
  const todayStr = today.toISOString().slice(0, 10)
  const dans30j = new Date(); dans30j.setDate(dans30j.getDate() + 30)
  const dans30jStr = dans30j.toISOString().slice(0, 10)

  const { data: obs } = await ctx.supabase
    .from('obligations_legales')
    .select('id, titre, categorie, date_echeance, statut')
    .not('statut', 'eq', 'fait')
    .not('date_echeance', 'is', null)
    .lte('date_echeance', dans30jStr)

  let nbAlertes = 0
  for (const o of (obs ?? []) as Array<{ id: string; titre: string; categorie: string | null; date_echeance: string; statut: string }>) {
    const j = Math.ceil((new Date(o.date_echeance).getTime() - today.getTime()) / 86400_000)
    let urgence: 'rouge' | 'jaune'
    let prefixe: string
    if (j < 0) { urgence = 'rouge'; prefixe = `DÉPASSÉ il y a ${Math.abs(j)} jour(s)` }
    else if (j <= 1) { urgence = 'rouge'; prefixe = j === 0 ? `Échéance AUJOURD'HUI` : `Échéance DEMAIN` }
    else if (j <= 7) { urgence = 'rouge'; prefixe = `Échéance dans ${j} jour(s)` }
    else { urgence = 'jaune'; prefixe = `Échéance dans ${j} jour(s)` }
    nbAlertes++

    if (await findingDejaActif(ctx, 'echeance_legale', { obligation_id: o.id })) continue

    await emitFinding(ctx, {
      urgence,
      type: 'echeance_legale',
      titre: `${o.titre} : ${prefixe}`,
      message: `${o.categorie ?? 'Obligation'} — échéance ${o.date_echeance}. À renouveler ou faire valider.`,
      action_label: 'Voir l\'obligation',
      action_url:   '/admin/legal',
      data: { obligation_id: o.id, titre: o.titre, date_echeance: o.date_echeance, jours_restants: j },
    })
  }
  return { nbAlertes }
}

// ─────────────────────────────────────────────────────────────
// (6) Non-conformités ouvertes (manuelles + non-température)
//     L'agent surveillait le SIGNAL (T° non conforme) mais jamais
//     la table non_conformites elle-même → NC manuelles invisibles.
// ─────────────────────────────────────────────────────────────
async function analyseNonConformites(ctx: AgentContext) {
  const { data: ncs } = await ctx.supabase
    .from('non_conformites')
    .select('id, type, gravite, description, statut, created_at')
    .in('statut', ['ouverte', 'en_cours'])

  const now = Date.now()
  let nbOuvertes = 0
  for (const nc of (ncs ?? []) as Array<{ id: string; type: string | null; gravite: string | null; description: string | null; statut: string; created_at: string }>) {
    nbOuvertes++
    const ageJours = Math.floor((now - new Date(nc.created_at).getTime()) / 86400_000)
    // On alerte : critique dès le 1er jour, sinon à partir de 2 jours d'ancienneté.
    const critique = nc.gravite === 'critique'
    if (!critique && ageJours < 2) continue
    if (await findingDejaActif(ctx, 'nc_ouverte', { nc_id: nc.id })) continue

    await emitFinding(ctx, {
      urgence: critique ? 'rouge' : 'jaune',
      type: 'nc_ouverte',
      titre: `NC ${nc.gravite ?? ''} ouverte depuis ${ageJours}j : ${(nc.type ?? 'non-conformité')}`,
      message: `${nc.description?.slice(0, 160) ?? 'Non-conformité'} — ouverte le ${nc.created_at.slice(0, 10)}. À traiter et clôturer.`,
      action_label: 'Voir la non-conformité',
      action_url:   '/admin/hygiene',
      data: { nc_id: nc.id, gravite: nc.gravite, type: nc.type, age_jours: ageJours },
    })
  }
  return { nbOuvertes }
}

// ─────────────────────────────────────────────────────────────
// (5) Maintenance équipements (prochaine_maintenance proche)
// ─────────────────────────────────────────────────────────────
async function analyseMaintenance(ctx: AgentContext) {
  const today = new Date()
  const todayStr = today.toISOString().slice(0, 10)
  const dans30j = new Date(); dans30j.setDate(dans30j.getDate() + 30)
  const dans30jStr = dans30j.toISOString().slice(0, 10)

  const { data: eqs } = await ctx.supabase
    .from('equipements')
    .select('id, nom, prochaine_maintenance, prestataire_maintenance')
    .not('prochaine_maintenance', 'is', null)
    .lte('prochaine_maintenance', dans30jStr)

  let nbAlertes = 0
  for (const e of (eqs ?? []) as Array<{ id: string; nom: string; prochaine_maintenance: string; prestataire_maintenance: string | null }>) {
    const j = Math.ceil((new Date(e.prochaine_maintenance).getTime() - today.getTime()) / 86400_000)
    const urgence: 'rouge' | 'jaune' = j <= 7 ? 'rouge' : 'jaune'
    nbAlertes++
    if (await findingDejaActif(ctx, 'maintenance_proche', { equipement_id: e.id })) continue
    await emitFinding(ctx, {
      urgence,
      type: 'maintenance_proche',
      titre: `Maintenance ${e.nom} : ${j < 0 ? `dépassée de ${Math.abs(j)} j` : `dans ${j} jour(s)`}`,
      message: `Prochaine maintenance le ${e.prochaine_maintenance}. ${e.prestataire_maintenance ? `Prestataire : ${e.prestataire_maintenance}` : 'Pas de prestataire renseigné.'}`,
      action_label: 'Voir la maintenance',
      action_url:   '/admin/maintenance',
      data: { equipement_id: e.id, nom: e.nom, date: e.prochaine_maintenance, jours_restants: j },
    })
  }
  return { nbAlertes }
}

// ─────────────────────────────────────────────────────────────
// Helper dédup
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
