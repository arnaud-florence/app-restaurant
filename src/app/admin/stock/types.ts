import type { Ingredient } from '../ingredients/types'

/**
 * UN PRODUIT REVENDU, AFFICHÉ DANS LE TABLEAU DE STOCK.
 *
 * En achat-revente (0126) l'essentiel de la réserve est dans `recettes`, pas
 * dans `ingredients` : les bouteilles, les fûts et les canettes du bar se
 * vendent tels quels. Le tableau du module 7 n'en montrait aucun — 9 lignes
 * sur 45 au 04/10/2026.
 *
 * On lui donne la forme d'un `Ingredient` pour que la recherche, les filtres
 * et les totaux de l'écran marchent sans réécriture, et on marque la
 * différence qui compte : `produit` interdit les trois gestes d'écriture du
 * module 7, qui visent `mouvements_stock.ingredient_id`.
 */
export type ProduitEnStock = Ingredient & {
  produit: true
  /** Où ce produit se compte vraiment — `(ops)/inventaire?poste=…`. */
  poste: 'bar' | 'fournil'
}

/**
 * D'OÙ VIENT LE CHIFFRE DE STOCK, ligne par ligne.
 *
 * ⚠️ « Un stock qu'on ne sait pas décomposer n'est pas vérifiable, et c'est la
 * première chose qu'on conteste quand il paraît faux » (0163). Le tenu est un
 * CALCUL — comptage + livraisons enregistrées depuis — et ces deux termes
 * étaient affichés par la carte retirée le 04/10/2026. Ils vivent donc
 * maintenant sur la ligne elle-même.
 */
export type Origine = {
  /** Le comptage seul, avant les entrées. */
  compte: number | null
  /** Ce qui est entré depuis (livraisons ; un avoir compte en négatif). */
  entrees: number
  /** Date du comptage qui fait foi — un comptage vieux ne décrit plus rien. */
  compte_le: string | null
  /**
   * L'ÉTAGE DE LA MAISON — Bar, Fournil, Restauration, Matières premières.
   *
   * ⚠️ C'est la seule ventilation du stock qui porte du sens et qui VARIE :
   * les trois indicateurs « Stock OK / faible / épuisés » étaient constants
   * (46 verts sur 46, parce que les seuils sont tous à zéro), donc ils
   * n'apprenaient rien et occupaient trois cases sur cinq.
   */
  poste: string
}
