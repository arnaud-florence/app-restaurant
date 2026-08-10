// ─── Agent 4 — Contrôleur financier ─────────────────────────────
// Cron : chaque heure.
//
// Tâches :
//   (1) Food cost par plat — alerte > 30% / suggère prix vente cible
//   (2) Masse salariale vs CA du mois — alerte > 35%
//   (3) Trésorerie 30j — factures fournisseurs à payer + charges fixes
//   (4) Détection dérive prix ingrédients — compare entrées récentes vs anciennes
//
// Anti-spam : dédup findings actifs sur (type, identifiant) pour ne pas
// re-créer la même alerte à chaque tick horaire.
//
// Auth : Bearer CRON_SECRET. Manuel : GET /api/cron/agents/financier

import { NextResponse } from 'next/server'
import { runAgent, emitFinding, authCron, type AgentContext } from '@/lib/agents/runner'
import { lundiDeLaSemaine, coutSemaineAvecHeuresSup } from '@/lib/rh'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

const SEUIL_FOOD_COST_ALERTE = 30        // % : finding rouge si > 30%
const SEUIL_FOOD_COST_CIBLE  = 28        // % : objectif pour suggestion prix
const SEUIL_MASSE_SAL_ALERTE = 35        // % du CA : finding rouge si > 35%
const SEUIL_DERIVE_PRIX      = 15        // % d'augmentation prix → finding jaune

export async function GET(req: Request) {
  try { authCron(req) } catch { return new NextResponse('Unauthorized', { status: 401 }) }

  const result = await runAgent('financier', async (ctx) => {
    const foodCost   = await analyseFoodCost(ctx)
    const masseSal   = await analyseMasseSalariale(ctx)
    const tresorerie = await analyseTresorerie(ctx)
    const derive     = await detecterDerivesPrix(ctx)

    const summary = [
      foodCost.nbAlerte > 0
        ? `${foodCost.nbAlerte} plat(s) food cost > ${SEUIL_FOOD_COST_ALERTE}%`
        : foodCost.nbAnalyses > 0
          ? `Food cost moyen ${foodCost.moyenne.toFixed(1)}%`
          : null,
      masseSal.ratio > 0
        ? `Masse sal ${masseSal.ratio.toFixed(1)}% du CA`
        : null,
      tresorerie.tension
        ? `Tension trésorerie : ${tresorerie.aPayerJ30.toFixed(0)}€ à payer J+30`
        : null,
      derive.nbDerives > 0
        ? `${derive.nbDerives} prix ingrédient en hausse`
        : null,
    ].filter(Boolean).join(' · ')

    return {
      summary: summary || 'Aucune alerte financière',
      data: { foodCost, masseSal, tresorerie, derive },
    }
  })

  return NextResponse.json(result)
}

export const POST = GET

// ─────────────────────────────────────────────────────────────
// (1) Food cost par plat
// ─────────────────────────────────────────────────────────────
async function analyseFoodCost(ctx: AgentContext) {
  // Charge recettes actives + leurs liens ingrédients
  const { data: recettes } = await ctx.supabase
    .from('recettes')
    .select('id, nom, prix_vente_ht, nb_portions')
    .eq('actif', true)
  if (!recettes || recettes.length === 0) return { nbAnalyses: 0, nbAlerte: 0, moyenne: 0, plats: [] }

  const { data: liens } = await ctx.supabase
    .from('recette_ingredients')
    .select('recette_id, ingredient_id, quantite, unite')
    .in('recette_id', recettes.map(r => r.id))
  // Si aucun lien ingrédient configuré → finding jaune unique (skip si déjà émis)
  if (!liens || liens.length === 0) {
    if (!(await findingDejaActif(ctx, 'food_cost_indisponible', { key: 'global' }))) {
      await emitFinding(ctx, {
        urgence: 'jaune',
        type: 'food_cost_indisponible',
        titre: 'Food cost non calculable',
        message: 'Aucune recette n\'a d\'ingrédients liés. Renseigne les recettes dans /admin/recettes pour activer le suivi food cost.',
        action_label: 'Configurer les recettes',
        action_url:   '/admin/recettes',
        data: { key: 'global' },
      })
    }
    return { nbAnalyses: 0, nbAlerte: 0, moyenne: 0, plats: [] }
  }

  const ingredientIds = [...new Set(liens.map(l => l.ingredient_id).filter(Boolean) as string[])]
  const { data: ings } = await ctx.supabase
    .from('ingredients')
    .select('id, nom, prix_achat_ht, unite')
    .in('id', ingredientIds)
  const ingMap = new Map<string, { nom: string; prix: number; unite: string }>()
  for (const i of (ings ?? [])) {
    ingMap.set(i.id as string, { nom: i.nom as string, prix: Number(i.prix_achat_ht ?? 0), unite: (i.unite as string) ?? '' })
  }

  // Pour chaque recette : calcule food_cost_total + food_cost_pct
  const liensParRecette = new Map<string, Array<{ ingredient_id: string; quantite: number }>>()
  for (const l of liens) {
    if (!l.ingredient_id) continue
    const arr = liensParRecette.get(l.recette_id as string) ?? []
    arr.push({ ingredient_id: l.ingredient_id as string, quantite: Number(l.quantite ?? 0) })
    liensParRecette.set(l.recette_id as string, arr)
  }

  const plats: Array<{ id: string; nom: string; foodCostPct: number; prixVente: number; prixCible: number; foodCostEur: number }> = []
  let sommeFc = 0
  let nbCalcul = 0
  let nbAlerte = 0
  for (const r of recettes) {
    const ll = liensParRecette.get(r.id as string) ?? []
    if (ll.length === 0) continue
    const fcTotal = ll.reduce((s, l) => {
      const ing = ingMap.get(l.ingredient_id)
      return s + (ing ? ing.prix * l.quantite : 0)
    }, 0)
    const fcParPortion = (Number(r.nb_portions) || 1) > 0 ? fcTotal / Number(r.nb_portions ?? 1) : fcTotal
    const prixVente = Number(r.prix_vente_ht ?? 0)
    if (prixVente <= 0) continue
    const fcPct = (fcParPortion / prixVente) * 100
    const prixCible = Math.ceil((fcParPortion / (SEUIL_FOOD_COST_CIBLE / 100)) * 100) / 100  // arrondi 0.01

    plats.push({
      id: r.id as string,
      nom: r.nom as string,
      foodCostPct: fcPct,
      foodCostEur: fcParPortion,
      prixVente,
      prixCible,
    })
    sommeFc += fcPct
    nbCalcul++

    if (fcPct > SEUIL_FOOD_COST_ALERTE) {
      nbAlerte++
      if (!(await findingDejaActif(ctx, 'food_cost_eleve', { recette_id: r.id as string }))) {
        await emitFinding(ctx, {
          urgence: 'rouge',
          type: 'food_cost_eleve',
          titre: `${r.nom} : food cost ${fcPct.toFixed(1)}%`,
          message: `Coût matière ${fcParPortion.toFixed(2)}€ pour un prix vente ${prixVente.toFixed(2)}€ HT. Prix cible pour 28% : ${prixCible.toFixed(2)}€ HT.`,
          action_label: 'Voir la recette',
          action_url:   '/admin/recettes/engineering',
          data: { recette_id: r.id, food_cost_pct: fcPct, prix_vente_actuel: prixVente, prix_cible: prixCible },
        })
      }
    }
  }
  const moyenne = nbCalcul > 0 ? sommeFc / nbCalcul : 0
  return { nbAnalyses: nbCalcul, nbAlerte, moyenne, plats }
}

// ─────────────────────────────────────────────────────────────
// (2) Masse salariale vs CA mois courant
// ─────────────────────────────────────────────────────────────
async function analyseMasseSalariale(ctx: AgentContext) {
  const moisDebut = new Date()
  moisDebut.setDate(1); moisDebut.setHours(0, 0, 0, 0)

  // CA du mois (commandes encaissées)
  const { data: cmds } = await ctx.supabase
    .from('commandes')
    .select('montant_total_ttc')
    .eq('statut', 'encaisse')
    .gte('created_at', moisDebut.toISOString())
  const ca = (cmds ?? []).reduce((s, c) => s + Number(c.montant_total_ttc ?? 0), 0)

  // Heures pointées du mois × salaire_horaire
  const { data: employes } = await ctx.supabase
    .from('employes')
    .select('id, salaire_horaire, coef_charges_patronales')
    .eq('actif', true)
  const tauxParId = new Map((employes ?? []).map(e => [e.id as string, Number(e.salaire_horaire ?? 0)]))
  const coefParId = new Map((employes ?? []).map(e => [e.id as string, Number(e.coef_charges_patronales ?? 1.42)]))

  const { data: pointages } = await ctx.supabase
    .from('pointage')
    .select('employe_id, date_pointage, heures_travaillees')
    .gte('date_pointage', moisDebut.toISOString().slice(0, 10))
  // Heures par (employé, semaine) → coût avec majoration heures sup (35h · +25% · +50%)
  const heuresParEmpSem = new Map<string, Map<string, number>>()
  for (const p of (pointages ?? []) as Array<{ employe_id: string; date_pointage: string; heures_travaillees: number | null }>) {
    const h = Number(p.heures_travaillees ?? 0)
    if (h <= 0) continue
    const sem = lundiDeLaSemaine(p.date_pointage)
    let m = heuresParEmpSem.get(p.employe_id)
    if (!m) { m = new Map(); heuresParEmpSem.set(p.employe_id, m) }
    m.set(sem, (m.get(sem) ?? 0) + h)
  }
  let masseSalBrute = 0
  let masseSalCh = 0   // charges patronales incluses
  for (const [empId, parSem] of heuresParEmpSem) {
    const taux = tauxParId.get(empId) ?? 0
    const coef = coefParId.get(empId) ?? 1.42
    for (const hSem of parSem.values()) {
      const brut = coutSemaineAvecHeuresSup(hSem, taux)
      masseSalBrute += brut
      masseSalCh    += brut * coef
    }
  }

  const ratio = ca > 0 ? (masseSalCh / ca) * 100 : 0

  // Finding rouge si > seuil
  if (ratio > SEUIL_MASSE_SAL_ALERTE && ca > 0) {
    if (!(await findingDejaActif(ctx, 'masse_salariale_eleve', { mois: moisDebut.toISOString().slice(0, 7) }))) {
      await emitFinding(ctx, {
        urgence: 'rouge',
        type: 'masse_salariale_eleve',
        titre: `Masse salariale ${ratio.toFixed(1)}% du CA — au-dessus du seuil ${SEUIL_MASSE_SAL_ALERTE}%`,
        message: `Masse salariale chargée : ${masseSalCh.toFixed(0)}€ vs CA mois ${ca.toFixed(0)}€. Ratio cible : < 35%. Vérifie les plannings et les heures sup.`,
        action_label: 'Voir RH',
        action_url:   '/admin/rh',
        data: { mois: moisDebut.toISOString().slice(0, 7), masseSalBrute, masseSalCh, ca, ratio },
      })
    }
  }

  return { masseSalBrute, masseSalCh, ca, ratio, mois: moisDebut.toISOString().slice(0, 7) }
}

// ─────────────────────────────────────────────────────────────
// (3) Trésorerie 30j (factures fournisseurs + charges fixes échéance proche)
// ─────────────────────────────────────────────────────────────
async function analyseTresorerie(ctx: AgentContext) {
  const today = new Date()
  const dans30j = new Date()
  dans30j.setDate(dans30j.getDate() + 30)
  const todayStr = today.toISOString().slice(0, 10)
  const j30Str = dans30j.toISOString().slice(0, 10)

  // Factures fournisseurs à payer dans 30j (statut != payee)
  const { data: factures } = await ctx.supabase
    .from('factures_fournisseurs')
    .select('id, numero, fournisseur:fournisseurs(nom), montant_ttc, date_echeance, statut')
    .not('statut', 'eq', 'payee')
    .gte('date_echeance', todayStr)
    .lte('date_echeance', j30Str)
  const aPayerFactures = (factures ?? []).reduce((s, f) => s + Number(f.montant_ttc ?? 0), 0)

  // Charges fixes — table existe : charges_fixes (Module 14)
  // Pour les charges récurrentes mensuelles, on compte la "prochaine_echeance" si dans 30j
  let aPayerCharges = 0
  try {
    const { data: charges } = await ctx.supabase
      .from('charges_fixes')
      .select('libelle, montant_ttc, prochaine_echeance, actif')
      .eq('actif', true)
      .not('prochaine_echeance', 'is', null)
      .gte('prochaine_echeance', todayStr)
      .lte('prochaine_echeance', j30Str)
    aPayerCharges = (charges ?? []).reduce((s, c) => s + Number(c.montant_ttc ?? 0), 0)
  } catch {
    /* table inexistante = ignoré */
  }

  // Trésorerie attendue côté entrées : moyenne CA 30j × 30
  const il30 = new Date()
  il30.setDate(il30.getDate() - 30)
  const { data: caHisto } = await ctx.supabase
    .from('commandes')
    .select('montant_total_ttc')
    .eq('statut', 'encaisse')
    .gte('created_at', il30.toISOString())
  const caMoy30j = (caHisto ?? []).reduce((s, c) => s + Number(c.montant_total_ttc ?? 0), 0)
  const caEspere30j = caMoy30j  // hypothèse simple : même rythme dans 30 prochains jours

  const aPayerJ30 = aPayerFactures + aPayerCharges
  const solde30j = caEspere30j - aPayerJ30
  const tension = solde30j < 0 || (caEspere30j > 0 && aPayerJ30 > caEspere30j * 0.8)

  if (tension) {
    if (!(await findingDejaActif(ctx, 'tresorerie_tension', { periode: todayStr }))) {
      await emitFinding(ctx, {
        urgence: solde30j < 0 ? 'rouge' : 'jaune',
        type: 'tresorerie_tension',
        titre: solde30j < 0
          ? `Trésorerie tendue : -${Math.abs(solde30j).toFixed(0)}€ à 30 jours`
          : `À surveiller : ${aPayerJ30.toFixed(0)}€ à payer pour ${caEspere30j.toFixed(0)}€ attendus`,
        message: `Factures fournisseurs : ${aPayerFactures.toFixed(0)}€ · Charges fixes : ${aPayerCharges.toFixed(0)}€ · CA 30j moyen : ${caEspere30j.toFixed(0)}€.`,
        action_label: 'Voir la trésorerie',
        action_url:   '/admin/finances',
        data: { aPayerFactures, aPayerCharges, aPayerJ30, caEspere30j, solde30j },
      })
    }
  }

  return { aPayerFactures, aPayerCharges, aPayerJ30, caEspere30j, solde30j, tension }
}

// ─────────────────────────────────────────────────────────────
// (4) Détection dérives prix ingrédients (compare 15j récents vs 15j d'avant)
// ─────────────────────────────────────────────────────────────
async function detecterDerivesPrix(ctx: AgentContext) {
  const today = Date.now()
  const il15 = new Date(today - 15 * 86400_000).toISOString()
  const il30 = new Date(today - 30 * 86400_000).toISOString()

  const { data: entrees } = await ctx.supabase
    .from('mouvements_stock')
    .select('ingredient_id, prix_unitaire_ht, created_at, ingredient:ingredients(nom, unite)')
    .eq('type', 'entree')
    .gte('created_at', il30)
    .not('prix_unitaire_ht', 'is', null)
  if (!entrees) return { nbDerives: 0, derives: [] }

  type EntreeRow = { ingredient_id: string | null; prix_unitaire_ht: number | null; created_at: string; ingredient: { nom: string; unite: string } | Array<{ nom: string; unite: string }> | null }

  // Agrège prix moyen sur 2 périodes
  const recent: Record<string, { sum: number; n: number; nom: string; unite: string }> = {}
  const ancien: Record<string, { sum: number; n: number; nom: string; unite: string }> = {}
  for (const e of (entrees as EntreeRow[])) {
    if (!e.ingredient_id || !e.prix_unitaire_ht) continue
    const ingObj = Array.isArray(e.ingredient) ? e.ingredient[0] : e.ingredient
    const nom = ingObj?.nom ?? '—'
    const unite = ingObj?.unite ?? ''
    const target = e.created_at >= il15 ? recent : ancien
    const cur = target[e.ingredient_id] ?? { sum: 0, n: 0, nom, unite }
    cur.sum += Number(e.prix_unitaire_ht)
    cur.n += 1
    target[e.ingredient_id] = cur
  }

  const derives: Array<{ ingredient_id: string; nom: string; ancien: number; recent: number; haussePct: number }> = []
  for (const [id, r] of Object.entries(recent)) {
    const a = ancien[id]
    if (!a || a.n < 2 || r.n < 2) continue
    const moyA = a.sum / a.n
    const moyR = r.sum / r.n
    if (moyA <= 0) continue
    const haussePct = ((moyR - moyA) / moyA) * 100
    if (haussePct < SEUIL_DERIVE_PRIX) continue

    derives.push({ ingredient_id: id, nom: r.nom, ancien: moyA, recent: moyR, haussePct })

    if (!(await findingDejaActif(ctx, 'derive_prix', { ingredient_id: id }))) {
      await emitFinding(ctx, {
        urgence: 'jaune',
        type: 'derive_prix',
        titre: `${r.nom} : +${haussePct.toFixed(0)}% en 15 jours`,
        message: `Prix moyen passé de ${moyA.toFixed(3)}€/${r.unite} à ${moyR.toFixed(3)}€/${r.unite}. Renégocie ou cherche un autre fournisseur.`,
        action_label: 'Voir l\'ingrédient',
        action_url:   '/admin/ingredients',
        data: { ingredient_id: id, nom: r.nom, prix_ancien: moyA, prix_recent: moyR, hausse_pct: haussePct },
      })
    }
  }
  return { nbDerives: derives.length, derives }
}

// ─────────────────────────────────────────────────────────────
// Helper : dédup findings actifs
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
