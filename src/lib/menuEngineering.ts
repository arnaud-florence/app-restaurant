// Menu engineering — méthode Kasavana & Smith (1982).
// Croise popularité (mix %) et rentabilité (marge € par portion) pour
// classer chaque plat en 4 quadrants :
//
//   STAR       → mix élevé, marge élevée   → mettre en valeur, ne pas toucher
//   PLOWHORSE  → mix élevé, marge faible   → augmenter le prix, optimiser la recette
//   PUZZLE     → mix faible, marge élevée  → repositionner sur la carte
//   DOG        → mix faible, marge faible  → retirer ou refondre
//
// Seuils standards :
//   • Popularité  : 70% du mix moyen (= 1 / nb_recettes)
//   • Rentabilité : moyenne des marges € par portion
//
// Ces seuils s'auto-ajustent quand on retire/ajoute une recette.

export type Quadrant = 'star' | 'plowhorse' | 'puzzle' | 'dog'

export const QUADRANT_LABEL: Record<Quadrant, string> = {
  star:      'Star',
  plowhorse: 'Vache à lait',
  puzzle:    'Puzzle',
  dog:       'Poids mort',
}

export const QUADRANT_EMOJI: Record<Quadrant, string> = {
  star:      '⭐',
  plowhorse: '🐴',
  puzzle:    '🧩',
  dog:       '⚠️',
}

export const QUADRANT_COLOR: Record<Quadrant, string> = {
  star:      '#10b981', // emerald-500
  plowhorse: '#f59e0b', // amber-500
  puzzle:    '#8b5cf6', // violet-500
  dog:       '#ef4444', // red-500
}

export const QUADRANT_STYLE: Record<Quadrant, { bg: string; text: string; border: string }> = {
  star:      { bg: 'bg-emerald-50', text: 'text-emerald-800', border: 'border-emerald-300' },
  plowhorse: { bg: 'bg-amber-50',   text: 'text-amber-800',   border: 'border-amber-300' },
  puzzle:    { bg: 'bg-violet-50',  text: 'text-violet-800',  border: 'border-violet-300' },
  dog:       { bg: 'bg-red-50',     text: 'text-red-800',     border: 'border-red-300' },
}

export const QUADRANT_DESCRIPTION: Record<Quadrant, string> = {
  star:
    "Très populaire ET très rentable. C'est ton plat appel : maintiens la qualité, ne touche pas au prix, mets-le en première position de carte.",
  plowhorse:
    "Très populaire mais peu rentable. Augmente prudemment le prix, retravaille la recette pour réduire le coût, ou propose-le sous forme de formule à marge meilleure.",
  puzzle:
    "Belle marge mais peu commandé. Repositionne-le sur la carte (1ᵉʳ item, photo plus appétissante), forme les serveurs à le proposer en suggestion verbale.",
  dog:
    "Peu vendu et peu rentable. Envisage de le retirer du menu ou de le réinventer en plat du jour avec un nouveau positionnement.",
}

// ─── Calcul ──────────────────────────────────────────────────────────
export type ArticleVente = {
  recette_id: string
  quantite: number
  prix_unitaire_ht: number
  // created_at sur la commande parente (pour filtrage période)
  created_at: string
}

export type RecetteCalc = {
  recette_id: string
  nom: string
  categorie: string
  tag_destination: string
  prix_vente_ht: number
  cout_portion: number
  marge_par_portion: number
  marge_pct: number
  food_cost_pct: number
}

export type RecetteEngineering = RecetteCalc & {
  ventes: number
  ca_ht: number
  marge_total: number
  mix_pct: number
  quadrant: Quadrant
  prix_suggere_70: number
}

export type SyntheseEngineering = {
  recettes: RecetteEngineering[]
  total_ventes: number
  ca_total: number
  marge_total: number
  ticket_moyen: number
  food_cost_moyen: number
  seuil_popularite: number   // % en dessous duquel on est "peu populaire"
  seuil_marge: number        // € en dessous duquel la marge est "faible"
  par_quadrant: Record<Quadrant, RecetteEngineering[]>
}

export function classifier(
  mix_pct: number,
  marge_par_portion: number,
  seuil_popularite: number,
  seuil_marge: number
): Quadrant {
  const populaire = mix_pct >= seuil_popularite
  const rentable  = marge_par_portion >= seuil_marge
  if (populaire && rentable)   return 'star'
  if (populaire && !rentable)  return 'plowhorse'
  if (!populaire && rentable)  return 'puzzle'
  return 'dog'
}

/**
 * Calcule la matrice menu engineering pour un set de recettes
 * et un set d'articles vendus (déjà filtrés sur la période).
 */
export function calculerMatrice(
  recettesActives: RecetteCalc[],
  articles: ArticleVente[]
): SyntheseEngineering {
  // Agrégation des ventes par recette
  const aggregat = new Map<string, { ventes: number; ca: number }>()
  for (const a of articles) {
    const v = aggregat.get(a.recette_id) ?? { ventes: 0, ca: 0 }
    v.ventes += a.quantite
    v.ca     += a.quantite * a.prix_unitaire_ht
    aggregat.set(a.recette_id, v)
  }

  const total_ventes = Array.from(aggregat.values()).reduce((s, v) => s + v.ventes, 0)
  const ca_total     = Array.from(aggregat.values()).reduce((s, v) => s + v.ca,     0)

  // Étape 1 : enrichir chaque recette
  const enriched = recettesActives.map(r => {
    const v = aggregat.get(r.recette_id) ?? { ventes: 0, ca: 0 }
    return {
      ...r,
      ventes: v.ventes,
      ca_ht: v.ca,
      marge_total: r.marge_par_portion * v.ventes,
      mix_pct: total_ventes > 0 ? (v.ventes / total_ventes) * 100 : 0,
    }
  })

  // Étape 2 : seuils Kasavana
  const nb = recettesActives.length
  const mix_moyen = nb > 0 ? 100 / nb : 0
  const seuil_popularite = mix_moyen * 0.7
  const seuil_marge =
    enriched.length > 0
      ? enriched.reduce((s, e) => s + e.marge_par_portion, 0) / enriched.length
      : 0

  // Étape 3 : classifier + prix suggéré
  const finals: RecetteEngineering[] = enriched.map(e => ({
    ...e,
    quadrant: classifier(e.mix_pct, e.marge_par_portion, seuil_popularite, seuil_marge),
    prix_suggere_70: prixSuggerePourMarge70(e.cout_portion),
  }))

  // Tri par quadrant pour l'UI : Star > Plowhorse > Puzzle > Dog
  const ordreQuadrant: Record<Quadrant, number> = { star: 0, plowhorse: 1, puzzle: 2, dog: 3 }
  finals.sort((a, b) => {
    if (a.quadrant !== b.quadrant) return ordreQuadrant[a.quadrant] - ordreQuadrant[b.quadrant]
    return b.marge_total - a.marge_total
  })

  // Stats globales
  const ticket_moyen = total_ventes > 0 ? ca_total / total_ventes : 0
  const food_cost_moyen =
    finals.length > 0
      ? finals.reduce((s, e) => s + e.food_cost_pct, 0) / finals.length
      : 0

  // Groupement par quadrant
  const par_quadrant: Record<Quadrant, RecetteEngineering[]> = {
    star: [], plowhorse: [], puzzle: [], dog: [],
  }
  for (const f of finals) par_quadrant[f.quadrant].push(f)

  return {
    recettes: finals,
    total_ventes,
    ca_total,
    marge_total: finals.reduce((s, e) => s + e.marge_total, 0),
    ticket_moyen,
    food_cost_moyen,
    seuil_popularite,
    seuil_marge,
    par_quadrant,
  }
}

function prixSuggerePourMarge70(coutPortion: number): number {
  // 70% de marge → coût = 30% du prix → prix = coût / 0.30
  return coutPortion > 0 ? coutPortion / 0.30 : 0
}

/**
 * Suggestion concrète et actionnable pour une recette donnée.
 * Rule-based — pas de LLM nécessaire ici, c'est déterministe et fiable.
 */
export function suggestionPour(r: RecetteEngineering, fmtPrix: (n: number) => string): string {
  switch (r.quadrant) {
    case 'star':
      return `Plat appel : ne change rien au prix (${fmtPrix(r.prix_vente_ht)}). Maintiens la qualité, photo en avant sur la carte.`
    case 'plowhorse': {
      const hausse = r.prix_suggere_70 - r.prix_vente_ht
      if (hausse > 0.5) {
        return `Très demandé mais marge ${r.marge_pct.toFixed(0)}%. Passe le prix de ${fmtPrix(r.prix_vente_ht)} à ${fmtPrix(r.prix_suggere_70)} (+${fmtPrix(hausse)}) pour atteindre 70% de marge.`
      }
      return `Très demandé mais food cost ${r.food_cost_pct.toFixed(0)}%. Optimise la recette (portion, fournisseur) pour récupérer 2-3 points de marge.`
    }
    case 'puzzle':
      return `Belle marge ${r.marge_pct.toFixed(0)}% mais seulement ${r.mix_pct.toFixed(1)}% du mix. Place-le en 1ᵉʳ de section, retravaille la photo, fais-en un argument du serveur.`
    case 'dog':
      return r.ventes === 0
        ? `Aucune vente sur la période. Retire-le du menu ou réinvente-le.`
        : `Peu vendu (${r.ventes} en période) et marge faible. Candidat au retrait du menu ou à la transformation en plat du jour.`
  }
}

/**
 * Position relative pour l'affichage scatter chart.
 * Retourne un point (x: mix_pct, y: marge_par_portion).
 */
export function pointMatrice(r: RecetteEngineering) {
  return {
    x: r.mix_pct,
    y: r.marge_par_portion,
    nom: r.nom,
    quadrant: r.quadrant,
    recette_id: r.recette_id,
  }
}
