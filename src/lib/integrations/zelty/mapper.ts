// Zelty → format normalisé du connecteur de caisse.
//
// FONCTION PURE : aucun réseau, aucune base. C'est le seul endroit qui connaît
// le format Zelty, et il est donc testable sans compte ni clé, à partir de
// commandes d'exemple.
//
// Écrit d'après https://docs.zelty.fr (API 2.11), lue le 28/08/2026.
//
// Trois principes, tous appris à nos dépens :
//
//   · on ne devine JAMAIS une valeur manquante. Un total absent produit un
//     diagnostic nommé, pas un ticket à 0 € qui fausserait le CA en silence ;
//   · l'unité monétaire est déclarée, jamais devinée. Zelty renvoie des
//     ENTIERS en centimes ; se tromper multiplie le chiffre d'affaires par
//     cent, et rien dans les données ne le signale ;
//   · une hypothèse non vérifiée se signale au lieu de s'appliquer en
//     silence — d'où les avertissements, que `?dry=1` affiche.
//
// Client + server safe.

import {
  commandeZeltySchema, premier,
  type CommandeZelty, type LigneZelty,
} from './schema'

/** Format attendu par POST /api/integrations/caisse/encaissements. */
export type EncaissementNormalise = {
  ticket_externe: string
  etablissement_slug?: string
  montant_ttc: number
  montant_ht?: number
  tva_total?: number
  ventilation_tva?: Record<string, number>
  mode_paiement?: string
  encaisse_at?: string
  pourboire?: number
  produits?: Array<{
    nom_caisse: string
    identifiant_externe?: string
    quantite: number
    prix_unitaire_ttc: number
    tva_taux?: number
  }>
}

export type OptionsMapping = {
  /** Zelty renvoie des centimes. Reste déclaré : voir client.ts. */
  montantsEnCentimes: boolean
  etablissementSlug?: string
}

export type ResultatMapping = {
  encaissements: EncaissementNormalise[]
  /** Commandes écartées, avec la raison. Rien n'est jeté en silence. */
  rejets: Array<{ reference: string; raison: string }>
  avertissements: string[]
}

const arrondi = (n: number) => Math.round(n * 100) / 100

/** Statuts qui ne valent PAS une vente encaissée. */
const STATUTS_NON_VENDUS = /^(opened|pending|cancell?ed|canceled|void|refunded|draft)$/i

/**
 * Normalise un taux de TVA Zelty (entier) vers un pourcentage.
 * 550 → 5,5 · 5.5 → 5,5 · 0.055 → 5,5. Un taux hors bornes est ignoré.
 */
export function normaliserTaux(brut: number | undefined): number | undefined {
  if (brut == null || !Number.isFinite(brut)) return undefined
  let t = brut
  if (t > 100) t = t / 100      // points de base : 550 → 5,5
  if (t > 0 && t < 1) t = t * 100 // fraction : 0,055 → 5,5
  return t > 0 && t <= 100 ? arrondi(t) : undefined
}

/** Normalise un mode de paiement Zelty vers notre vocabulaire. */
export function normaliserPaiement(brut: string | undefined): string {
  const s = (brut ?? '').toLowerCase()
  if (/esp|cash|liquide/.test(s)) return 'especes'
  if (/cb|card|carte|credit|bank|tpe/.test(s)) return 'carte'
  if (/ticket|resto|swile|edenred|trd/.test(s)) return 'ticket_resto'
  if (/online|en.?ligne|web|stripe|paypal/.test(s)) return 'en_ligne'
  if (/virement|transfer/.test(s)) return 'virement'
  if (/cheque|chèque/.test(s)) return 'cheque'
  return s || 'autre'
}

function mapperLigne(l: LigneZelty, div: number): {
  ligne?: NonNullable<EncaissementNormalise['produits']>[number]
  raison?: string
  avertissement?: string
} {
  const nom = premier(l.name, l.label)
  if (!nom) return { raison: 'ligne sans libellé' }

  // ⚠️ La quantité n'est PAS documentée sur GET /orders (elle l'est sur la
  // création). Tant qu'une charge utile réelle ne l'a pas montrée, on prend 1
  // et on le DIT : une quantité muette transformerait 3 croissants en 1.
  const qBrut = premier(l.qty, l.quantity)
  const quantite = qBrut != null && Number(qBrut) > 0 ? Number(qBrut) : 1
  const avertissement = qBrut == null ? `quantité absente pour « ${nom} », comptée pour 1` : undefined

  // `price` est un OBJET. `final_amount_inc_tax` est le prix retenu après
  // remise et suppléments — c'est celui qui a été payé.
  const p = l.price
  const montant = premier(
    p?.final_amount_inc_tax, p?.discounted_amount_inc_tax,
    p?.original_amount_inc_tax, p?.base_original_amount_inc_tax,
  )
  if (montant == null) return { raison: `aucun prix exploitable pour « ${nom} »` }

  // Le montant de ligne couvre la quantité : on ramène à l'unité.
  const prixUnitaireTtc = (Number(montant) / div) / quantite
  if (!Number.isFinite(prixUnitaireTtc)) return { raison: `prix illisible pour « ${nom} »` }

  const taux = normaliserTaux(l.tax?.tax_rate)
  return {
    avertissement,
    ligne: {
      nom_caisse: String(nom),
      identifiant_externe: premier(l.item_id, l.product_id),
      quantite,
      prix_unitaire_ttc: arrondi(prixUnitaireTtc),
      ...(taux != null ? { tva_taux: taux } : {}),
    },
  }
}

/** Convertit un lot de commandes Zelty. Ne lève jamais : tout est diagnostiqué. */
export function mapperCommandes(brut: unknown[], opts: OptionsMapping): ResultatMapping {
  const div = opts.montantsEnCentimes ? 100 : 1
  const encaissements: EncaissementNormalise[] = []
  const rejets: ResultatMapping['rejets'] = []
  const avertissements: string[] = []
  let sansItems = 0

  for (const [i, item] of brut.entries()) {
    const parsed = commandeZeltySchema.safeParse(item)
    if (!parsed.success) {
      rejets.push({ reference: `#${i}`, raison: `format inattendu : ${parsed.error.issues[0]?.message ?? 'inconnu'}` })
      continue
    }
    const c: CommandeZelty = parsed.data

    const ref = premier(c.id, c.remote_id, c.display_id, c.ref)
    if (!ref) { rejets.push({ reference: `#${i}`, raison: 'commande sans identifiant' }); continue }

    // ── La commande est-elle encaissée ? ────────────────────────────
    // `GET /orders` exclut déjà les annulées et les ouvertes par défaut
    // (`include_cancelled` et `opened` sont des drapeaux à activer). Ce
    // contrôle est une seconde barrière, pas la première.
    const st = c.status
    if (typeof st === 'string' && STATUTS_NON_VENDUS.test(st.trim())) {
      rejets.push({ reference: String(ref), raison: `statut « ${st} » — non encaissée` })
      continue
    }
    if (typeof st === 'number' && st !== 255) {
      rejets.push({ reference: String(ref), raison: `statut ${st} — non clôturée` })
      continue
    }

    const totalBrut = c.total
    if (totalBrut == null) {
      rejets.push({ reference: String(ref), raison: 'aucun montant total' })
      continue
    }
    const montantTtc = arrondi(Number(totalBrut) / div)

    const quand = premier(c.closed_at, c.created_at, c.due_date)
    if (!quand) avertissements.push(`${ref} : aucune date, l'heure d'import fera foi`)

    // ── Lignes ──────────────────────────────────────────────────────
    // `items` sur GET /orders, `contents` sur le webhook order.ended.
    const lignesBrutes = c.items ?? c.contents ?? []
    if (lignesBrutes.length === 0) sansItems++
    const produits: NonNullable<EncaissementNormalise['produits']> = []
    for (const l of lignesBrutes) {
      const { ligne, raison, avertissement } = mapperLigne(l, div)
      if (avertissement) avertissements.push(`${ref} : ${avertissement}`)
      if (ligne) produits.push(ligne)
      else if (raison) avertissements.push(`${ref} : ${raison}`)
    }

    // ── TVA reconstituée depuis les lignes ──────────────────────────
    const ventilation: Record<string, number> = {}
    for (const l of lignesBrutes) {
      const taux = normaliserTaux(l.tax?.tax_rate)
      const montantTaxe = l.tax?.tax_amount
      if (taux == null || montantTaxe == null) continue
      const k = String(taux)
      ventilation[k] = arrondi((ventilation[k] ?? 0) + Number(montantTaxe) / div)
    }
    const tvaTotal = Object.values(ventilation).reduce((s, v) => s + v, 0)

    // Le mode de paiement vient des transactions (expand[]=transactions.method).
    const paiement = c.transactions?.find(t => t.name)?.name

    encaissements.push({
      ticket_externe: String(ref),
      etablissement_slug: opts.etablissementSlug,
      montant_ttc: montantTtc,
      ...(tvaTotal > 0 ? { tva_total: arrondi(tvaTotal), ventilation_tva: ventilation } : {}),
      ...(tvaTotal > 0 ? { montant_ht: arrondi(montantTtc - tvaTotal) } : {}),
      ...(paiement ? { mode_paiement: normaliserPaiement(paiement) } : {}),
      ...(quand ? { encaisse_at: new Date(quand).toISOString() } : {}),
      ...(produits.length > 0 ? { produits } : {}),
    })
  }

  // ── Le détail des lignes est-il bien demandé ? ──────────────────────
  // Sans `expand[]=items`, Zelty renvoie `items: []` et le CA serait juste
  // pendant que stock, food cost et marges resteraient aveugles — sans la
  // moindre erreur visible. C'est le piège de cette API.
  if (sansItems > 0 && sansItems === encaissements.length + rejets.length) {
    avertissements.push(
      `AUCUNE commande ne porte de lignes — il manque très probablement ` +
      `expand[]=items dans l'appel. Le CA serait juste, le détail perdu.`,
    )
  } else if (sansItems > 0) {
    avertissements.push(`${sansItems} commande(s) sans aucune ligne de produit`)
  }

  // ── Garde-fou centimes ─────────────────────────────────────────────
  // Une erreur d'unité multiplie le CA par cent, et rien dans les données ne
  // le signale : les montants restent des nombres valides. Le panier moyen,
  // lui, devient absurde. Un fournil ne fait pas 300 € de panier moyen.
  if (encaissements.length >= 5) {
    const moyen = encaissements.reduce((s, e) => s + e.montant_ttc, 0) / encaissements.length
    if (moyen > 300) {
      avertissements.push(
        `panier moyen de ${arrondi(moyen)} € sur ${encaissements.length} tickets — ` +
        `montantsEnCentimes est probablement mal réglé (actuellement ${opts.montantsEnCentimes})`,
      )
    } else if (moyen < 0.5) {
      avertissements.push(
        `panier moyen de ${arrondi(moyen)} € — montants divisés deux fois ? ` +
        `vérifiez montantsEnCentimes`,
      )
    }
  }

  return { encaissements, rejets, avertissements }
}
