// Catalogue Zelty → miroir local.
//
// Écrit d'après https://docs.zelty.fr — `GET /catalog/dishes` (API 2.11),
// lue le 28/08/2026.
//
// Zelty devient maître des données COMMERCIALES : nom, prix, TVA,
// disponibilité — ce qui s'imprime sur le ticket et fait foi fiscalement.
// L'outil garde ce qu'aucune caisse ne portera jamais : photos, allergènes,
// prix d'achat réels, correspondance « Panuozzi ← pâton ».
//
// FONCTION PURE : aucun réseau, aucune base. Testable sans compte ni clé.

import { z } from 'zod'

const nombre = z.union([z.number(), z.string()]).transform(v => {
  const n = typeof v === 'number' ? v : Number(String(v).replace(',', '.'))
  return Number.isFinite(n) ? n : NaN
}).refine(n => Number.isFinite(n))

// ⚠️ Zelty renvoie `null` — pas l'absence — pour tout prix ou taxe non
// renseigné : `price_delivery`, `cost_price`, `tax_delivery` sur un produit
// qui n'est pas livré. `.optional()` accepte `undefined` mais REJETTE `null`,
// et un seul champ nul faisait tomber le plat entier dans « illisible ».
// Vécu le 28/08/2026 : 84 plats reçus, 84 rejetés, sans qu'aucune erreur ne
// remonte — le miroir se croyait vide. `.nullish()` accepte les deux.
const nombreOuNul = nombre.nullish()

/** Un plat — schéma `Dish`. Montants en CENTIMES, TVA en millièmes (1000 = 10 %). */
export const platZeltySchema = z.object({
  id:            z.union([z.number(), z.string()]).transform(v => String(v)),
  /** Champ libre côté Zelty : on y écrira NOTRE identifiant (voir plus bas). */
  remote_id:     z.string().nullable().optional(),
  sku:           z.string().nullable().optional(),
  name:          z.string(),
  description:   z.string().nullable().optional(),
  image:         z.string().nullable().optional(),

  /** Prix sur place, TTC, en centimes. */
  price:         nombreOuNul,
  /** Prix à emporter, TTC, en centimes. */
  price_togo:    nombreOuNul,
  price_delivery: nombreOuNul,
  cost_price:    nombreOuNul,

  /** TVA sur place, en millièmes : 1000 = 10 %, 550 = 5,5 %. */
  tax:           nombreOuNul,
  tax_takeaway:  nombreOuNul,
  tax_delivery:  nombreOuNul,

  disable:          z.boolean().nullable().optional(),
  disable_takeaway: z.boolean().nullable().optional(),
  disable_delivery: z.boolean().nullable().optional(),
  /** Visible uniquement sur la caisse : jamais sur le site. */
  zc_only:       z.boolean().nullable().optional(),

  /** Poste de production — correspond à notre `tag_destination`. */
  id_fabrication_place: nombreOuNul,
  fab_name:      z.string().nullable().optional(),
}).passthrough()

export type PlatZelty = z.infer<typeof platZeltySchema>

/** Ce que le miroir retient d'un plat Zelty. */
export type PlatNormalise = {
  /** Identifiant Zelty — celui à envoyer dans `items[].id` d'un POST /orders. */
  identifiant: string
  /** Ce que Zelty a mémorisé de notre côté, s'il y a déjà un lien. */
  notreId: string | null
  nom: string
  description: string | null
  /** Prix TTC en euros — à emporter d'abord, c'est le mode du Fournil. */
  prixTtc: number | null
  prixSurPlaceTtc: number | null
  /** Taux de TVA en pourcentage : 5.5, 10, 20… */
  tva: number | null
  actif: boolean
  /** Visible sur le site ? Faux si `zc_only` ou si l'emporter est coupé. */
  vendableEnLigne: boolean
  posteProduction: string | null
}

const arrondi = (n: number) => Math.round(n * 100) / 100

/** TVA Zelty (millièmes) → pourcentage. 1000 → 10 · 550 → 5,5. */
export function tvaDepuisZelty(brut: number | null | undefined): number | null {
  if (brut == null || !Number.isFinite(brut)) return null
  // 1000 = 10 % : le facteur est 100. Un taux déjà en pourcentage (10, 5.5)
  // reste tel quel — aucune TVA française ne dépasse 100.
  const t = brut > 100 ? brut / 100 : brut
  return t > 0 && t <= 100 ? arrondi(t) : null
}

/** Centimes → euros, en tolérant l'absence. */
const euros = (c: number | null | undefined): number | null =>
  c == null || !Number.isFinite(c) ? null : arrondi(c / 100)

export function normaliserPlat(brut: unknown): PlatNormalise | { erreur: string } {
  const p = platZeltySchema.safeParse(brut)
  if (!p.success) return { erreur: p.error.issues[0]?.message ?? 'format inattendu' }
  const d = p.data

  // Le Fournil vend à emporter : c'est `price_togo` et `tax_takeaway` qui
  // font foi, et Zelty les porte séparément — le 5,5 % / 10 % français est
  // donc natif, sans calcul de notre côté.
  const prixEmporter = euros(d.price_togo) ?? euros(d.price)
  const tvaEmporter = tvaDepuisZelty(d.tax_takeaway) ?? tvaDepuisZelty(d.tax)

  return {
    identifiant: d.id,
    notreId: d.remote_id ?? null,
    nom: d.name.trim(),
    description: d.description?.trim() || null,
    prixTtc: prixEmporter,
    prixSurPlaceTtc: euros(d.price),
    tva: tvaEmporter,
    actif: d.disable !== true,
    // `zc_only` veut dire « caisse seulement ». Le publier sur le site
    // afficherait un produit que le client ne peut pas commander.
    vendableEnLigne: d.zc_only !== true && d.disable !== true && d.disable_takeaway !== true,
    posteProduction: d.fab_name?.trim() || null,
  }
}

// ─── Rapprochement ───────────────────────────────────────────────────

export type ProduitLocal = { id: string; nom: string; nom_caisse: string | null }

export type Appariement = {
  plat: PlatNormalise
  recetteId: string | null
  /** Comment le lien a été établi — sert au diagnostic et à la confiance. */
  par: 'remote_id' | 'correspondance' | 'nom' | null
}

const norm = (x: string) =>
  x.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]/g, '')

/**
 * Rapproche les plats Zelty de nos fiches produits.
 *
 * Ordre volontaire, du plus sûr au plus faible :
 *   1. `remote_id` — Zelty a mémorisé NOTRE identifiant. Exact, définitif ;
 *   2. correspondance déjà enregistrée (0137) ;
 *   3. le nom, normalisé — le seul approximatif, et le seul à n'utiliser
 *      qu'une fois : dès qu'un lien est établi on l'écrit, et les synchros
 *      suivantes n'en dépendent plus.
 *
 * Rien n'est créé ici. Un plat sans correspondance est REMONTÉ, pas inventé :
 * créer à l'aveugle doublonnerait nos 85 fiches du Fournil au premier appel.
 */
export function rapprocher(
  plats: PlatNormalise[],
  locaux: ProduitLocal[],
  correspondances: Map<string, string>,
): { apparies: Appariement[]; sansCorrespondance: PlatNormalise[] } {
  const parNom = new Map<string, string>()
  for (const l of locaux) {
    if (l.nom_caisse) parNom.set(norm(l.nom_caisse), l.id)
    if (!parNom.has(norm(l.nom))) parNom.set(norm(l.nom), l.id)
  }
  const idsLocaux = new Set(locaux.map(l => l.id))

  const apparies: Appariement[] = []
  const sansCorrespondance: PlatNormalise[] = []

  for (const plat of plats) {
    // 1. Zelty porte notre identifiant.
    if (plat.notreId && idsLocaux.has(plat.notreId)) {
      apparies.push({ plat, recetteId: plat.notreId, par: 'remote_id' })
      continue
    }
    // 2. Lien déjà enregistré chez nous.
    const deja = correspondances.get(plat.identifiant)
    if (deja && idsLocaux.has(deja)) {
      apparies.push({ plat, recetteId: deja, par: 'correspondance' })
      continue
    }
    // 3. Le nom, une seule fois.
    const parLibelle = parNom.get(norm(plat.nom))
    if (parLibelle) {
      apparies.push({ plat, recetteId: parLibelle, par: 'nom' })
      continue
    }
    sansCorrespondance.push(plat)
  }
  return { apparies, sansCorrespondance }
}
