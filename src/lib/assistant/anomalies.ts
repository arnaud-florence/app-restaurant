// Module 24 — Détection déterministe d'anomalies à partir d'un snapshot KPI.
// Sortie utilisée pour : (1) le bandeau "3 actions prioritaires du jour"
// (2) inclusion dans le prompt système de l'assistant (alertes).

import type { SnapshotKPI } from './snapshot'

export type Anomalie = {
  niveau: 'critique' | 'attention' | 'info'
  domaine: string
  titre: string
  detail: string
  action_suggeree: string
}

export function detecterAnomalies(s: SnapshotKPI): Anomalie[] {
  const out: Anomalie[] = []

  // ─── Hygiène — toujours en tête ────────────────────────────────
  if (s.hygiene.nc_critiques > 0) {
    out.push({
      niveau: 'critique', domaine: 'hygiene',
      titre: `${s.hygiene.nc_critiques} non-conformité(s) critique(s) ouverte(s)`,
      detail: `Risque sanitaire élevé. Une NC critique non traitée engage la responsabilité du gérant.`,
      action_suggeree: `Aller dans /admin/hygiene → onglet NC, prioriser le traitement immédiat.`,
    })
  }
  if (s.hygiene.nc_anciennes_jours > 7) {
    out.push({
      niveau: 'attention', domaine: 'hygiene',
      titre: `Une NC ouverte depuis ${s.hygiene.nc_anciennes_jours} jours`,
      detail: `Au-delà de 7 jours, l'incident est considéré comme négligé.`,
      action_suggeree: `Clôturer ou escalader la non-conformité la plus ancienne.`,
    })
  }
  if (s.hygiene.controles_temp_jour === 0) {
    out.push({
      niveau: 'attention', domaine: 'hygiene',
      titre: `Aucun relevé de température aujourd'hui`,
      detail: `Le plan HACCP impose au minimum un relevé quotidien.`,
      action_suggeree: `Demander à l'équipe de saisir le relevé du jour avant 18h.`,
    })
  }

  // ─── Stock DLC ─────────────────────────────────────────────────
  if (s.stock.lots_dlc_critique > 0) {
    out.push({
      niveau: 'critique', domaine: 'stock',
      titre: `${s.stock.lots_dlc_critique} lot(s) périment dans <24 h`,
      detail: `Au-delà de la DLC, le produit doit être jeté (obligation légale).`,
      action_suggeree: `Adapter la carte du jour ou les plats du jour pour écouler en priorité.`,
    })
  }
  if (s.stock.lots_dlc_proche > 5) {
    out.push({
      niveau: 'attention', domaine: 'stock',
      titre: `${s.stock.lots_dlc_proche} lots à DLC sous 3 jours`,
      detail: `Risque de pertes financières si non écoulés.`,
      action_suggeree: `Liste à exporter dans /admin/stock pour une promo ou une suggestion serveur.`,
    })
  }

  // ─── Food cost ─────────────────────────────────────────────────
  if (s.food_cost.moyen_pct > 32) {
    out.push({
      niveau: 'critique', domaine: 'food_cost',
      titre: `Food cost moyen à ${s.food_cost.moyen_pct}%`,
      detail: `Au-dessus de 32%, la rentabilité plat est compromise. Cible : <28%.`,
      action_suggeree: `Voir le menu engineering, repricer ou retirer les plats "rouges" du menu.`,
    })
  } else if (s.food_cost.moyen_pct > 30) {
    out.push({
      niveau: 'attention', domaine: 'food_cost',
      titre: `Food cost moyen à ${s.food_cost.moyen_pct}%`,
      detail: `Zone orange, à surveiller. ${s.food_cost.nb_recettes_alerte} recette(s) > 30 %.`,
      action_suggeree: `Auditer les recettes "alerte" en commençant par les plus vendues.`,
    })
  }

  // ─── Masse salariale ─────────────────────────────────────────────
  if (s.rh.ratio_masse_ca > 35 && s.ca.mois_courant > 0) {
    out.push({
      niveau: 'critique', domaine: 'rh',
      titre: `Masse salariale à ${s.rh.ratio_masse_ca}% du CA`,
      detail: `Cible restauration : 28-32% du CA. Au-dessus de 35%, la rentabilité est mécaniquement compromise.`,
      action_suggeree: `Revoir le planning : optimiser les heures sup, lisser les shifts.`,
    })
  } else if (s.rh.ratio_masse_ca > 32 && s.ca.mois_courant > 0) {
    out.push({
      niveau: 'attention', domaine: 'rh',
      titre: `Masse salariale à ${s.rh.ratio_masse_ca}% du CA`,
      detail: `Zone limite. À surveiller en fin de mois.`,
      action_suggeree: `Vérifier le planning des deux semaines à venir.`,
    })
  }

  // ─── Légal ─────────────────────────────────────────────────────
  if (s.legal.obligations_expirees > 0) {
    out.push({
      niveau: 'critique', domaine: 'legal',
      titre: `${s.legal.obligations_expirees} obligation(s) légale(s) expirée(s)`,
      detail: `Risque de sanction administrative ou de fermeture en cas de contrôle.`,
      action_suggeree: `Régulariser immédiatement dans /admin/legal.`,
    })
  }
  if (s.legal.obligations_proches_30j >= 3) {
    out.push({
      niveau: 'attention', domaine: 'legal',
      titre: `${s.legal.obligations_proches_30j} obligation(s) à échéance dans les 30 j`,
      detail: `Anticiper pour éviter les retards.`,
      action_suggeree: `Planifier les actions cette semaine.`,
    })
  }

  // ─── Finances ──────────────────────────────────────────────────
  if (s.finances.montant_factures_a_payer > s.ca.mois_courant * 0.5 && s.ca.mois_courant > 0) {
    out.push({
      niveau: 'attention', domaine: 'finances',
      titre: `${s.finances.montant_factures_a_payer.toFixed(0)} € à payer aux fournisseurs`,
      detail: `Représente plus de 50 % du CA mois courant — tension de trésorerie possible.`,
      action_suggeree: `Vérifier l'échelonnement avec le comptable.`,
    })
  }

  // ─── Tri par criticité (critique > attention > info) ────────────
  const ordre = { critique: 0, attention: 1, info: 2 }
  return out.sort((a, b) => ordre[a.niveau] - ordre[b.niveau])
}

/** Top 3 actions prioritaires : critique d'abord, puis attention. */
export function actionsPrioritaires(anomalies: Anomalie[]): Anomalie[] {
  return anomalies.slice(0, 3)
}
