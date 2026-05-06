// Calculs spécifiques à la carte des vins & boissons.
// - Marges multi-format (verre / bouteille / pinte) calculées séparément
// - Rendement fût (nb pintes par fût + CA potentiel)
// - Auto-suggestions accords mets/vins par règles couleur × type plat

import { fmtPrix as _fmtPrix, fmtPct as _fmtPct, statutFoodCost, type StatutFoodCost } from './foodCost'

export const fmtPrix = _fmtPrix
export const fmtPct  = _fmtPct

// ─── Modèles ─────────────────────────────────────────────────────────
export type Boisson = {
  id: string
  nom: string
  type: 'vin' | 'champagne' | 'biere_pression' | 'biere_bouteille' | 'soft' | 'eau' | 'spiritueux' | 'cafe_the' | 'cocktail' | 'autre'
  appellation: string | null
  millesime: number | null
  region: string | null
  cepage: string | null
  couleur: 'rouge' | 'blanc' | 'rose' | 'champagne' | 'liquoreux' | 'autre' | null

  fournisseur_principal: string | null
  fournisseur_secondaire: string | null

  prix_achat_ht_bouteille: number
  contenance_bouteille_cl: number
  prix_achat_ht_fut: number
  contenance_fut_cl: number

  prix_vente_ht_verre: number
  contenance_verre_cl: number
  prix_vente_ht_bouteille: number
  prix_vente_ht_pinte: number
  contenance_pinte_cl: number
  tva: number

  stock_actuel_bouteilles: number
  stock_minimum_bouteilles: number
  stock_actuel_futs: number
  stock_minimum_futs: number

  description: string | null
  photo_url: string | null
  actif: boolean
  ordre: number
  created_at: string
  updated_at: string
}

// ─── Constantes UI ───────────────────────────────────────────────────
export const TYPE_LABEL: Record<Boisson['type'], { label: string; emoji: string; cls: string }> = {
  vin:             { label: 'Vin',          emoji: '🍷', cls: 'bg-red-50    text-red-800    border-red-200' },
  champagne:       { label: 'Champagne',    emoji: '🥂', cls: 'bg-amber-50  text-amber-800  border-amber-200' },
  biere_pression:  { label: 'Bière (fût)',  emoji: '🍺', cls: 'bg-yellow-50 text-yellow-800 border-yellow-200' },
  biere_bouteille: { label: 'Bière (btl)',  emoji: '🍻', cls: 'bg-yellow-50 text-yellow-800 border-yellow-200' },
  soft:            { label: 'Soft',         emoji: '🥤', cls: 'bg-blue-50   text-blue-800   border-blue-200' },
  eau:             { label: 'Eau',          emoji: '💧', cls: 'bg-cyan-50   text-cyan-800   border-cyan-200' },
  spiritueux:      { label: 'Spiritueux',   emoji: '🥃', cls: 'bg-orange-50 text-orange-800 border-orange-200' },
  cafe_the:        { label: 'Café/Thé',     emoji: '☕', cls: 'bg-stone-100 text-stone-800  border-stone-300' },
  cocktail:        { label: 'Cocktail',     emoji: '🍹', cls: 'bg-pink-50   text-pink-800   border-pink-200' },
  autre:           { label: 'Autre',        emoji: '🍶', cls: 'bg-muted text-muted-foreground border' },
}

export const COULEUR_LABEL: Record<NonNullable<Boisson['couleur']>, { label: string; cls: string }> = {
  rouge:     { label: 'Rouge',     cls: 'bg-red-100 text-red-900 border-red-300' },
  blanc:     { label: 'Blanc',     cls: 'bg-amber-50 text-amber-900 border-amber-300' },
  rose:      { label: 'Rosé',      cls: 'bg-pink-100 text-pink-900 border-pink-300' },
  champagne: { label: 'Champagne', cls: 'bg-amber-100 text-amber-900 border-amber-300' },
  liquoreux: { label: 'Liquoreux', cls: 'bg-yellow-100 text-yellow-900 border-yellow-300' },
  autre:     { label: 'Autre',     cls: 'bg-muted text-muted-foreground border' },
}

// ─── Calcul marge par format ─────────────────────────────────────────
export type MargeFormat = {
  applicable: boolean       // true si ce format est utilisé
  prix_achat_ht: number     // ramené au format de vente
  prix_vente_ht: number
  marge_eur: number
  marge_pct: number
  food_cost_pct: number
  statut: StatutFoodCost
}

export function margeBouteille(b: Boisson): MargeFormat {
  const applicable = b.prix_vente_ht_bouteille > 0 && b.prix_achat_ht_bouteille > 0
  if (!applicable) return inactiveMarge()
  const ach = b.prix_achat_ht_bouteille
  const vte = b.prix_vente_ht_bouteille
  return computeMarge(ach, vte)
}

export function margeVerre(b: Boisson): MargeFormat {
  // Le verre est un sous-multiple de la bouteille.
  const applicable =
    b.prix_vente_ht_verre > 0 &&
    b.prix_achat_ht_bouteille > 0 &&
    b.contenance_bouteille_cl > 0 &&
    b.contenance_verre_cl > 0
  if (!applicable) return inactiveMarge()
  const ach = (b.prix_achat_ht_bouteille / b.contenance_bouteille_cl) * b.contenance_verre_cl
  const vte = b.prix_vente_ht_verre
  return computeMarge(ach, vte)
}

export function margePinte(b: Boisson): MargeFormat {
  const applicable =
    b.prix_vente_ht_pinte > 0 &&
    b.prix_achat_ht_fut > 0 &&
    b.contenance_fut_cl > 0 &&
    b.contenance_pinte_cl > 0
  if (!applicable) return inactiveMarge()
  const ach = (b.prix_achat_ht_fut / b.contenance_fut_cl) * b.contenance_pinte_cl
  const vte = b.prix_vente_ht_pinte
  return computeMarge(ach, vte)
}

function inactiveMarge(): MargeFormat {
  return { applicable: false, prix_achat_ht: 0, prix_vente_ht: 0, marge_eur: 0, marge_pct: 0, food_cost_pct: 0, statut: 'vert' }
}

function computeMarge(achat: number, vente: number): MargeFormat {
  const marge_eur = vente - achat
  const marge_pct = vente > 0 ? (marge_eur / vente) * 100 : 0
  const food_cost_pct = vente > 0 ? (achat / vente) * 100 : 0
  return {
    applicable: true,
    prix_achat_ht: achat,
    prix_vente_ht: vente,
    marge_eur,
    marge_pct,
    food_cost_pct,
    statut: statutFoodCost(food_cost_pct),
  }
}

// ─── Rendement fût ───────────────────────────────────────────────────
export type RendementFut = {
  applicable: boolean
  nb_pintes_par_fut: number
  prix_achat_par_pinte: number
  ca_potentiel_par_fut: number   // si toutes les pintes sont vendues
  marge_potentielle_par_fut: number
}

export function rendementFut(b: Boisson): RendementFut {
  const applicable =
    b.contenance_fut_cl > 0 &&
    b.contenance_pinte_cl > 0 &&
    b.prix_achat_ht_fut > 0
  if (!applicable) {
    return { applicable: false, nb_pintes_par_fut: 0, prix_achat_par_pinte: 0, ca_potentiel_par_fut: 0, marge_potentielle_par_fut: 0 }
  }
  const nb = b.contenance_fut_cl / b.contenance_pinte_cl
  const ach = b.prix_achat_ht_fut / nb
  const ca  = nb * b.prix_vente_ht_pinte
  const marge = ca - b.prix_achat_ht_fut
  return {
    applicable: true,
    nb_pintes_par_fut: nb,
    prix_achat_par_pinte: ach,
    ca_potentiel_par_fut: ca,
    marge_potentielle_par_fut: marge,
  }
}

// ─── Statut stock ────────────────────────────────────────────────────
// On suit deux stocks : bouteilles (toujours pertinent) et fûts
// (uniquement pour bières pression). Le "pire" des deux pilote l'alerte.
export type StatutStockBoisson = 'rouge' | 'orange' | 'vert' | 'na'

export function statutStockBouteilles(b: Boisson): StatutStockBoisson {
  if (b.prix_achat_ht_bouteille === 0 && b.contenance_bouteille_cl === 0) return 'na'
  if (b.stock_actuel_bouteilles <= 0) return 'rouge'
  if (b.stock_actuel_bouteilles <= b.stock_minimum_bouteilles) return 'orange'
  return 'vert'
}

export function statutStockFuts(b: Boisson): StatutStockBoisson {
  if (b.contenance_fut_cl === 0) return 'na'
  if (b.stock_actuel_futs <= 0) return 'rouge'
  if (b.stock_actuel_futs <= b.stock_minimum_futs) return 'orange'
  return 'vert'
}

// ─── Auto-suggestions accords mets/vins ──────────────────────────────
// Règles déterministes basées sur :
//   • Couleur du vin × catégorie/nom de la recette
//   • Type de boisson (vin uniquement pour les accords classiques)
//
// Renvoie un score 0-100 d'affinité.

export type RecetteShort = {
  id: string
  nom: string
  categorie: string
  tag_destination: string
}

export type SuggestionAccord = {
  recette_id: string
  recette_nom: string
  score: number
  raison: string
}

const KEYWORDS_PROTEINE_ROUGE = /(magret|canard|bœuf|boeuf|gibier|agneau|veau|côte|entrecôte|tartare)/i
const KEYWORDS_POISSON        = /(saumon|thon|cabillaud|loup|bar|sole|truite|huître|crevette|coquille)/i
const KEYWORDS_VOLAILLE       = /(poulet|poularde|caille|pintade|magret blanc)/i
const KEYWORDS_FROMAGE        = /(fromage|chèvre|comté|brie|camembert)/i
const KEYWORDS_DESSERT_SUCRE  = /(tarte|gâteau|chocolat|mousse|crème brûlée|tiramisu|fondant|sorbet|glace)/i

/**
 * Suggère les recettes les plus compatibles avec une boisson donnée.
 * Ne renvoie que les recettes avec un score > 0.
 */
export function suggererAccordsPour(boisson: Boisson, recettes: RecetteShort[]): SuggestionAccord[] {
  if (boisson.type !== 'vin' && boisson.type !== 'champagne') return []

  const couleur = boisson.couleur ?? 'autre'
  const out: SuggestionAccord[] = []

  for (const r of recettes) {
    const texte = `${r.nom} ${r.categorie}`.toLowerCase()
    let score = 0
    const raisons: string[] = []

    if (couleur === 'rouge') {
      if (KEYWORDS_PROTEINE_ROUGE.test(texte))   { score += 70; raisons.push('viande rouge / gibier') }
      if (KEYWORDS_FROMAGE.test(texte))          { score += 20; raisons.push('fromage') }
      if (r.tag_destination === 'PIZZA')         { score += 30; raisons.push('pizza tomatée') }
      if (KEYWORDS_POISSON.test(texte))          { score -= 30; raisons.push('… poisson : à éviter') }
    } else if (couleur === 'blanc') {
      if (KEYWORDS_POISSON.test(texte))          { score += 70; raisons.push('poisson / fruits de mer') }
      if (KEYWORDS_VOLAILLE.test(texte))         { score += 50; raisons.push('volaille') }
      if (KEYWORDS_FROMAGE.test(texte))          { score += 30; raisons.push('fromage frais') }
      if (KEYWORDS_PROTEINE_ROUGE.test(texte))   { score -= 20; raisons.push('… viande rouge : moins idéal') }
    } else if (couleur === 'rose') {
      if (r.tag_destination === 'PIZZA')         { score += 40; raisons.push('pizza') }
      if (texte.includes('salade'))              { score += 50; raisons.push('salade') }
      if (KEYWORDS_VOLAILLE.test(texte))         { score += 40; raisons.push('volaille') }
      if (texte.includes('apéritif'))            { score += 30; raisons.push('apéritif') }
    } else if (couleur === 'champagne' || boisson.type === 'champagne') {
      if (texte.includes('apéritif'))            { score += 60; raisons.push('apéro festif') }
      if (KEYWORDS_DESSERT_SUCRE.test(texte))    { score += 50; raisons.push('dessert sucré') }
      if (texte.includes('huître') || texte.includes('saumon')) { score += 50; raisons.push('iodé') }
    } else if (couleur === 'liquoreux') {
      if (KEYWORDS_DESSERT_SUCRE.test(texte))    { score += 70; raisons.push('dessert') }
      if (KEYWORDS_FROMAGE.test(texte))          { score += 50; raisons.push('fromage à pâte persillée') }
    }

    if (score > 0) {
      out.push({
        recette_id: r.id,
        recette_nom: r.nom,
        score: Math.min(100, score),
        raison: raisons.join(' · '),
      })
    }
  }

  return out.sort((a, b) => b.score - a.score)
}
