// Format d'une commande Zelty — d'après la documentation officielle
// https://docs.zelty.fr (API 2.11), lue le 28/08/2026.
//
// Ce qui compte, et qui n'était pas devinable :
//
//   · les MONTANTS sont des ENTIERS, en centimes. `total: 555` = 5,55 € ;
//   · le détail des lignes n'arrive QUE si on demande `expand[]=items` —
//     sans lui, `items` est un tableau vide. C'est ce qui a fait croire en
//     démo que l'API ne rendait pas le détail ;
//   · le prix d'une ligne est un OBJET (`price.final_amount_inc_tax`), pas un
//     nombre, et la TVA aussi (`tax.tax_rate`, `tax.tax_amount`) ;
//   · le mode de paiement vient de `transactions[].name`, et exige
//     `expand[]=transactions&expand[]=transactions.method`.
//
// Les alias tolérés en second rang ne coûtent rien et protègent d'un
// changement de version.
//
// Client + server safe (aucun accès base, aucun réseau).

import { z } from 'zod'

const nombre = z.union([z.number(), z.string()]).transform(v => {
  const n = typeof v === 'number' ? v : Number(String(v).replace(',', '.'))
  return Number.isFinite(n) ? n : NaN
}).refine(n => Number.isFinite(n), 'nombre illisible')

const texte = z.union([z.string(), z.number()]).transform(v => String(v))

/** Prix d'une ligne. Tous les montants sont en centimes. */
const prixLigneSchema = z.object({
  final_amount_inc_tax:      nombre.optional(),
  discounted_amount_inc_tax: nombre.optional(),
  original_amount_inc_tax:   nombre.optional(),
  base_original_amount_inc_tax: nombre.optional(),
}).passthrough()

const taxeLigneSchema = z.object({
  tax_amount: nombre.optional(),
  tax_rate:   nombre.optional(),
}).passthrough()

/** Une ligne de commande — `OrderEntryGet`. */
export const ligneZeltySchema = z.object({
  /** Identifiant STABLE du produit côté Zelty. Alimente les correspondances (0137). */
  item_id:   texte.optional(),
  name:      z.string().optional(),
  type:      z.string().optional(),   // dish | menu
  price:     prixLigneSchema.optional(),
  tax:       taxeLigneSchema.optional(),
  /** ⚠️ Non documenté sur GET (présent sur POST). Lu s'il existe, 1 sinon. */
  qty:       nombre.optional(),
  quantity:  nombre.optional(),
  // Alias de repli
  product_id: texte.optional(),
  label:      z.string().optional(),
}).passthrough()

/** Un règlement — `Transaction`. `price` est documenté en chaîne. */
export const transactionZeltySchema = z.object({
  name:   z.string().optional(),
  price:  nombre.optional(),
  id_transaction_method: nombre.optional(),
}).passthrough()

export const commandeZeltySchema = z.object({
  id:          texte.optional(),
  remote_id:   texte.optional(),
  display_id:  texte.optional(),
  ref:         texte.optional(),

  /** Total TTC en centimes. */
  total:       nombre.optional(),

  created_at:  z.string().optional(),
  closed_at:   z.string().optional(),
  due_date:    z.string().optional(),

  /** eat_in | takeaway | delivery — décide du taux de TVA côté français. */
  mode:        z.string().optional(),
  /** web | mobile | kiosk | pos | remote_pos | ubereats | … */
  source:      z.string().optional(),
  /** L'exemple officiel montre « opened » (chaîne). Voir mapper.ts. */
  status:      z.union([z.string(), z.number()]).optional(),

  // ⚠️ Deux noms pour la même chose selon la porte d'entrée : `GET /orders`
  // rend `items`, le WEBHOOK `order.ended` rend `contents`. Confirmé sur la
  // spec OpenAPI de la doc (28/08/2026), où `contents` est même REQUIS.
  // Ne lire que `items` ferait entrer chaque ticket web sans une seule ligne —
  // CA juste, stock et marges aveugles, et aucune erreur pour le dire.
  items:        z.array(ligneZeltySchema).optional(),
  contents:     z.array(ligneZeltySchema).optional(),
  transactions: z.array(transactionZeltySchema).optional(),

  table:       nombre.optional(),
  seats:       nombre.optional(),
  first_name:  z.string().optional(),
  id_restaurant: nombre.optional(),
}).passthrough()

export type CommandeZelty = z.infer<typeof commandeZeltySchema>
export type LigneZelty = z.infer<typeof ligneZeltySchema>

/** Premier alias renseigné, sinon `undefined`. */
export function premier<T>(...valeurs: Array<T | undefined | null>): T | undefined {
  for (const v of valeurs) if (v !== undefined && v !== null && v !== '') return v
  return undefined
}
