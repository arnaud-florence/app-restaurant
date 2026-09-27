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
  /** ⚠️ Le prix vient d'une ESTIMATION, pas d'une facture ni d'un relevé. */
  estime?: boolean
  /**
   * D'OÙ VIENT LE NOM DU FOURNISSEUR. Un bon parti chez le mauvais
   * interlocuteur se découvre à la livraison : il faut pouvoir dire si
   * c'est une preuve (une facture payée) ou un simple rapprochement.
   */
  source_fournisseur?: 'facture' | 'reference' | 'fiche' | null
  /** Identifiant du fournisseur, pour grouper un bon de commande. */
  fournisseur_id?: string | null
  /** L'ingrédient ou le produit visé — la clé du lien avec le catalogue. */
  cible_id?: string | null
  /**
   * ⚠️ Le moins cher AILLEURS, quand le catalogue le dit ET que les unités
   * concordent. Calculé par `comparer()`, jamais par un min/max brut :
   * opposer un colis à une pièce annonce « −97 % » sur des serviettes.
   */
  ailleurs?: { fournisseur_id: string; fournisseur: string; ecartPct: number } | null
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

/**
 * ⚠️ CE QUI NE SE STOCKE PAS.
 *
 * Un plat ASSEMBLÉ n'a pas de stock : on stocke ses composants. Le
 * congélateur contient des pâtons, pas « La Marguerite » ; la cave
 * contient du cassis et du blanc, pas des kirs.
 *
 * Les compter ferait commander DEUX FOIS la même marchandise — une fois
 * sous le nom du plat, une fois sous celui de l'ingrédient — et le
 * doublon ne se verrait nulle part : les deux lignes ont l'air normales.
 *
 * `Sandwich / Panini / Salade / Formule` étaient déjà exclues (0133).
 * Les six autres sont les familles de la brasserie et de la pizzeria,
 * créées après — elles avaient donc échappé à la règle, et les 30 plats
 * à fiche technique figuraient au réassort pendant que leurs 52
 * ingrédients, eux, en étaient absents. Exactement l'inverse.
 */
export const CATEGORIES_ASSEMBLEES = new Set([
  'Sandwich', 'Panini', 'Salade', 'Formule',
  'Pizzeria', 'Burger', 'Plat', 'Planche', 'Grande salade', 'Menu',
  // ⚠️ Catégorie DISTINCTE de « Formule », et c'est par là que quatre
  // formules du matin (Express, Tartine, Douceur chaude, Petit-déjeuner
  // complet) passaient au travers : un lot n'a pas de stock, ses
  // composants en ont un.
  'Formule petit-déjeuner',
])

export function estStockable(p: {
  nom: string
  categorie: string | null
  tag_destination?: string | null
  nom_matiere?: string | null
}): boolean {
  if (p.categorie && CATEGORIES_ASSEMBLEES.has(p.categorie)) return false
  if (p.nom.startsWith('Formule —')) return false
  // ⚠️ Au bar, un produit sans `nom_matiere` MÉLANGE deux matières (Kir,
  // Spritz, Panaché, Pichet…) : le rattacher à une seule perdrait l'autre,
  // qui sortirait du stock sans que rien ne le signale. Même règle que
  // `(ops)/inventaire`.
  if (p.tag_destination === 'BAR' && !p.nom_matiere) return false
  return true
}

/**
 * La clé de regroupement : on COMPTE et on COMMANDE la matière achetée,
 * pas le produit vendu.
 *
 * ⚠️ Sans regroupement, « Demi pression » et « Pinte pression » font DEUX
 * lignes portant toutes deux le nom « Fût Moretti 20 L » — deux cibles,
 * et le fût commandé deux fois.
 */
export function cleMatiere(p: {
  nom: string
  nom_matiere?: string | null
  libelle_achat?: string | null
}): string {
  return p.nom_matiere ?? p.libelle_achat ?? p.nom
}

/**
 * ⚠️ `ingredients.fournisseur_principal` EST UN CHAMP LIBRE.
 *
 * Il porte tantôt un fournisseur (« Gineys »), tantôt une note de méthode
 * (« ESTIMATION 21/09/2026 — à remplacer par la première facture »,
 * « Gineys — colis de 36 à 25,12 € ramené à la pièce »), tantôt un nom du
 * jeu de démonstration purgé en septembre (Metro, Sysco, Transgourmet…).
 *
 * Lu tel quel, « ESTIMATION 21/09/2026 » apparaissait comme le PREMIER
 * fournisseur de la commande d'ouverture, pour 875 € — c'est-à-dire un
 * destinataire à qui on ne peut rien envoyer, en tête de l'écran qui sert
 * à commander.
 */
const FOURNISSEURS_DEMO = new Set([
  'Metro France', 'Sysco France', 'Brake France', 'Transgourmet',
  'Pomona TerreAzur', 'Ferme du Plateau', 'Boucherie Bio', 'Boulangerie Coop',
  'Maraîcher du coin', 'Marée fraîche', 'Domaine Provence', 'Crémerie Local',
  'Épicerie fine', 'Gynes',
])

export function lireFournisseur(brut: string | null | undefined): {
  nom: string | null
  /** Le prix n'est pas relevé : il a été estimé pour bâtir la carte. */
  estime: boolean
} {
  if (!brut) return { nom: null, estime: false }
  // ⚠️ Une ESTIMATION n'a pas de fournisseur, et le total qu'elle alimente
  // doit s'annoncer à part : c'est sur ce total qu'on engage la trésorerie.
  if (/^ESTIMATION/i.test(brut)) return { nom: null, estime: true }
  const nom = brut.split(' — ')[0].trim()
  if (FOURNISSEURS_DEMO.has(nom)) return { nom: null, estime: false }
  return { nom, estime: false }
}

/**
 * Regroupement par ÉTABLISSEMENT — le Fournil, le bar, la restauration.
 *
 * On ne commande pas au même moment, ni chez les mêmes gens, ni pour les
 * mêmes cartes. Mélanger les trois rallonge une liste qu'on parcourt
 * debout, et une liste qu'on abrège est une liste fausse (même règle que
 * `(ops)/inventaire?poste=`).
 */
export function parEtablissement(lignes: LigneReassort[]): Array<{
  etablissement: string | null; lignes: LigneReassort[]; aCommander: number; cout: number
}> {
  const m = new Map<string, LigneReassort[]>()
  for (const l of lignes) {
    const k = l.etablissement ?? '\u0000'
    if (!m.has(k)) m.set(k, [])
    m.get(k)!.push(l)
  }
  return [...m.entries()]
    .map(([k, ls]) => ({
      etablissement: k === '\u0000' ? null : k,
      lignes: ls,
      aCommander: ls.filter(l => etat(l) === 'a_commander').length,
      cout: ls.reduce((a, l) => a + (coutReassort(l) ?? 0), 0),
    }))
    // ⚠️ « Non rattaché » en DERNIER, jamais masqué : ce sont les lignes
    // qu'on oublierait, et un produit sans point de vente sort aussi de la
    // ventilation par activité — le signaler ici le rend réparable.
    .sort((a, b) => (a.etablissement === null ? 1 : b.etablissement === null ? -1 : b.cout - a.cout))
}

/**
 * CHEZ QUI CETTE LIGNE PART — règle du gérant : ON COMMANDE AU MOINS CHER.
 *
 * ⚠️ Mais seulement quand la comparaison TIENT. `ailleurs` n'est posé que
 * sur un groupe rendu comparable par `comparer()` : deux fournisseurs
 * distincts, des unités ramenées à la même base, un écart d'au moins 10 %.
 * Là où la comparaison n'existe pas, il n'y a pas de « moins cher » à
 * choisir — on garde celui chez qui on achète, faute de mieux, et ce n'est
 * pas un arbitrage, c'est une absence d'information.
 */
export function fournisseurRetenu(
  l: LigneReassort,
  auMoinsCher: boolean,
): { id: string; nom: string; bascule: boolean } | null {
  if (auMoinsCher && l.ailleurs && l.ailleurs.fournisseur_id !== l.fournisseur_id) {
    return { id: l.ailleurs.fournisseur_id, nom: l.ailleurs.fournisseur, bascule: true }
  }
  if (!l.fournisseur_id || !l.fournisseur) return null
  return { id: l.fournisseur_id, nom: l.fournisseur, bascule: false }
}

/**
 * Ce qu'il faut commander, prêt à devenir des bons de commande.
 *
 * ⚠️ Une ligne SANS FOURNISSEUR CONNU est écartée et COMPTÉE à part : on
 * ne peut pas écrire un bon à personne. La taire ferait croire la commande
 * complète alors qu'il en manque un morceau.
 *
 * ⚠️⚠️ QUAND ON BASCULE CHEZ LE MOINS CHER, LE PRIX DEVIENT INCONNU.
 * Notre coût est celui de NOTRE unité d'achat ; le prix du concurrent est
 * celui de SON conditionnement. Les convertir de tête écrirait un faux
 * prix sur un document qui engage de l'argent — et un faux prix ne se
 * signale pas, il se découvre à la facture. `prix_unitaire_ht` passe donc
 * à NULL, jamais à zéro, et le bon annonce combien de lignes sont dans ce
 * cas : c'est au fournisseur de confirmer son tarif, ce qu'il fait de
 * toute façon sur une première commande.
 */
export function lignesCommandables(lignes: LigneReassort[], auMoinsCher = false): {
  prets: Array<LigneReassort & {
    quantite: number
    retenu: { id: string; nom: string; bascule: boolean }
    prix: number | null
  }>
  sansFournisseur: LigneReassort[]
  /** Lignes qui changent de fournisseur, et l'écart annoncé par le catalogue. */
  bascules: Array<{ nom: string; de: string | null; vers: string; ecartPct: number }>
} {
  const prets: Array<LigneReassort & {
    quantite: number
    retenu: { id: string; nom: string; bascule: boolean }
    prix: number | null
  }> = []
  const sansFournisseur: LigneReassort[] = []
  const bascules: Array<{ nom: string; de: string | null; vers: string; ecartPct: number }> = []

  for (const l of lignes) {
    const q = aCommander(l)
    if (q <= 0) continue
    const retenu = fournisseurRetenu(l, auMoinsCher)
    if (!retenu) { sansFournisseur.push(l); continue }
    if (retenu.bascule && l.ailleurs) {
      bascules.push({ nom: l.nom, de: l.fournisseur, vers: retenu.nom, ecartPct: l.ailleurs.ecartPct })
    }
    prets.push({ ...l, quantite: q, retenu, prix: retenu.bascule ? null : l.cout_unitaire_ht })
  }
  return { prets, sansFournisseur, bascules }
}

/**
 * Ce que la bascule fait GAGNER, d'après les tarifs comparés.
 *
 * ⚠️ C'est une ESTIMATION issue du catalogue, pas un prix négocié : elle
 * se présente comme telle. Un écart en pourcentage ne décide de rien tant
 * qu'il n'est pas multiplié par les quantités réelles — c'est ce que fait
 * ce calcul, et c'est pour ça qu'il vaut mieux que le pourcentage seul.
 */
export function economieEstimee(
  prets: Array<{ quantite: number; cout_unitaire_ht: number | null; retenu: { bascule: boolean }; ailleurs?: LigneReassort['ailleurs'] }>,
): number {
  let t = 0
  for (const l of prets) {
    if (!l.retenu.bascule || l.cout_unitaire_ht == null || !l.ailleurs) continue
    t += l.quantite * l.cout_unitaire_ht * (l.ailleurs.ecartPct / 100)
  }
  return Math.round(t * 100) / 100
}
