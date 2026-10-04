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
