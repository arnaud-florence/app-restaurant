// Module 12 — Constantes des 14 allergènes UE (Règlement (UE) N° 1169/2011)
// + utilitaires de calcul.

export type Allergene =
  | 'gluten' | 'crustaces' | 'oeufs' | 'poissons' | 'arachides'
  | 'soja' | 'lait' | 'fruits_a_coque' | 'celeri' | 'moutarde'
  | 'graines_sesame' | 'sulfites' | 'lupin' | 'mollusques'

export const ALLERGENES_EU: Allergene[] = [
  'gluten', 'crustaces', 'oeufs', 'poissons', 'arachides',
  'soja', 'lait', 'fruits_a_coque', 'celeri', 'moutarde',
  'graines_sesame', 'sulfites', 'lupin', 'mollusques',
]

export const ALLERGENE_INFO: Record<Allergene, { label: string; emoji: string; cls: string }> = {
  gluten:         { label: 'Gluten',           emoji: '🌾', cls: 'bg-amber-100  text-amber-900  border-amber-300' },
  crustaces:      { label: 'Crustacés',        emoji: '🦐', cls: 'bg-red-100    text-red-900    border-red-300' },
  oeufs:          { label: 'Œufs',             emoji: '🥚', cls: 'bg-yellow-100 text-yellow-900 border-yellow-300' },
  poissons:       { label: 'Poissons',         emoji: '🐟', cls: 'bg-blue-100   text-blue-900   border-blue-300' },
  arachides:      { label: 'Arachides',        emoji: '🥜', cls: 'bg-orange-100 text-orange-900 border-orange-300' },
  soja:           { label: 'Soja',             emoji: '🫘', cls: 'bg-emerald-100 text-emerald-900 border-emerald-300' },
  lait:           { label: 'Lait',             emoji: '🥛', cls: 'bg-stone-100  text-stone-900  border-stone-300' },
  fruits_a_coque: { label: 'Fruits à coque',   emoji: '🌰', cls: 'bg-amber-200  text-amber-950  border-amber-400' },
  celeri:         { label: 'Céleri',           emoji: '🌿', cls: 'bg-lime-100   text-lime-900   border-lime-300' },
  moutarde:       { label: 'Moutarde',         emoji: '🟡', cls: 'bg-yellow-200 text-yellow-950 border-yellow-400' },
  graines_sesame: { label: 'Graines de sésame', emoji: '🌱', cls: 'bg-stone-200  text-stone-900  border-stone-400' },
  sulfites:       { label: 'Sulfites',         emoji: '🍷', cls: 'bg-violet-100 text-violet-900 border-violet-300' },
  lupin:          { label: 'Lupin',            emoji: '🪻', cls: 'bg-purple-100 text-purple-900 border-purple-300' },
  mollusques:     { label: 'Mollusques',       emoji: '🦪', cls: 'bg-cyan-100   text-cyan-900   border-cyan-300' },
}

/** Vérifie si une string est un Allergene valide. */
export function isAllergene(s: string): s is Allergene {
  return (ALLERGENES_EU as string[]).includes(s)
}

/** Filtre une liste pour ne garder que les Allergenes valides UE. */
export function filterAllergenesUE(arr: string[]): Allergene[] {
  const out: Allergene[] = []
  const seen = new Set<string>()
  for (const a of arr) {
    if (isAllergene(a) && !seen.has(a)) {
      out.push(a)
      seen.add(a)
    }
  }
  return out
}

/**
 * Calcule la liste finale d'allergènes d'une recette =
 *   union(allergènes des ingrédients via recette_ingredients,
 *         allergenes_complementaires de la recette)
 */
export function allergenesRecette(
  ingredientsAllergenes: string[][],   // tableau d'arrays par ingrédient
  allergenesComplementaires: string[],
): Allergene[] {
  const set = new Set<string>()
  for (const arr of ingredientsAllergenes) for (const a of arr) set.add(a)
  for (const a of allergenesComplementaires) set.add(a)
  return filterAllergenesUE(Array.from(set))
}

// ─── Procédures d'urgence ───────────────────────────────────────────
export type TypeProcedureUrgence = 'allergie' | 'incendie' | 'evacuation' | 'malaise' | 'intoxication' | 'vol' | 'autre'

export const TYPE_PROC_URGENCE_INFO: Record<TypeProcedureUrgence, { label: string; emoji: string; cls: string }> = {
  allergie:     { label: 'Réaction allergique', emoji: '⚠️', cls: 'bg-red-100    text-red-900    border-red-300' },
  incendie:     { label: 'Incendie',            emoji: '🔥', cls: 'bg-orange-100 text-orange-900 border-orange-300' },
  evacuation:   { label: 'Évacuation',          emoji: '🚪', cls: 'bg-amber-100  text-amber-900  border-amber-300' },
  malaise:      { label: 'Malaise client',      emoji: '🩺', cls: 'bg-blue-100   text-blue-900   border-blue-300' },
  intoxication: { label: 'Intoxication',        emoji: '☠️', cls: 'bg-violet-100 text-violet-900 border-violet-300' },
  vol:          { label: 'Vol / agression',     emoji: '🚨', cls: 'bg-zinc-200   text-zinc-900   border-zinc-400' },
  autre:        { label: 'Autre',               emoji: '•',  cls: 'bg-zinc-100   text-zinc-800   border-zinc-300' },
}

export type ProcedureUrgence = {
  id: string
  titre: string
  type: TypeProcedureUrgence
  etapes: string[]
  contacts: string | null
  ordre: number
  actif: boolean
}
