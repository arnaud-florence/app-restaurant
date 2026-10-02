import { extraireConditionnement } from '@/lib/commande-fournisseur'

/**
 * LES ENTRÉES DE STOCK — une seule implémentation, deux lecteurs.
 *
 * `(ops)/inventaire` et `chargerLignesReassort()` (donc `/admin/reassort`,
 * `/admin/stock` et l'agent Stock) calculaient chacun leur copie. Elles
 * étaient identiques ; rien ne les tenait ensemble, et le jour où l'une aurait
 * bougé deux écrans auraient donné deux stocks.
 */
export type DocEntree = {
  description: string
  quantite: number | string | null
  unite: string | null
  facture: { date_emission?: string; type_document?: string; facture_liee_id?: string | null } | null
}

const norm = (x: string) => x.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim()

/**
 * ⚠️⚠️ LE LIBELLÉ LE PLUS LONG GAGNE, ET UN SEUL GAGNE.
 *
 * Le rapprochement cherche le libellé du fournisseur DANS la description de
 * la ligne. Avec un simple « contient », un libellé court capte les lignes
 * des longs : « Orange » prend « Fanta Orange IVC 25cl », « Pomme » prend
 * « CHAUSSON AU POMME CRU ». Les 96 Fanta livrés le 01/10 entraient dans
 * TROIS stocks à la fois — sans qu'aucune erreur ne le signale, et c'est
 * l'écran qui déclenche les commandes qui lisait le résultat.
 *
 * Une ligne de livraison décrit UNE marchandise : elle ne peut alimenter
 * qu'une cible, et c'est la plus précise qui la décrit.
 */
export function calculerEntrees(
  docs: DocEntree[],
  cibles: Array<{ cle: string; libelle: string }>,
  depuis: string | null,
): Map<string, number> {
  const entrees = new Map<string, number>()
  // ⚠️ Pas de comptage, pas d'entrées : une livraison seule dit un mouvement,
  // pas un stock. « Jamais compté » doit le rester (0163).
  if (!depuis) return entrees
  const prepa = cibles
    .map(c => ({ ...c, n: norm(c.libelle) }))
    .filter(c => c.n.length >= 4)
    .sort((a, b) => b.n.length - a.n.length)   // le plus long d'abord

  for (const l of docs) {
    const f = l.facture
    if (!f?.date_emission || f.date_emission <= depuis) continue
    // ⚠️ PAS DE DOUBLE COMPTAGE (0166) : le BL dit ce qui est ARRIVÉ, la
    // facture ce qu'on DOIT. Une facture rattachée à son BL n'ajoute rien.
    if (f.type_document === 'facture' && f.facture_liee_id) continue
    const d = norm(l.description)
    const gagnant = prepa.find(c => d.includes(c.n))
    if (!gagnant) continue
    const q = Number(l.quantite ?? 0)
    const cond = extraireConditionnement(l.description)
    const estPiece = /^(pce|pi[eè]ce|piece|p|u)s?$/.test(String(l.unite ?? '').toLowerCase())
    // Une ligne au colis se multiplie par son conditionnement pour retrouver
    // des pièces ; un avoir est de la marchandise RENDUE, donc négatif.
    const recu = (f.type_document === 'avoir' ? -1 : 1) * (estPiece || cond == null ? q : q * cond)
    entrees.set(gagnant.cle, Math.round(((entrees.get(gagnant.cle) ?? 0) + recu) * 100) / 100)
  }
  return entrees
}
