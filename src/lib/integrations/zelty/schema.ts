// Format d'une commande Zelty — HYPOTHÈSES, à confirmer sur leur documentation.
//
// Rémi Guidot a confirmé en démo (27/08/2026) qu'une clé d'API est fournie en
// direct, sans intermédiaire, et qu'il envoie la documentation développeur.
// Tant qu'elle n'est pas arrivée, on ne connaît pas le nom exact des champs.
//
// Stratégie : tolérer les alias PLAUSIBLES sur le nom du champ, mais JAMAIS
// deviner une valeur manquante. Un champ absent doit faire échouer bruyamment
// avec un message qui dit lequel — pas produire un ticket à 0 €.
//
// Le jour où la doc arrive, seul CE fichier change.
//
// Client + server safe (aucun accès base, aucun réseau).

import { z } from 'zod'

/** Un nombre qui peut arriver en chaîne (« 12.34 ») selon les API. */
const nombre = z.union([z.number(), z.string()]).transform(v => {
  const n = typeof v === 'number' ? v : Number(String(v).replace(',', '.'))
  return Number.isFinite(n) ? n : NaN
}).refine(n => Number.isFinite(n), 'nombre illisible')

const texte = z.union([z.string(), z.number()]).transform(v => String(v))

/** Ligne de commande. Les alias couvrent les conventions les plus répandues. */
export const ligneZeltySchema = z.object({
  id:            texte.optional(),
  product_id:    texte.optional(),
  item_id:       texte.optional(),

  name:          z.string().optional(),
  label:         z.string().optional(),
  product_name:  z.string().optional(),

  quantity:      nombre.optional(),
  qty:           nombre.optional(),

  /** Prix unitaire TTC. */
  price:         nombre.optional(),
  unit_price:    nombre.optional(),
  price_ttc:     nombre.optional(),

  /** Total TTC de la ligne, quand seul le total est fourni. */
  total:         nombre.optional(),
  total_price:   nombre.optional(),

  vat:           nombre.optional(),
  vat_rate:      nombre.optional(),
  tax_rate:      nombre.optional(),
}).passthrough()

export const commandeZeltySchema = z.object({
  id:            texte.optional(),
  order_id:      texte.optional(),
  reference:     texte.optional(),

  /** Total TTC de la commande. */
  total:         nombre.optional(),
  total_price:   nombre.optional(),
  amount:        nombre.optional(),

  total_ht:      nombre.optional(),
  total_excl_tax: nombre.optional(),
  vat_amount:    nombre.optional(),
  tax_amount:    nombre.optional(),

  /** Horodatage de l'encaissement. */
  date:          z.string().optional(),
  closed_at:     z.string().optional(),
  paid_at:       z.string().optional(),
  created_at:    z.string().optional(),

  payment_method: z.string().optional(),
  payment_type:   z.string().optional(),
  payments:       z.array(z.object({
    method: z.string().optional(),
    type:   z.string().optional(),
    amount: nombre.optional(),
  }).passthrough()).optional(),

  tip:           nombre.optional(),
  tips:          nombre.optional(),

  items:         z.array(ligneZeltySchema).optional(),
  products:      z.array(ligneZeltySchema).optional(),
  lines:         z.array(ligneZeltySchema).optional(),

  /** Point de vente / caisse d'origine, s'il est fourni. */
  pos_id:        texte.optional(),
  point_of_sale: texte.optional(),

  /** Statut. Zelty l'exprime en NOMBRE : 255 = commande clôturée. Les autres
   *  valeurs couvrent les commandes partielles, annulées ou remboursées.
   *  (Source : documentation d'intégration KEYBAN, à reconfirmer sur la doc
   *  officielle.) On accepte aussi la forme texte, par prudence. */
  status:        z.union([z.string(), z.number()]).optional(),
  cancelled:     z.boolean().optional(),
}).passthrough()

export type CommandeZelty = z.infer<typeof commandeZeltySchema>
export type LigneZelty = z.infer<typeof ligneZeltySchema>

/** Premier alias renseigné, sinon `undefined`. */
export function premier<T>(...valeurs: Array<T | undefined | null>): T | undefined {
  for (const v of valeurs) if (v !== undefined && v !== null && v !== '') return v
  return undefined
}
