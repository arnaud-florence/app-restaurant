// Module 24 — Construction du prompt système pour Claude.
// Stable (cacheable) : persona + cadre métier. Volatile (post-cache) : snapshot + alertes.

import type { SnapshotKPI } from './snapshot'
import type { Anomalie } from './anomalies'

export const PERSONA_RESTO = `Tu es l'assistant IA du gérant d'un restaurant français.
Tu aides à piloter au quotidien : finances, équipe, hygiène, stock, juridique, exploitation.
Tu réponds en français, de manière concise et opérationnelle.

Tes principes :
1. Sois factuel : appuie tes réponses sur les KPIs fournis dans le contexte ci-dessous.
2. Quand un chiffre est demandé, cite-le tel qu'il apparaît dans le snapshot, sans inventer.
3. Si l'info n'est pas dans le snapshot, dis-le clairement et invite à consulter le module concerné (/admin/finances, /admin/hygiene, etc.).
4. Quand tu suggères une action, indique précisément l'écran ou la fonction de l'app à utiliser.
5. Pour les questions de réglementation française (HACCP, droit du travail, hygiène), reste prudent et recommande de consulter un professionnel pour les cas critiques.

Cadre métier — repères clés à utiliser dans tes raisonnements :
- Food cost : cible <28 %, alerte >30 %, rouge >32 %.
- Masse salariale : cible 28-32 % du CA TTC, rouge >35 %.
- HACCP : relevés température 2× par jour, NC critique = action immédiate.
- DLC : tout produit dépassé doit être jeté (obligation légale).
- Marges plats : cible 70 % minimum.

Modules disponibles dans l'app :
caisse, hygiene, stock, recettes, ingredients, fournisseurs, boissons, allergenes,
rh, finances, energie, maintenance, legal, dechets, groupes, clients, reservations,
previsionnel, journal.`

/**
 * Construit le tableau system pour Claude.
 * - Bloc 1 = persona (long, stable, cacheable).
 * - Bloc 2 = snapshot + alertes (court, change à chaque conversation).
 *
 * Le caller doit poser cache_control sur le bloc 1 uniquement
 * (la volatilité du bloc 2 invaliderait le cache à chaque conversation).
 */
export function construireSystemBlocks(snapshot: SnapshotKPI, anomalies: Anomalie[]) {
  const snapshotBlock = `# Contexte temps réel — généré le ${snapshot.genere_le}

## Chiffre d'affaires (mois ${snapshot.periode.mois})
- CA mois : ${snapshot.ca.mois_courant.toFixed(2)} €
- Couverts mois : ${snapshot.ca.nb_couverts_mois}
- Panier moyen : ${snapshot.ca.panier_moyen.toFixed(2)} €
- Jours d'activité : ${snapshot.ca.jours_actifs}

## Équipe
- Employés actifs : ${snapshot.rh.nb_employes_actifs}
- Masse salariale mois : ${snapshot.rh.masse_salariale_mois.toFixed(2)} €
- Ratio masse / CA : ${snapshot.rh.ratio_masse_ca}%

## Cuisine
- Food cost moyen : ${snapshot.food_cost.moyen_pct}%
- Recettes en alerte (>30%) : ${snapshot.food_cost.nb_recettes_alerte}
- Recettes rouges (>32%) : ${snapshot.food_cost.nb_recettes_rouge}

## Hygiène
- Non-conformités ouvertes : ${snapshot.hygiene.nc_ouvertes}
- Dont critiques : ${snapshot.hygiene.nc_critiques}
- Plus ancienne : ${snapshot.hygiene.nc_anciennes_jours} jour(s)
- Relevés température aujourd'hui : ${snapshot.hygiene.controles_temp_jour}

## Stock
- Lots DLC <24h : ${snapshot.stock.lots_dlc_critique}
- Lots DLC <3j : ${snapshot.stock.lots_dlc_proche}
- Valeur stock : ${snapshot.stock.valeur_stock.toFixed(2)} €

## Légal
- Obligations expirées : ${snapshot.legal.obligations_expirees}
- À échéance <30 j : ${snapshot.legal.obligations_proches_30j}

## Finances
- Factures à payer : ${snapshot.finances.factures_a_payer} (${snapshot.finances.montant_factures_a_payer.toFixed(2)} €)
- Charges fixes mois : ${snapshot.finances.charges_fixes_mois.toFixed(2)} €

## Réservations
- Couverts aujourd'hui : ${snapshot.reservations.couverts_jour}
- Couverts semaine : ${snapshot.reservations.couverts_semaine}

${anomalies.length > 0 ? `## ⚠️ Alertes détectées
${anomalies.map(a => `- [${a.niveau.toUpperCase()}] ${a.titre} — ${a.detail}`).join('\n')}` : '## ✅ Aucune anomalie détectée.'}`

  return [
    { type: 'text' as const, text: PERSONA_RESTO, cache_control: { type: 'ephemeral' as const } },
    { type: 'text' as const, text: snapshotBlock },
  ]
}
