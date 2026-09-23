// Comparer les tarifs de deux fournisseurs sans se tromper de gagnant.
//
// Tout le raisonnement de cet écran tient en une phrase : on ne compare que
// ce qui est comparable. Trois pièges, et les trois donnent un classement
// faux sans la moindre erreur visible.
//
//   1. LE COLIS.  Un bidon d'huile de 5 L à 24,66 € contre un litre à
//      4,93 € : côte à côte en prix de colis, le premier paraît cinq fois
//      plus cher. On ramène donc tout à l'unité.
//
//   2. LE FORMAT. Une poche de thon de 600 g à 4,36 € contre une poche d'un
//      kilo à 7,98 € : au prix de la poche, Félix Potin gagne ; au kilo,
//      7,27 € contre 7,98 €, il gagne toujours — mais l'écart n'est plus le
//      même, et sur d'autres lignes le classement S'INVERSE. Sans la
//      contenance, on ne sait pas.
//
//   3. LE LIBELLÉ. « JAMBON CUIT SUP AC 8K » et « Jambon blanc tranché » ne
//      sont pas le même produit : l'un est une pièce entière à trancher,
//      l'autre est déjà tranché. Aucun algorithme ne peut trancher ça — il
//      le croira, et désignera un moins-disant qui n'existe pas.
//
// D'où la règle du fichier : le prix de référence se CALCULE à la lecture
// (une meilleure extraction profite à tout le catalogue sans réimport), et
// le rapprochement entre fournisseurs s'ENREGISTRE (c'est une décision).

export type UniteRef = 'kg' | 'L' | 'piece'

export type LigneTarif = {
  id: string
  fournisseur_id: string
  fournisseur_nom?: string
  reference: string | null
  designation: string
  famille: string | null
  unite: string
  prix_ht: number
  colis_quantite: number | null
  colis_libelle: string | null
  contenance_valeur: number | null
  contenance_unite: UniteRef | null
  cle_comparaison: string | null
  ingredient_id: string | null
  recette_id?: string | null
  date_tarif: string
  source: string | null
  /**
   * D'où vient ce prix. `devis` = PROPOSÉ, il peut ne jamais se réaliser et
   * peut être un tarif d'appel. `facture` = PAYÉ, c'est une preuve. Les deux
   * se comparent, mais le lecteur doit savoir lequel il regarde.
   */
  nature: 'devis' | 'facture'
}

/** Unités de facturation qui SONT déjà une unité de référence. */
const UNITES_REF: Record<string, UniteRef> = {
  KG: 'kg', kg: 'kg', KILO: 'kg',
  L: 'L', l: 'L', LITRE: 'L', litre: 'L',
  PI: 'piece', PIECE: 'piece', piece: 'piece', 'pièce': 'piece',
}

/** Conditionnements : une unité facturée = un contenant, pas un poids. */
const CONTENANTS = new Set(['BA', 'SA', 'BT', 'SO', 'CO', 'PO', 'CT', 'BQ'])

const norm = (s: string) =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase()

/**
 * Contenance d'UNE unité facturée, lue dans la désignation.
 *
 * Rend `null` dès que c'est ambigu — et c'est le comportement voulu.
 * « RACLETTE TR 22G 400G » porte deux poids : celui de la tranche et celui
 * de la barquette. Choisir au hasard donnerait un prix au kilo faux d'un
 * facteur vingt, affiché comme les autres, sans rien pour le signaler.
 *
 * ⚠️ L'UNITÉ DE FACTURATION change le sens du multiplicateur, et s'en passer
 * fabrique un prix faux en silence. « FEUILLETE COMTE 110GX40 » facturé à la
 * PIÈCE : chaque feuilleté fait 110 g, le ×40 est le colis. « PAIN BURGER
 * BRIOCHE 90GX9 » facturé au SACHET : le sachet contient les 9 pains, donc
 * 810 g. Prendre 90 g dans le second cas donnait 64 €/kg pour du pain à
 * burger — neuf fois trop, affiché comme les autres.
 *
 * Et quand le contenant porte un multiplicateur, on ne peut pas trancher :
 * « ROSETTE LYON 2X25TR 500G X8 » est une barquette de 500 g vendue par 8,
 * « PAIN BURGER 90GX9 » un sachet de 9 × 90 g. Même forme, sens opposé. On
 * se tait, et l'écran demande la contenance.
 */
export function extraireContenance(
  designation: string,
  unite?: string,
): { valeur: number; unite: UniteRef } | null {
  const d = norm(designation)
  const contenant = unite ? CONTENANTS.has(unite.toUpperCase()) : false

  // « 60GX12 », « 130GX30 », « 25G X175 » : poids unitaire × nombre.
  const mult = d.match(/(\d+(?:[.,]\d+)?)\s*(G|KG|ML|CL|L)\s*X\s*\d+/)
  if (mult) {
    if (contenant) return null           // ambigu : contenu ou colisage ?
    return convertir(Number(mult[1].replace(',', '.')), mult[2])
  }

  // Sinon : tous les formats présents. S'il y en a plusieurs de DIFFÉRENTS,
  // on ne tranche pas.
  const trouves: { valeur: number; unite: UniteRef }[] = []
  for (const m of d.matchAll(/(?<![A-Z0-9])(\d+(?:[.,]\d+)?)\s*(KG|G|ML|CL|L)(?![A-Z])/g)) {
    const c = convertir(Number(m[1].replace(',', '.')), m[2])
    if (c) trouves.push(c)
  }
  // « 1K033 », « 2K5 », « 1K8 » : la notation du grossiste pour 1,033 kg.
  for (const m of d.matchAll(/(?<![A-Z0-9])(\d+)K(\d*)(?![A-Z0-9])/g)) {
    const dec = m[2] ? Number(`0.${m[2]}`) : 0
    trouves.push({ valeur: Number(m[1]) + dec, unite: 'kg' })
  }
  if (trouves.length === 0) return null
  const distincts = new Set(trouves.map(t => `${t.valeur}${t.unite}`))
  if (distincts.size > 1) return null          // ambigu : on se tait
  return trouves[0]
}

function convertir(valeur: number, unite: string): { valeur: number; unite: UniteRef } | null {
  switch (unite) {
    case 'KG': return { valeur, unite: 'kg' }
    case 'G':  return { valeur: valeur / 1000, unite: 'kg' }
    case 'L':  return { valeur, unite: 'L' }
    case 'CL': return { valeur: valeur / 100, unite: 'L' }
    case 'ML': return { valeur: valeur / 1000, unite: 'L' }
    default:   return null
  }
}

/**
 * Le prix ramené au kilo, au litre ou à la pièce — la seule grandeur qui se
 * compare. `null` quand on ne sait pas : un écran qui dit « contenance à
 * préciser » vaut mieux qu'un classement inventé.
 */
export type PrixRef = {
  prix: number
  unite: UniteRef
  derive: boolean
  /**
   * Format de conserve, quand l'unité de référence est « un contenant ».
   * Il DOIT concorder pour qu'une comparaison ait un sens : une 4/4 et une
   * 5/1 sont toutes deux « une boîte », et les classer l'une contre l'autre
   * désignerait la petite comme la moins chère à tous les coups.
   */
  format?: string
}

export function prixReference(l: LigneTarif): PrixRef | null {
  // Une contenance saisie à la main l'emporte : c'est quelqu'un qui a lu
  // l'étiquette, contre un motif lu dans un libellé.
  if (l.contenance_valeur && l.contenance_unite) {
    return { prix: l.prix_ht / Number(l.contenance_valeur), unite: l.contenance_unite, derive: false }
  }
  const ref = UNITES_REF[l.unite]
  if (ref === 'kg' || ref === 'L') return { prix: l.prix_ht, unite: ref, derive: false }

  // Facturé à la pièce ou au contenant : il faut la contenance.
  if (ref === 'piece' || CONTENANTS.has(l.unite.toUpperCase())) {
    const c = extraireContenance(l.designation, l.unite)
    if (c) return { prix: l.prix_ht / c.valeur, unite: c.unite, derive: true }
    // Une boîte de conserve se compare à une boîte du MÊME format, jamais au
    // kilo : le poids net d'une 5/1 de tomates et d'une 5/1 de champignons
    // n'est pas le même, et l'inventer fausserait les deux.
    const fmt = formatConserve(l.designation)
    if (fmt) return { prix: l.prix_ht, unite: 'piece', derive: false, format: fmt }
    if (ref === 'piece') return { prix: l.prix_ht, unite: 'piece', derive: false }
  }
  return null
}

/**
 * Ce qu'ON paie, ramené à la même unité.
 *
 * Nos unités de stock disent souvent leur contenance — « barquette 1 kg »,
 * « poche 1 kg », « flacon 1 kg », « sac 750 g », « colis 36 ». Sans les
 * lire, le thon en poche de 600 g du fournisseur se retrouvait face à notre
 * « poche 1 kg » avec la mention « unités différentes » : deux prix justes,
 * aucune comparaison possible, alors que tout était là.
 */
export function prixReferenceMatiere(unite: string, prix: number): PrixRef | null {
  const u = norm(unite).trim()
  if (/^(KG|KILO|KILOS?)$/.test(u)) return { prix, unite: 'kg', derive: false }
  if (/^(L|LITRE|LITRES?)$/.test(u)) return { prix, unite: 'L', derive: false }
  if (/^(PIECE|PI|UNITE|U)$/.test(u)) return { prix, unite: 'piece', derive: false }

  const fmt = formatConserve(u)
  if (fmt) return { prix, unite: 'piece', derive: false, format: fmt }

  const c = extraireContenance(u)
  if (c) return { prix: prix / c.valeur, unite: c.unite, derive: true }

  // « colis 36 », « sac 50 », « sachet 25 » : un nombre nu = des pièces.
  const n = u.match(/^(?:COLIS|SAC|SACHET|CARTON|BOITE|LOT)\s+(\d+)$/)
  if (n) return { prix: prix / Number(n[1]), unite: 'piece', derive: true }
  return null
}

/**
 * Deux prix de référence se comparent-ils ?
 *
 * Même unité, et même format de conserve quand il y en a un. C'est la seule
 * porte : partout ailleurs dans cet écran, on préfère ne rien classer.
 */
export function memeBase(a: PrixRef | null, b: PrixRef | null): boolean {
  if (!a || !b) return false
  return a.unite === b.unite && (a.format ?? null) === (b.format ?? null)
}

/**
 * Les formats de conserve du métier — « 5/1 », « 4/4 », « 3/1 ».
 *
 * Leur poids NET varie avec le produit (une 5/1 de tomates et une 5/1 de
 * champignons ne pèsent pas pareil), donc on n'en déduit surtout pas un
 * €/kg. Mais deux boîtes 5/1 se comparent parfaitement l'une à l'autre :
 * c'est le format qui fait foi, pas un poids inventé. C'est ce qui rend
 * « Sauce pizza 5/1 » comparable d'un fournisseur à l'autre.
 */
export function formatConserve(designation: string): string | null {
  const m = norm(designation).match(/(?<![\d/])(\d{1,2}\/\d{1,2})(?![\d/])/)
  return m ? m[1] : null
}

export const fmtRef = (r: { prix: number; unite: UniteRef }) =>
  `${r.prix.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 3 })} €/${r.unite}`

/** Prix du colis — utile pour commander, jamais pour comparer. */
export function prixColis(l: LigneTarif): number | null {
  return l.colis_quantite ? l.prix_ht * Number(l.colis_quantite) : null
}

// ─── Suggestion de rapprochement ────────────────────────────────────────
//
// Elle PROPOSE, elle n'écrit rien. Même exigence que /admin/correspondances :
// on départage par la COUVERTURE des mots, pas par leur nombre — « Jambon
// cru Serrano » et « Jambon blanc tranché » partagent « jambon » avec la
// même ligne, seul le premier la couvre entièrement.

const VIDES = new Set(['DE', 'DU', 'LA', 'LE', 'LES', 'A', 'AU', 'EN', 'ET', 'SUP', 'STD'])

export function mots(s: string): string[] {
  return norm(s).split(/[^A-Z0-9]+/).filter(m => m.length >= 3 && !VIDES.has(m) && !/^\d+$/.test(m))
}

export function score(libelle: string, cible: string): number {
  const a = mots(libelle), b = mots(cible)
  if (!a.length || !b.length) return 0
  const communs = b.filter(m => a.includes(m)).length
  const couverture = communs / b.length
  return couverture * 100 + communs          // la couverture prime, le volume départage
}

export type Groupe = {
  cle: string
  lignes: (LigneTarif & { ref: PrixRef | null })[]
  meilleur: string | null       // id de la ligne la moins chère
  ecartPct: number | null       // écart entre la moins chère et la plus chère
  comparable: boolean           // toutes les lignes ramenées à la MÊME base ?
  /** Nombre de fournisseurs distincts — 1 = on compare deux de ses propres références. */
  fournisseurs: number
}

/**
 * Regroupe par `cle_comparaison` et désigne le moins cher.
 *
 * ⚠️ Un groupe dont les lignes ne tombent pas sur la même unité de référence
 * n'est PAS comparé : classer un €/kg contre un €/pièce donnerait un gagnant
 * au hasard. Le groupe reste affiché, avec la raison.
 */
export function comparer(lignes: LigneTarif[]): Groupe[] {
  const par = new Map<string, LigneTarif[]>()
  for (const l of lignes) {
    if (!l.cle_comparaison) continue
    if (!par.has(l.cle_comparaison)) par.set(l.cle_comparaison, [])
    par.get(l.cle_comparaison)!.push(l)
  }
  const groupes: Groupe[] = []
  for (const [cle, ls] of par) {
    const avecRef = ls.map(l => ({ ...l, ref: prixReference(l) }))
    // Repli légitime : aucune contenance connue, mais toutes les lignes sont
    // le MÊME format de conserve. Deux boîtes 5/1 se comparent au prix de la
    // boîte sans qu'on ait besoin d'en connaître le poids net.
    const formats = new Set(avecRef.map(l => formatConserve(l.designation)))
    if (avecRef.every(l => !l.ref) && formats.size === 1 && !formats.has(null)) {
      for (const l of avecRef) l.ref = { prix: l.prix_ht, unite: 'piece', derive: false }
    }
    const chiffrees = avecRef.filter(l => l.ref)
    const bases = new Set(avecRef.map(l => l.ref ? `${l.ref.unite}|${l.ref.format ?? ''}` : null).filter(Boolean))
    const comparable = bases.size === 1 && chiffrees.length === avecRef.length && avecRef.length > 1
    let meilleur: string | null = null, ecartPct: number | null = null
    if (comparable) {
      const tri = [...chiffrees].sort((a, b) => a.ref!.prix - b.ref!.prix)
      meilleur = tri[0].id
      const bas = tri[0].ref!.prix, haut = tri[tri.length - 1].ref!.prix
      ecartPct = bas > 0 ? ((haut - bas) / bas) * 100 : null
    }
    // ⚠️ Un groupe d'UNE SEULE ligne n'est pas une comparaison, c'est une
    // entrée de catalogue. Les laisser noyait les quinze vrais face-à-face
    // sous quatre-vingt-dix lignes sans rien en face — et un écran illisible
    // n'est pas consulté.
    if (avecRef.length < 2) continue
    groupes.push({ cle, lignes: avecRef, meilleur, ecartPct, comparable,
      fournisseurs: new Set(avecRef.map(l => l.fournisseur_id)).size })
  }
  // Les duels entre fournisseurs d'abord, puis le plus gros écart : c'est
  // là qu'il y a de l'argent à aller chercher.
  return groupes.sort((a, b) =>
    (b.fournisseurs - a.fournisseurs) || ((b.ecartPct ?? -1) - (a.ecartPct ?? -1)))
}
