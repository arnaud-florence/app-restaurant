// Zelty → format normalisé du connecteur de caisse.
//
// FONCTION PURE : aucun réseau, aucune base. C'est le seul endroit qui connaît
// le format Zelty, et c'est le seul qu'il faudra retoucher quand leur
// documentation arrivera. Elle est donc testable aujourd'hui, sans compte et
// sans clé, à partir d'une commande d'exemple.
//
// Deux principes, tous les deux appris à nos dépens :
//
//   · on ne devine JAMAIS une valeur manquante. Un total absent produit un
//     diagnostic, pas un ticket à 0 € qui fausserait le CA en silence ;
//   · l'unité monétaire est déclarée, jamais devinée. Beaucoup d'API de caisse
//     renvoient des CENTIMES. Se tromper multiplie le chiffre d'affaires par
//     cent — d'où le garde-fou sur le panier moyen en fin de fichier.
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
  /** true si Zelty renvoie des centimes. À DÉCLARER, jamais à deviner. */
  montantsEnCentimes: boolean
  /** Point de vente à rattacher par défaut aux tickets de cette caisse. */
  etablissementSlug?: string
}

export type ResultatMapping = {
  encaissements: EncaissementNormalise[]
  /** Commandes écartées, avec la raison. Rien n'est jeté en silence. */
  rejets: Array<{ reference: string; raison: string }>
  avertissements: string[]
}

const arrondi = (n: number) => Math.round(n * 100) / 100

/** Normalise un mode de paiement Zelty vers notre vocabulaire. */
export function normaliserPaiement(brut: string | undefined): string {
  const s = (brut ?? '').toLowerCase()
  if (/esp|cash|liquide/.test(s)) return 'especes'
  if (/cb|card|carte|credit|bank/.test(s)) return 'carte'
  if (/ticket|resto|swile|edenred|trd/.test(s)) return 'ticket_resto'
  if (/online|en_ligne|web|stripe|paypal/.test(s)) return 'en_ligne'
  if (/virement|transfer/.test(s)) return 'virement'
  return s || 'autre'
}

function mapperLigne(l: LigneZelty, div: number): {
  ligne?: NonNullable<EncaissementNormalise['produits']>[number]
  raison?: string
} {
  const nom = premier(l.name, l.label, l.product_name)
  if (!nom) return { raison: 'ligne sans libellé' }

  const quantite = Number(premier(l.quantity, l.qty) ?? 1)
  if (!Number.isFinite(quantite) || quantite <= 0) return { raison: `quantité illisible pour « ${nom} »` }

  // Prix unitaire : direct s'il existe, sinon déduit du total de la ligne.
  const pu = premier(l.price, l.unit_price, l.price_ttc)
  const total = premier(l.total, l.total_price)
  const prixUnitaireTtc = pu != null
    ? Number(pu) / div
    : total != null
      ? (Number(total) / div) / quantite
      : NaN
  if (!Number.isFinite(prixUnitaireTtc)) return { raison: `aucun prix exploitable pour « ${nom} »` }

  const taux = premier(l.vat, l.vat_rate, l.tax_rate)
  return {
    ligne: {
      nom_caisse: String(nom),
      identifiant_externe: premier(l.product_id, l.item_id, l.id),
      quantite,
      prix_unitaire_ttc: arrondi(prixUnitaireTtc),
      // Un taux exprimé en fraction (0.055) est ramené en pourcentage.
      ...(taux != null && Number.isFinite(Number(taux))
        ? { tva_taux: Number(taux) < 1 ? arrondi(Number(taux) * 100) : Number(taux) }
        : {}),
    },
  }
}

/** Convertit un lot de commandes Zelty. Ne lève jamais : tout est diagnostiqué. */
export function mapperCommandes(brut: unknown[], opts: OptionsMapping): ResultatMapping {
  const div = opts.montantsEnCentimes ? 100 : 1
  const encaissements: EncaissementNormalise[] = []
  const rejets: ResultatMapping['rejets'] = []
  const avertissements: string[] = []

  for (const [i, item] of brut.entries()) {
    const parsed = commandeZeltySchema.safeParse(item)
    if (!parsed.success) {
      rejets.push({ reference: `#${i}`, raison: `format inattendu : ${parsed.error.issues[0]?.message ?? 'inconnu'}` })
      continue
    }
    const c: CommandeZelty = parsed.data

    const ref = premier(c.id, c.order_id, c.reference)
    if (!ref) { rejets.push({ reference: `#${i}`, raison: 'commande sans identifiant' }); continue }

    if (c.cancelled === true || /cancel|annul|void/i.test(c.status ?? '')) {
      rejets.push({ reference: String(ref), raison: 'commande annulée' })
      continue
    }

    const totalBrut = premier(c.total, c.total_price, c.amount)
    if (totalBrut == null) {
      // Jamais de repli à 0 : un ticket à 0 € entrerait dans le CA comme une
      // vente réelle et personne ne le remarquerait.
      rejets.push({ reference: String(ref), raison: 'aucun montant total' })
      continue
    }
    const montantTtc = arrondi(Number(totalBrut) / div)

    const quand = premier(c.closed_at, c.paid_at, c.date, c.created_at)
    if (!quand) avertissements.push(`${ref} : aucune date, l'heure d'import fera foi`)

    const lignesBrutes = premier(c.items, c.products, c.lines) ?? []
    const produits: NonNullable<EncaissementNormalise['produits']> = []
    for (const l of lignesBrutes) {
      const { ligne, raison } = mapperLigne(l, div)
      if (ligne) produits.push(ligne)
      else if (raison) avertissements.push(`${ref} : ${raison}`)
    }
    if (lignesBrutes.length > 0 && produits.length === 0) {
      avertissements.push(`${ref} : aucune ligne exploitable, le montant sera compté sans détail`)
    }

    const htBrut = premier(c.total_ht, c.total_excl_tax)
    const tvaBrut = premier(c.vat_amount, c.tax_amount)
    const pourboireBrut = premier(c.tip, c.tips)

    const paiement = premier(
      c.payment_method, c.payment_type,
      c.payments?.[0] ? premier(c.payments[0].method, c.payments[0].type) : undefined,
    )

    encaissements.push({
      ticket_externe: String(ref),
      etablissement_slug: opts.etablissementSlug,
      montant_ttc: montantTtc,
      ...(htBrut != null ? { montant_ht: arrondi(Number(htBrut) / div) } : {}),
      ...(tvaBrut != null ? { tva_total: arrondi(Number(tvaBrut) / div) } : {}),
      ...(paiement ? { mode_paiement: normaliserPaiement(paiement) } : {}),
      ...(quand ? { encaisse_at: new Date(quand).toISOString() } : {}),
      ...(pourboireBrut != null ? { pourboire: arrondi(Number(pourboireBrut) / div) } : {}),
      ...(produits.length > 0 ? { produits } : {}),
    })
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
    } else if (moyen < 0.5 && !opts.montantsEnCentimes) {
      avertissements.push(
        `panier moyen de ${arrondi(moyen)} € — les montants semblent déjà divisés, ` +
        `vérifiez montantsEnCentimes`,
      )
    }
  }

  return { encaissements, rejets, avertissements }
}
