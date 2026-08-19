// TVA multi-taux — règles fiscales restauration France.
//
// 20% : alcool (peu importe sur place/emporter)
// 10% : plat ou soft sur place
// 5.5% : plat ou soft à emporter
//
// Server + Client safe (pure logic).

export type Consommation = 'sur_place' | 'emporter'

export const TAUX_TVA = {
  ALCOOL:    20,
  SUR_PLACE: 10,
  EMPORTER:  5.5,
} as const

export type TauxTva = 5.5 | 10 | 20

/** Détermine le taux de TVA applicable à une ligne d'article. */
export function tauxTvaArticle(
  contient_alcool: boolean,
  consommation: Consommation,
): TauxTva {
  if (contient_alcool) return 20
  if (consommation === 'sur_place') return 10
  return 5.5
}

/**
 * Taux applicable à la vente d'un produit du CATALOGUE (site, click & collect,
 * comptoir) — par opposition à `tauxTvaArticle`, qui ne connaît que le mode de
 * consommation.
 *
 * Le taux porté par le produit (`recettes.tva`) prime, parce qu'il vient de la
 * carte réellement affichée en boutique : la carte du Fournil (migration 0113)
 * mélange 5,5 % (pains, viennoiseries, pâtisseries, gourmandises) et 10 %
 * (snacking, pizzas, boissons). `tauxTvaArticle(false, 'emporter')` renverrait
 * 5,5 % pour tout, ce qui ferait payer au client autre chose que le prix du
 * panneau — et sous-déclarerait la TVA sur la moitié de la carte.
 *
 * L'alcool reste à 20 % quoi qu'il arrive : c'est la loi, pas une donnée de
 * carte. Sans taux en base, on retombe sur la règle sur place / à emporter.
 */
export function tauxTvaVente(
  produit: { tva?: number | string | null; contient_alcool?: boolean | null },
  consommation: Consommation,
): TauxTva {
  if (produit.contient_alcool) return 20
  const porte = Number(produit.tva)
  if (porte === 5.5 || porte === 10 || porte === 20) return porte
  return tauxTvaArticle(false, consommation)
}

/** Calcule HT, TVA €, TTC pour une quantité × prix_unitaire_ht donné. */
export function calculerLigneTva(
  quantite: number,
  prix_unitaire_ht: number,
  taux: TauxTva,
): { ht: number; tva_eur: number; ttc: number; prix_unitaire_ttc: number } {
  const ht = quantite * prix_unitaire_ht
  const tva_eur = ht * (taux / 100)
  const ttc = ht + tva_eur
  const prix_unitaire_ttc = prix_unitaire_ht * (1 + taux / 100)
  return {
    ht:                Math.round(ht * 100) / 100,
    tva_eur:           Math.round(tva_eur * 100) / 100,
    ttc:               Math.round(ttc * 100) / 100,
    prix_unitaire_ttc: Math.round(prix_unitaire_ttc * 100) / 100,
  }
}

/** Agrège les ventilations par taux pour une commande. */
export function agregerVentilation(
  lignes: Array<{ tva_taux: number; tva_eur: number }>,
): Record<string, number> {
  const map = new Map<string, number>()
  for (const l of lignes) {
    const k = String(l.tva_taux)
    map.set(k, (map.get(k) ?? 0) + Number(l.tva_eur ?? 0))
  }
  const out: Record<string, number> = {}
  for (const [k, v] of map) out[k] = Math.round(v * 100) / 100
  return out
}

export const CONSOMMATION_INFO: Record<Consommation, { label: string; emoji: string; cls: string }> = {
  sur_place: { label: 'Sur place',  emoji: '🍽', cls: 'bg-emerald-100 text-emerald-900 border-emerald-300' },
  emporter:  { label: 'À emporter', emoji: '🥡', cls: 'bg-amber-100 text-amber-900 border-amber-300' },
}
