// Combien de temps une commande occupe le four.
//
// Règle du gérant (23/09/2026) : une grosse commande ne se sert pas plus vite
// qu'une petite, elle prend simplement plus de temps. Plutôt que de refuser
// tout panier dépassant la capacité d'un créneau — ce qui renvoyait le client
// chez lui sans un mot — la commande s'étale sur les créneaux suivants.
//
//   jusqu'à  8 pizzas  →  15 min  (1 créneau)
//   de 9 à  15 pizzas  →  30 min  (2 créneaux)
//   16 et plus         →  45 min  (3 créneaux)
//
// ⚠️ LA BORNE DE 8 EST UN CHOIX, ET IL EST DOCUMENTÉ ICI. La consigne disait
// « entre 4 et 8 → 15 min » ET « à partir de 8 → 30 min » : les deux se
// recouvrent sur 8. Retenu : **8 tient en un créneau**, la seconde phrase se
// lisant « au-delà ». Une pizza d'écart, mais il faut trancher quelque part
// et le dire — un seuil implicite se redécouvre au comptoir un samedi soir.
//
// ⚠️ LA CAPACITÉ D'UN CRÉNEAU DÉCOULE DE CETTE TABLE : si 8 pizzas tiennent
// en 15 minutes, un créneau vaut 8 places. Le « 4 » donné avant cette règle
// la rendait impossible — un panier de 6 n'aurait jamais trouvé d'horaire.
// Les deux chiffres doivent bouger ensemble : `CAPACITE_CRENEAU` ici, et
// `max_articles` en base (scripts/creneaux-services.mjs).

/** Articles qu'un créneau de 15 min peut sortir. */
export const CAPACITE_CRENEAU = 8

/** Paliers : [quantité maximale, créneaux occupés]. */
const PALIERS: Array<[number, number]> = [
  [8, 1],
  [15, 2],
  [Infinity, 3],
]

/** Nombre de créneaux consécutifs qu'une commande de `quantite` articles occupe. */
export function creneauxOccupes(quantite: number): number {
  const q = Math.max(1, Math.floor(quantite))
  return PALIERS.find(([max]) => q <= max)![1]
}

/** Durée réservée, en minutes, pour un créneau de base de `dureeCreneau`. */
export function dureeOccupee(quantite: number, dureeCreneau = 15): number {
  return creneauxOccupes(quantite) * dureeCreneau
}

/**
 * Une commande de `quantite` articles tient-elle à partir de l'index `i` ?
 *
 * `restants` est la place libre de chaque créneau de la journée, dans
 * l'ordre. On exige que les créneaux nécessaires EXISTENT tous — une
 * commande de 45 minutes ne peut pas commencer à 21h45, le service ferme à
 * 22h — et que leur place cumulée suffise.
 */
export function tientAPartirDe(restants: number[], i: number, quantite: number): boolean {
  const n = creneauxOccupes(quantite)
  if (i + n > restants.length) return false
  let place = 0
  for (let k = i; k < i + n; k++) place += restants[k]
  return place >= quantite
}
