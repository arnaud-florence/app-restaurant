// Commande fournisseur conseillée (Fournil, achat-revente).
//
// L'outil connaît trois choses que le gérant recompose de tête à chaque
// commande Gineys : le rythme de vente par produit, la casse du soir, et le
// conditionnement (les « C=96 » des factures). Ces fonctions les combinent
// en suggestion de colis. PURES et sans I/O : testées par
// scripts/test-commande-fournisseur.mjs.

/** Extrait le conditionnement « C=N » d'un libellé de facture Gineys.
 *
 * Piège réel : « C=5X1KG » (5 sachets d'un kilo) et « C=6 X 500 » (6 paquets
 * de 500) ne sont PAS des colis de 5 ou 6 pièces vendables — tout « C=N »
 * suivi d'un multiplicateur est rejeté plutôt que mal compris. */
export function extraireConditionnement(description: string): number | null {
  const m = description.match(/C=(\d+)(?!\d)/)
  if (!m) return null
  const apres = description.slice((m.index ?? 0) + m[0].length)
  if (/^\s*[X×x]/.test(apres)) return null
  const n = Number(m[1])
  return n >= 2 && n <= 2000 ? n : null
}

export type Suggestion = {
  /** Pièces à commander pour couvrir la période. */
  pieces: number
  /** Colis entiers (null si conditionnement inconnu). */
  colis: number | null
  /** Pièces réellement livrées en colis entiers (null si cond. inconnu). */
  piecesLivrees: number | null
  /** Signal quand la casse dépasse 15 % des ventes : on réduit, pas on sécurise. */
  surCommande: boolean
}

/**
 * Suggestion de commande pour un produit.
 *
 * Règle : ventes/jour × jours à couvrir + 10 % de sécurité (une rupture de
 * croissants à 9 h coûte plus cher que deux croissants jetés le soir).
 * MAIS si la casse dépasse déjà 15 % des ventes, la sécurité saute : le
 * signal du terrain dit qu'on commande déjà trop — on arrondit alors au
 * colis INFÉRIEUR au lieu du supérieur.
 */
export function suggererCommande(input: {
  ventesPeriode: number       // pièces vendues sur la période observée
  cassePeriode: number        // pièces jetées sur la même période
  joursObserves: number
  joursACouvrir: number
  conditionnement: number | null
}): Suggestion {
  const jours = Math.max(1, input.joursObserves)
  const ventesJour = input.ventesPeriode / jours
  const casseJour = input.cassePeriode / jours
  const surCommande = ventesJour > 0 && casseJour > 0.15 * ventesJour

  const brut = ventesJour * input.joursACouvrir
  const pieces = Math.ceil(surCommande ? brut : brut * 1.1)

  if (input.conditionnement == null) {
    return { pieces, colis: null, piecesLivrees: null, surCommande }
  }
  const c = input.conditionnement
  const colis = surCommande
    ? Math.max(pieces > 0 ? 1 : 0, Math.floor(pieces / c))
    : Math.ceil(pieces / c)
  return { pieces, colis, piecesLivrees: colis * c, surCommande }
}

/** Rapprochement libellé facture ↔ produit — même prudence que createFacture
 * (0125) : normalisation casse/accents, noms d'au moins 4 caractères. */
export function nomsCorrespondent(libelleFacture: string, nomProduit: string): boolean {
  const norm = (x: string) =>
    x.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim()
  const a = norm(libelleFacture), b = norm(nomProduit)
  if (b.length < 4) return false
  return a.includes(b) || (a.length >= 4 && b.includes(a))
}
