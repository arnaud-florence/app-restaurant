// Le réassort : ce qu'on a, ce qu'il faut avoir, ce qu'il faut commander.
//
// Le chaînon entre trois choses qui ne se parlaient pas — l'inventaire
// (ce qu'on a compté), les paramètres de stock (ce qu'il faut avoir,
// 0163) et la plateforme d'achat (chez qui, à quel prix).
//
// Règles PURES : aucun réseau, aucune base.

export type EtatReassort =
  /** Sous le seuil, ou à zéro : il faut commander. */
  | 'a_commander'
  /** Au-dessus du seuil mais sous la cible : on peut attendre. */
  | 'suffisant'
  /** À la cible ou au-dessus. */
  | 'complet'
  /** ⚠️ Aucune cible définie : on ne sait pas quoi commander. */
  | 'non_parametre'

export type LigneReassort = {
  /** `recette_id` ou `ingredient_id`, préfixé `ing:` pour une matière. */
  cle: string
  nom: string
  categorie: string | null
  /** L'étage de la carte. */
  etablissement: string | null
  unite: string | null
  /** Ce qu'on tient. NULL = jamais compté — différent de zéro. */
  tenu: number | null
  /** Date du comptage qui fait foi. */
  compte_le: string | null
  seuil: number | null
  cible: number | null
  /** Prix de l'unité commandée, quand on le connaît. */
  cout_unitaire_ht: number | null
  fournisseur: string | null
}

/**
 * ⚠️ « JAMAIS COMPTÉ » N'EST PAS « ZÉRO ».
 *
 * Un produit sans comptage et un produit compté à zéro appellent la même
 * commande, mais ne disent pas la même chose : le premier veut dire que
 * personne n'a regardé. Les confondre ferait croire l'inventaire fait.
 * `tenu === null` est donc conservé jusqu'à l'affichage.
 */
export function tenuEffectif(l: Pick<LigneReassort, 'tenu'>): number {
  return l.tenu ?? 0
}

/**
 * ⚠️ UN COMPTAGE VIEUX N'EST PAS UN STOCK.
 *
 * Le dernier comptage du Fournil date du 24/08/2026 et la maison a fermé
 * depuis : ces chiffres ne décrivent plus rien. Les afficher comme stock
 * ferait commander un complément là où il faut tout reconstituer.
 *
 * Trente jours : au-delà, on a forcément consommé, jeté ou reçu sans le
 * dire. Le comptage reste affiché — avec sa date — mais il est signalé.
 */
export const PEREMPTION_COMPTAGE_JOURS = 30

export function comptagePerime(l: Pick<LigneReassort, 'compte_le'>, aujourdhui = new Date()): boolean {
  if (!l.compte_le) return false
  const j = (aujourdhui.getTime() - new Date(l.compte_le + 'T00:00:00Z').getTime()) / 86_400_000
  return j > PEREMPTION_COMPTAGE_JOURS
}

/**
 * Le stock est-il à reconstituer entièrement ? Vrai quand AUCUNE référence
 * n'a de comptage récent — le cas d'une réouverture.
 */
export function stockAReconstituer(lignes: LigneReassort[], aujourdhui = new Date()): boolean {
  return lignes.length > 0 && lignes.every(l => l.tenu === null || comptagePerime(l, aujourdhui))
}

export function etat(l: LigneReassort): EtatReassort {
  if (l.cible == null) return 'non_parametre'
  const t = tenuEffectif(l)
  if (l.seuil != null && t <= l.seuil) return 'a_commander'
  if (t <= 0) return 'a_commander'
  if (t >= l.cible) return 'complet'
  return 'suffisant'
}

/**
 * Combien commander pour revenir à la cible.
 *
 * ⚠️ Rend 0 quand la cible n'est pas définie — JAMAIS une quantité
 * devinée. Un écran qui propose un nombre sorti de nulle part se fait
 * valider par habitude, et on le découvre à la livraison.
 */
export function aCommander(l: LigneReassort): number {
  if (l.cible == null) return 0
  const manque = l.cible - tenuEffectif(l)
  return manque > 0 ? Math.round(manque * 1000) / 1000 : 0
}

/** Ce que coûterait la remise à niveau. NULL si le prix est inconnu. */
export function coutReassort(l: LigneReassort): number | null {
  const q = aCommander(l)
  if (!q || l.cout_unitaire_ht == null) return null
  return Math.round(q * l.cout_unitaire_ht * 100) / 100
}

export type Bilan = {
  lignes: number
  aCommander: number
  nonParametres: number
  jamaisComptes: number
  /** Total chiffrable, et combien de lignes ne le sont pas. */
  coutTotal: number
  sansPrix: number
}

export function bilan(lignes: LigneReassort[]): Bilan {
  let aCmd = 0, nonP = 0, jamais = 0, cout = 0, sansPrix = 0
  for (const l of lignes) {
    const e = etat(l)
    if (e === 'a_commander') aCmd++
    if (e === 'non_parametre') nonP++
    if (l.tenu === null) jamais++
    const q = aCommander(l)
    if (q > 0) {
      const c = coutReassort(l)
      // ⚠️ Un prix inconnu est COMPTÉ À PART, jamais pour zéro : un total
      // annoncé qui saute des lignes devient une mauvaise surprise à la
      // facture.
      if (c == null) sansPrix++
      else cout += c
    }
  }
  return {
    lignes: lignes.length, aCommander: aCmd, nonParametres: nonP,
    jamaisComptes: jamais, coutTotal: Math.round(cout * 100) / 100, sansPrix,
  }
}

/** Regroupement par catégorie, le plus urgent d'abord. */
export function parCategorie(lignes: LigneReassort[]): Array<{
  categorie: string; lignes: LigneReassort[]; aCommander: number; cout: number
}> {
  const m = new Map<string, LigneReassort[]>()
  for (const l of lignes) {
    const k = l.categorie ?? 'Sans catégorie'
    if (!m.has(k)) m.set(k, [])
    m.get(k)!.push(l)
  }
  return [...m].map(([categorie, ls]) => ({
    categorie,
    lignes: ls.sort((a, b) => a.nom.localeCompare(b.nom, 'fr')),
    aCommander: ls.filter(l => etat(l) === 'a_commander').length,
    cout: ls.reduce((a, l) => a + (coutReassort(l) ?? 0), 0),
  })).sort((a, b) => b.aCommander - a.aCommander || a.categorie.localeCompare(b.categorie, 'fr'))
}

/** Ce qu'il faut commander, groupé par fournisseur — la sortie utile. */
export function parFournisseur(lignes: LigneReassort[]): Array<{
  fournisseur: string | null; lignes: LigneReassort[]; cout: number; sansPrix: number
}> {
  const m = new Map<string | null, LigneReassort[]>()
  for (const l of lignes) {
    if (aCommander(l) <= 0) continue
    const k = l.fournisseur ?? null
    if (!m.has(k)) m.set(k, [])
    m.get(k)!.push(l)
  }
  return [...m].map(([fournisseur, ls]) => ({
    fournisseur,
    lignes: ls.sort((a, b) => a.nom.localeCompare(b.nom, 'fr')),
    cout: Math.round(ls.reduce((a, l) => a + (coutReassort(l) ?? 0), 0) * 100) / 100,
    sansPrix: ls.filter(l => coutReassort(l) === null).length,
  // ⚠️ Les lignes sans fournisseur en DERNIER, et jamais masquées : ce sont
  // celles qu'on oublierait de commander.
  })).sort((a, b) => (a.fournisseur === null ? 1 : 0) - (b.fournisseur === null ? 1 : 0) || b.cout - a.cout)
}
