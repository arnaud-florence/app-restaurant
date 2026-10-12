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
  final_amount_inc_tax:      nombre.nullish(),
  discounted_amount_inc_tax: nombre.nullish(),
  original_amount_inc_tax:   nombre.nullish(),
  base_original_amount_inc_tax: nombre.nullish(),
  // ⚠️⚠️ LE WEBHOOK NE PARLE PAS COMME LE GET (relevé sur les ventes RÉELLES
  // du 12/10/2026, jour d'ouverture). `order.ended` rend un prix de ligne
  // APLATI — `amount_inc_tax`, et la TVA DANS ce même objet :
  //     "price": { "tax_rate": 550, "tax_amount": 7, "amount_inc_tax": 140 }
  // là où `GET /orders` rend `price.final_amount_inc_tax` et un objet `tax`
  // séparé. Sans ces trois champs, un ticket entrait avec des lignes à
  // ZÉRO et sans TVA — pire qu'un rejet, parce qu'un zéro ne se signale pas.
  amount_inc_tax: nombre.nullish(),
  tax_rate:       nombre.nullish(),
  tax_amount:     nombre.nullish(),
}).passthrough()

const taxeLigneSchema = z.object({
  tax_amount: nombre.nullish(),
  tax_rate:   nombre.nullish(),
}).passthrough()

/** Une ligne de commande — `OrderEntryGet`. */
export const ligneZeltySchema = z.object({
  /** Identifiant STABLE du produit côté Zelty. Alimente les correspondances (0137). */
  item_id:   texte.nullish(),
  name:      z.string().nullish(),
  type:      z.string().nullish(),   // dish | menu
  price:     prixLigneSchema.nullish(),
  tax:       taxeLigneSchema.nullish(),
  /** ⚠️ Non documenté sur GET (présent sur POST). Lu s'il existe, 1 sinon. */
  qty:       nombre.nullish(),
  quantity:  nombre.nullish(),
  // Alias de repli
  product_id: texte.nullish(),
  label:      z.string().nullish(),
}).passthrough()

/** Un règlement — `Transaction`. `price` est documenté en chaîne. */
export const transactionZeltySchema = z.object({
  name:   z.string().nullish(),
  price:  nombre.nullish(),
  id_transaction_method: nombre.nullish(),
}).passthrough()

// ⚠️⚠️ TOUT EST EN `.nullish()`, PAS `.optional()` — ET C'EST LA CAUSE DES
// 54 VENTES PERDUES LE JOUR DE L'OUVERTURE. Zelty renvoie `null`, pas
// l'absence : `remote_id: null`, `due_date: null`, `customer: null` sur un
// ticket de comptoir. En zod, `.optional()` accepte `undefined` mais REJETTE
// `null`, et un SEUL champ nul fait tomber la commande ENTIÈRE en « Invalid
// input ».
//
// C'est le piège EXACT que le miroir du catalogue avait déjà payé le
// 28/08/2026 — « 84 plats reçus, 84 rejetés », corrigé en `.nullish()` dans
// `catalogue.ts`. La leçon n'avait jamais été reportée ICI, sur le schéma des
// COMMANDES : elle n'a donc rien protégé le 12/10 à 4 h du matin. Quand un
// schéma de cette API tombe en « Invalid input », chercher un `null` AVANT de
// chercher un nom de champ.
export const commandeZeltySchema = z.object({
  id:          texte.nullish(),
  remote_id:   texte.nullish(),
  display_id:  texte.nullish(),
  ref:         texte.nullish(),

  /** Total TTC en centimes. */
  total:       nombre.nullish(),
  // ⚠️⚠️ LE WEBHOOK NOMME LE TOTAL `price`, PAS `total` — et `total` est tout
  // simplement ABSENT de sa charge utile. Mesuré le 12/10/2026 : 54 ventes
  // terminées, 300,10 € de CA, toutes rejetées « aucun montant total ».
  // Vérifié avant d'y toucher : `price` concorde AU CENTIME avec la somme des
  // lignes sur les 58 tickets qui en portent. `total` reste prioritaire —
  // sur GET c'est lui qui fait foi.
  price:       nombre.nullish(),

  created_at:  z.string().nullish(),
  closed_at:   z.string().nullish(),
  due_date:    z.string().nullish(),

  // ⚠️⚠️ C'EST CE QUI FAISAIT REJETER CHAQUE TICKET. La doc décrit `mode` et
  // `source` comme des chaînes ; le webhook envoie des ENTIERS (`mode: 1`,
  // `source: 1`). Un `z.string()` strict fait alors LEVER zod sur la commande
  // ENTIÈRE — « format inattendu : Invalid input » — et pas seulement ignorer
  // le champ : tous les autres étaient pourtant `.nullish()`, donc c'est
  // bien la rigidité de ces deux-là qui perdait la vente.
  /** eat_in | takeaway | delivery — décide du taux de TVA côté français. */
  mode:        texte.nullish(),
  /** web | mobile | kiosk | pos | remote_pos | ubereats | … */
  source:      texte.nullish(),
  /** L'exemple officiel montre « opened » (chaîne). Voir mapper.ts. */
  status:      z.union([z.string(), z.number()]).nullish(),

  // ⚠️ Deux noms pour la même chose selon la porte d'entrée : `GET /orders`
  // rend `items`, le WEBHOOK `order.ended` rend `contents`. Confirmé sur la
  // spec OpenAPI de la doc (28/08/2026), où `contents` est même REQUIS.
  // Ne lire que `items` ferait entrer chaque ticket web sans une seule ligne —
  // CA juste, stock et marges aveugles, et aucune erreur pour le dire.
  items:        z.array(ligneZeltySchema).nullish(),
  contents:     z.array(ligneZeltySchema).nullish(),
  transactions: z.array(transactionZeltySchema).nullish(),

  table:       nombre.nullish(),
  seats:       nombre.nullish(),
  first_name:  z.string().nullish(),
  id_restaurant: nombre.nullish(),
}).passthrough()

export type CommandeZelty = z.infer<typeof commandeZeltySchema>
export type LigneZelty = z.infer<typeof ligneZeltySchema>

/** Premier alias renseigné, sinon `undefined`. */
export function premier<T>(...valeurs: Array<T | undefined | null>): T | undefined {
  for (const v of valeurs) if (v !== undefined && v !== null && v !== '') return v
  return undefined
}
