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
  // ⚠️⚠️ LE WEBHOOK NE PARLE PAS COMME LE GET (relevé sur les ventes RÉELLES
  // du 12/10/2026, jour d'ouverture). `order.ended` rend un prix de ligne
  // APLATI — `amount_inc_tax`, et la TVA DANS ce même objet :
  //     "price": { "tax_rate": 550, "tax_amount": 7, "amount_inc_tax": 140 }
  // là où `GET /orders` rend `price.final_amount_inc_tax` et un objet `tax`
  // séparé. Sans ces trois champs, un ticket entrait avec des lignes à
  // ZÉRO et sans TVA — pire qu'un rejet, parce qu'un zéro ne se signale pas.
  amount_inc_tax: nombre.optional(),
  tax_rate:       nombre.optional(),
  tax_amount:     nombre.optional(),
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
  // ⚠️⚠️ LE WEBHOOK NOMME LE TOTAL `price`, PAS `total` — et `total` est tout
  // simplement ABSENT de sa charge utile. Mesuré le 12/10/2026 : 54 ventes
  // terminées, 300,10 € de CA, toutes rejetées « aucun montant total ».
  // Vérifié avant d'y toucher : `price` concorde AU CENTIME avec la somme des
  // lignes sur les 58 tickets qui en portent. `total` reste prioritaire —
  // sur GET c'est lui qui fait foi.
  price:       nombre.optional(),

  created_at:  z.string().optional(),
  closed_at:   z.string().optional(),
  due_date:    z.string().optional(),

  // ⚠️⚠️ C'EST CE QUI FAISAIT REJETER CHAQUE TICKET. La doc décrit `mode` et
  // `source` comme des chaînes ; le webhook envoie des ENTIERS (`mode: 1`,
  // `source: 1`). Un `z.string()` strict fait alors LEVER zod sur la commande
  // ENTIÈRE — « format inattendu : Invalid input » — et pas seulement ignorer
  // le champ : tous les autres étaient pourtant `.optional()`, donc c'est
  // bien la rigidité de ces deux-là qui perdait la vente.
  /** eat_in | takeaway | delivery — décide du taux de TVA côté français. */
  mode:        texte.optional(),
  /** web | mobile | kiosk | pos | remote_pos | ubereats | … */
  source:      texte.optional(),
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
