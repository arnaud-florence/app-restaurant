// Utilitaires de calcul food cost — pures, partagées entre client/serveur.
// Règles métier issues de CLAUDE.md :
//   VERT  : food cost < 28%
//   ORANGE: 28% ≤ food cost ≤ 32%
//   ROUGE : food cost > 32%
//   ALERTE automatique si food cost > 30%

export type StatutFoodCost = 'vert' | 'orange' | 'rouge'

export const SEUIL_VERT_MAX     = 28   // < 28 = vert
export const SEUIL_ORANGE_MAX   = 32   // ≤ 32 = orange, > 32 = rouge
export const SEUIL_ALERTE       = 30   // > 30 = alerte

// ─── Calculs de base ─────────────────────────────────────────────────
export const round2 = (n: number) => Math.round(n * 100) / 100
export const round4 = (n: number) => Math.round(n * 10000) / 10000

export type LigneCout = { quantite: number; prix_achat_ht: number }

/** Coût HT d'une ligne d'ingrédient = quantité × prix d'achat HT. */
export function coutLigne(ligne: LigneCout): number {
  if (!Number.isFinite(ligne.quantite) || !Number.isFinite(ligne.prix_achat_ht)) return 0
  return ligne.quantite * ligne.prix_achat_ht
}

/** Coût HT total = somme des lignes. */
export function coutTotal(lignes: LigneCout[]): number {
  return lignes.reduce((s, l) => s + coutLigne(l), 0)
}

/** Coût HT par portion = total / nb_portions. */
export function coutPortion(total: number, nb_portions: number): number {
  return nb_portions > 0 ? total / nb_portions : 0
}

/** Marge brute HT en euros (par portion). */
export function margeEur(coutPortion: number, prix_vente_ht: number): number {
  return prix_vente_ht - coutPortion
}

/** Marge brute en pourcentage du prix de vente HT. */
export function margePct(coutPortion: number, prix_vente_ht: number): number {
  return prix_vente_ht > 0 ? ((prix_vente_ht - coutPortion) / prix_vente_ht) * 100 : 0
}

/** Food cost en % du prix de vente HT. */
export function foodCostPct(coutPortion: number, prix_vente_ht: number): number {
  return prix_vente_ht > 0 ? (coutPortion / prix_vente_ht) * 100 : 0
}

/**
 * Prix de vente HT suggéré pour atteindre une marge cible (en %).
 * Ex : margeCible=70 → prix = coût / (1 - 0.70) = coût / 0.30
 */
export function prixSuggerePourMarge(coutPortion: number, margeCiblePct: number): number {
  if (margeCiblePct >= 100 || margeCiblePct < 0) return 0
  const ratioCout = (100 - margeCiblePct) / 100
  return ratioCout > 0 ? coutPortion / ratioCout : 0
}

// ─── Statut & alerte ─────────────────────────────────────────────────
export function statutFoodCost(pct: number): StatutFoodCost {
  if (!Number.isFinite(pct) || pct <= 0) return 'vert'
  if (pct < SEUIL_VERT_MAX)   return 'vert'
  if (pct <= SEUIL_ORANGE_MAX) return 'orange'
  return 'rouge'
}

export function alerteFoodCost(pct: number): boolean {
  return Number.isFinite(pct) && pct > SEUIL_ALERTE
}

// ─── Style associé (Tailwind) ────────────────────────────────────────
export const STATUT_FOOD_COST_STYLE: Record<StatutFoodCost, {
  bg: string; text: string; border: string; bgSolid: string; label: string
}> = {
  vert:   { bg: 'bg-emerald-50', text: 'text-emerald-800', border: 'border-emerald-300', bgSolid: 'bg-emerald-600', label: 'Sain' },
  orange: { bg: 'bg-amber-50',   text: 'text-amber-800',   border: 'border-amber-300',   bgSolid: 'bg-amber-500',   label: 'À surveiller' },
  rouge:  { bg: 'bg-red-50',     text: 'text-red-800',     border: 'border-red-300',     bgSolid: 'bg-red-600',     label: 'Trop élevé' },
}

// ─── Synthèse compacte pour les cartes de la liste ───────────────────
export type SyntheseRecette = {
  cout_total: number
  cout_portion: number
  marge_eur: number
  marge_pct: number
  food_cost_pct: number
  statut: StatutFoodCost
  alerte: boolean
}

export function synthese(
  lignes: LigneCout[],
  nb_portions: number,
  prix_vente_ht: number,
  // Achat-revente (Fournil) : prix d'achat unitaire du produit fini.
  // S'AJOUTE au coût de la composition — achat-revente pur : composition
  // vide, coût = cout_achat_ht ; produit transformé : les deux s'additionnent
  // (le surgelé acheté + la matière première associée).
  cout_achat_ht: number = 0,
): SyntheseRecette {
  const total = coutTotal(lignes)
  const portion = coutPortion(total, nb_portions) + (cout_achat_ht > 0 ? round4(cout_achat_ht) : 0)
  const fc = foodCostPct(portion, prix_vente_ht)
  return {
    cout_total: total,
    cout_portion: portion,
    marge_eur: margeEur(portion, prix_vente_ht),
    marge_pct: margePct(portion, prix_vente_ht),
    food_cost_pct: fc,
    statut: statutFoodCost(fc),
    alerte: alerteFoodCost(fc),
  }
}

// ─── Format ──────────────────────────────────────────────────────────
export const fmtPrix = (n: number) =>
  new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n)

export const fmtPrix4 = (n: number) =>
  new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', minimumFractionDigits: 2, maximumFractionDigits: 4 }).format(n)

export const fmtPct = (n: number) =>
  `${(Math.round(n * 10) / 10).toLocaleString('fr-FR')} %`
