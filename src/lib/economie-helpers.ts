// Helpers serveur pour automatiser le calcul du point mort.
// Server-only — types runtime dans lib/economie-types.ts pour partage avec Client.

import { createClient } from '@/lib/supabase/server'
import type { ChargeCategorie, ChargeRow, ChargeVarRow, ContratEmploye } from '@/lib/economie-types'

export type { ChargeCategorie, ChargeRow, ChargeVarRow, ContratEmploye }
export { CATEGORIE_INFO, CHARGE_VAR_INFO } from '@/lib/economie-types'

/** Total mensuel des charges fixes actives. */
export async function totalChargesFixesMensuelles(): Promise<{
  total: number
  par_categorie: Array<{ categorie: ChargeCategorie; total: number; nb: number }>
  charges: ChargeRow[]
}> {
  const sb = await createClient()
  const { data } = await sb.from('charges_fixes_recurrentes')
    .select('*')
    .eq('actif', true)
    .order('categorie').order('libelle')
  const charges = (data ?? []) as ChargeRow[]
  const total = charges.reduce((s, c) => s + Number(c.montant_mensuel_eur ?? 0), 0)

  const map = new Map<ChargeCategorie, { total: number; nb: number }>()
  for (const c of charges) {
    const cur = map.get(c.categorie) ?? { total: 0, nb: 0 }
    cur.total += Number(c.montant_mensuel_eur ?? 0)
    cur.nb    += 1
    map.set(c.categorie, cur)
  }
  return {
    total,
    par_categorie: Array.from(map.entries()).map(([cat, v]) => ({ categorie: cat, ...v })),
    charges,
  }
}

/** Coût total équipe mensuel prévisible (à partir de la masse salariale + charges patronales + avantages).
 *  Base : heures_contrat × 4.33 semaines × salaire_horaire × coef_charges_patronales + avantages.
 *  + heures supp prévues × salaire × coef × 1.25 (majoration légale 25%).
 */
export async function coutMasseSalarialePrev(): Promise<{
  total_eur: number
  par_employe: Array<{
    id: string
    prenom: string
    nom: string
    poste: string
    type_contrat: string
    heures_mois: number
    salaire_horaire: number
    coef: number
    cout_brut_mensuel: number
    cout_employeur_mensuel: number
    avantages: number
    cout_total_mensuel: number
  }>
}> {
  const sb = await createClient()
  const { data } = await sb.from('employes')
    .select('id, prenom, nom, poste, type_contrat, salaire_horaire, heures_contrat, coef_charges_patronales, avantages_mensuel_eur, heures_supp_prevues_mois, actif')
    .eq('actif', true)
    .order('prenom')
  const emps = (data ?? []) as Array<{
    id: string; prenom: string; nom: string; poste: string; type_contrat: string;
    salaire_horaire: number; heures_contrat: number;
    coef_charges_patronales: number | null; avantages_mensuel_eur: number | null;
    heures_supp_prevues_mois: number | null;
  }>

  const par_employe = emps.map(e => {
    const heures_hebdo = Number(e.heures_contrat ?? 35)
    const heures_mois  = heures_hebdo * 4.33                                 // 52 sem / 12 mois
    const tarif        = Number(e.salaire_horaire ?? 0)
    const coef         = Number(e.coef_charges_patronales ?? 1.45)
    const heures_supp  = Number(e.heures_supp_prevues_mois ?? 0)
    const avantages    = Number(e.avantages_mensuel_eur ?? 0)

    const cout_brut    = heures_mois * tarif + heures_supp * tarif * 1.25
    const cout_charges = cout_brut * coef
    const cout_total   = cout_charges + avantages

    return {
      id: e.id,
      prenom: e.prenom,
      nom: e.nom,
      poste: e.poste,
      type_contrat: e.type_contrat ?? 'CDI',
      heures_mois: Math.round(heures_mois * 100) / 100,
      salaire_horaire: tarif,
      coef,
      cout_brut_mensuel:     Math.round(cout_brut * 100) / 100,
      cout_employeur_mensuel: Math.round(cout_charges * 100) / 100,
      avantages,
      cout_total_mensuel:    Math.round(cout_total * 100) / 100,
    }
  })

  const total = par_employe.reduce((s, e) => s + e.cout_total_mensuel, 0)
  return { total_eur: Math.round(total * 100) / 100, par_employe }
}

/** Renvoie les charges variables (% ou €) configurées dans la table charges_variables. */
export async function listerChargesVariables(): Promise<ChargeVarRow[]> {
  const sb = await createClient()
  const { data } = await sb.from('charges_variables').select('*').eq('actif', true).order('type')
  return (data ?? []) as ChargeVarRow[]
}

/** Calcule le taux moyen de charges variables sur les 30 derniers jours :
 *  food cost moyen pondéré + estimation commissions CB.
 */
export async function calculerTauxVariableMoyen(periode_jours: number = 30): Promise<{
  food_cost_pct: number
  commissions_pct: number
  taux_total_pct: number
  ca_periode: number
}> {
  const sb = await createClient()
  const fin   = new Date()
  const debut = new Date(); debut.setDate(debut.getDate() - periode_jours)
  const isoD  = debut.toISOString()
  const isoF  = fin.toISOString()

  // commande_articles n'a pas created_at → on filtre via commandes
  const { data: cmdsIds } = await sb.from('commandes').select('id')
    .gte('created_at', isoD).lte('created_at', isoF)
  const ids = (cmdsIds ?? []).map(c => c.id as string)

  const [artsRes, paysRes, recIngRes] = await Promise.all([
    ids.length > 0
      ? sb.from('commande_articles')
          .select('recette_id, quantite, prix_unitaire_ht')
          .in('commande_id', ids)
      : Promise.resolve({ data: [] as Array<{ recette_id: string; quantite: number; prix_unitaire_ht: number }> }),
    sb.from('paiements_caisse')
      .select('montant, methode')
      .gte('encaisse_at', isoD).lte('encaisse_at', isoF),
    sb.from('recette_ingredients')
      .select('recette_id, quantite, ingredient:ingredients(prix_achat_ht)'),
  ])

  // Coût matière par recette (sum quantité × prix_achat_ht)
  const coutParRecette = new Map<string, number>()
  for (const ri of (recIngRes.data ?? []) as Array<{ recette_id: string; quantite: number; ingredient?: { prix_achat_ht?: number } | null }>) {
    const cout = Number(ri.quantite ?? 0) * Number(ri.ingredient?.prix_achat_ht ?? 0)
    coutParRecette.set(ri.recette_id, (coutParRecette.get(ri.recette_id) ?? 0) + cout)
  }
  // Food cost % moyen pondéré sur les ventes
  let caTotal = 0, foodCostTotal = 0
  for (const a of (artsRes.data ?? []) as Array<{ recette_id: string; quantite: number; prix_unitaire_ht: number }>) {
    const qty = Number(a.quantite ?? 0)
    caTotal       += qty * Number(a.prix_unitaire_ht ?? 0)
    foodCostTotal += qty * Number(coutParRecette.get(a.recette_id) ?? 0)
  }
  const foodCostPct = caTotal > 0 ? (foodCostTotal / caTotal) * 100 : 30

  // Commissions CB ≈ 1.5% du CA carte (on prend la part carte sur le total payé)
  const pays = (paysRes.data ?? []) as Array<{ montant?: number; methode?: string }>
  const total_payments = pays.reduce((s, p) => s + Number(p.montant ?? 0), 0)
  const carte_payments = pays.filter(p => p.methode === 'carte').reduce((s, p) => s + Number(p.montant ?? 0), 0)
  const part_carte_pct = total_payments > 0 ? (carte_payments / total_payments) * 100 : 70   // hypothèse 70% si pas de données
  const commissions_pct = part_carte_pct * 0.015                                              // 1.5% sur la part carte

  return {
    food_cost_pct:    Math.round(foodCostPct * 100) / 100,
    commissions_pct:  Math.round(commissions_pct * 100) / 100,
    taux_total_pct:   Math.round((foodCostPct + commissions_pct) * 100) / 100,
    ca_periode:       Math.round(caTotal * 100) / 100,
  }
}

/** Calcule le taux variable EFFECTIF en combinant :
 *  - charges_variables auto (food_cost + commissions_cb calculés sur 30 jours)
 *  - charges_variables manuel_pct (saisies par le manager en %)
 *  - charges_variables manuel_fixe (saisies en € → converties en % via CA estimé)
 *
 * Si CA insuffisant pour normaliser les fixes en %, les ignore (warning).
 */
export async function calculerTauxVariableEffectif(periode_jours: number = 30): Promise<{
  taux_total_pct: number
  details: Array<{ type: string; libelle: string; mode: string; pct_effectif: number; valeur_brute: number }>
  ca_periode: number
}> {
  const [tauxAuto, charges] = await Promise.all([
    calculerTauxVariableMoyen(periode_jours),
    listerChargesVariables(),
  ])
  const ca = tauxAuto.ca_periode

  const details: Array<{ type: string; libelle: string; mode: string; pct_effectif: number; valeur_brute: number }> = []
  let total_pct = 0

  for (const c of charges) {
    if (c.mode === 'auto') {
      // Auto : on prend la valeur calculée selon le type
      let pct = 0
      if      (c.type === 'food_cost')       pct = tauxAuto.food_cost_pct
      else if (c.type === 'commissions_cb')  pct = tauxAuto.commissions_pct
      details.push({ type: c.type, libelle: c.libelle, mode: c.mode, pct_effectif: pct, valeur_brute: pct })
      total_pct += pct
    } else if (c.mode === 'manuel_pct') {
      const pct = Number(c.valeur_pct ?? 0)
      details.push({ type: c.type, libelle: c.libelle, mode: c.mode, pct_effectif: pct, valeur_brute: pct })
      total_pct += pct
    } else if (c.mode === 'manuel_fixe') {
      // Fixe : on convertit en % approximatif via CA / mois (CA 30j / 12 ≈ CA mois)
      const ca_mois_estime = ca > 0 ? ca : 0
      const fixe = Number(c.valeur_fixe_eur ?? 0)
      const pct = ca_mois_estime > 0 ? (fixe / ca_mois_estime) * 100 : 0
      details.push({ type: c.type, libelle: c.libelle, mode: c.mode, pct_effectif: pct, valeur_brute: fixe })
      total_pct += pct
    }
  }

  return {
    taux_total_pct: Math.round(total_pct * 100) / 100,
    details,
    ca_periode: ca,
  }
}

/** Calcule une suggestion de point mort pour le mois donné, basé sur :
 *  - charges fixes récurrentes (loyer, énergie, etc.)
 *  + coût masse salariale prévisible (employé × heures × coef)
 *  - taux variable effectif (food cost + commissions + jetable + ...)
 */
export async function suggererPointMort(): Promise<{
  charges_fixes_eur: number
  taux_charges_variables_pct: number
  ca_seuil_calcule: number
  details: {
    charges: { total: number; nb: number; categories: number }
    masse_sal_estimee: number
    food_cost_pct: number
    commissions_pct: number
    autres_var_pct: number
    sans_donnees: boolean
  }
}> {
  const [chargesInfo, tauxEff, salariale, tauxAuto] = await Promise.all([
    totalChargesFixesMensuelles(),
    calculerTauxVariableEffectif(30),
    coutMasseSalarialePrev(),
    calculerTauxVariableMoyen(30),
  ])

  // On INCLUT le coût employeur dans les charges fixes seulement s'il n'est pas
  // déjà dans charges_fixes_recurrentes (catégories 'salaires' ou 'charges_sociales').
  const dejaSal = chargesInfo.par_categorie
    .filter(c => c.categorie === 'salaires' || c.categorie === 'charges_sociales')
    .reduce((s, c) => s + c.total, 0)

  // Si l'utilisateur a saisi salaires en charges fixes ET les contrats sont remplis,
  // on prend le PLUS GRAND des 2 (sécurité — évite le double-comptage).
  const masse_sal_a_inclure = Math.max(0, salariale.total_eur - dejaSal)

  const charges_fixes = chargesInfo.total + masse_sal_a_inclure
  const taux = tauxEff.taux_total_pct >= 99 ? 30 : tauxEff.taux_total_pct
  const seuil = charges_fixes / (1 - taux / 100)

  // Détail des charges variables hors auto
  const autres_var_pct = tauxEff.details
    .filter(d => d.mode !== 'auto')
    .reduce((s, d) => s + d.pct_effectif, 0)

  return {
    charges_fixes_eur:           Math.round(charges_fixes * 100) / 100,
    taux_charges_variables_pct:  Math.round(taux * 100) / 100,
    ca_seuil_calcule:            Math.round(seuil * 100) / 100,
    details: {
      charges: {
        total:      chargesInfo.total,
        nb:         chargesInfo.charges.length,
        categories: chargesInfo.par_categorie.length,
      },
      masse_sal_estimee: salariale.total_eur,
      food_cost_pct:     tauxAuto.food_cost_pct,
      commissions_pct:   tauxAuto.commissions_pct,
      autres_var_pct:    Math.round(autres_var_pct * 100) / 100,
      sans_donnees:      tauxAuto.ca_periode < 100,
    },
  }
}
