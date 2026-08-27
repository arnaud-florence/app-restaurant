// Commande du site → Zelty (`POST /orders`).
//
// FONCTION PURE : aucun réseau, aucune base. Elle construit la charge utile et
// dit pourquoi elle refuse, le cas échéant.
//
// Écrit d'après https://docs.zelty.fr — `POST /orders` (API 2.11), lue le
// 28/08/2026. Trois règles viennent directement de la documentation, et
// chacune protège de l'argent :
//
//   · un `total` INFÉRIEUR au total recalculé par Zelty est accepté EN
//     SILENCE, et Zelty crée une remise globale égale à l'écart. Aucune
//     erreur. Un panier amputé d'une ligne fuiterait donc la marge sans que
//     personne ne le voie — d'où le refus TOUT OU RIEN ci-dessous ;
//   · `items[].item_id` est un champ MORT sur POST : c'est `id` (entier) qui
//     référence le plat. Envoyer l'autre donne « Cannot find dish » ;
//   · un `remote_id` stable rend le renvoi sûr : l'API répond
//     `already_registred: true` au lieu de créer un doublon.
//
// Client + server safe.

/** Une ligne de notre commande, telle qu'on la connaît chez nous. */
export type LigneLocale = {
  recette_id: string
  nom: string
  quantite: number
  prix_unitaire_ttc: number
}

export type EntreeCommandeZelty = {
  /** Identifiant Zelty du plat — ENTIER. `item_id` n'est pas lu par l'API. */
  id: number
  type: 'dish'
  /** Prix TTC de la ligne, en centimes. */
  price: number
}

export type CommandeSortante = {
  remote_id: string
  source: 'web'
  mode: 'takeaway' | 'delivery' | 'eat_in'
  due_date?: string
  items: EntreeCommandeZelty[]
  /** Total TTC en centimes. Doit ÉGALER la somme des lignes. */
  total: number
  transactions?: Array<{ name: string; price: string }>
  comment?: string
  first_name?: string
  phone?: string
}

export type Refus = { refus: true; raisons: string[] }
export type Pret = { refus: false; commande: CommandeSortante }

const centimes = (euros: number) => Math.round(euros * 100)

export type EntreeConstruction = {
  numero: string
  mode: 'takeaway' | 'delivery' | 'eat_in'
  lignes: LigneLocale[]
  montantTotalTtc: number
  /** Correspondance recette → identifiant Zelty (chaîne, convertie en entier). */
  correspondances: Map<string, string>
  /** Libellé EXACT d'un mode de paiement configuré dans Zelty. */
  modePaiement?: string
  creneau?: string | null
  commentaire?: string | null
  prenom?: string | null
  telephone?: string | null
}

/**
 * Construit la commande à envoyer, ou dit pourquoi elle ne part pas.
 *
 * ⚠️ TOUT OU RIEN. Si une seule ligne n'a pas de correspondance Zelty, on
 * REFUSE d'envoyer. Envoyer le panier amputé serait accepté sans erreur, et
 * Zelty créerait une remise égale à la ligne manquante : le client paierait
 * chez nous ce que la caisse offrirait de son côté.
 */
export function construireCommandeZelty(e: EntreeConstruction): Pret | Refus {
  const raisons: string[] = []

  if (e.lignes.length === 0) raisons.push('commande sans aucune ligne')

  const items: EntreeCommandeZelty[] = []
  for (const l of e.lignes) {
    const ext = e.correspondances.get(l.recette_id)
    if (!ext) {
      raisons.push(`« ${l.nom} » n'a pas de correspondance dans la caisse`)
      continue
    }
    const id = Number(ext)
    if (!Number.isInteger(id) || id <= 0) {
      raisons.push(`identifiant caisse illisible pour « ${l.nom} » (${ext})`)
      continue
    }
    if (!Number.isFinite(l.quantite) || l.quantite <= 0) {
      raisons.push(`quantité invalide pour « ${l.nom} »`)
      continue
    }
    // L'API n'a pas de champ quantité sur POST : une ligne par unité.
    // Le prix envoyé est celui de LA ligne, pas de l'unité.
    for (let i = 0; i < Math.round(l.quantite); i++) {
      items.push({ id, type: 'dish', price: centimes(l.prix_unitaire_ttc) })
    }
  }

  if (raisons.length > 0) return { refus: true, raisons }

  // ⚠️ Le contrôle qui protège la marge. Zelty ne le fera pas pour nous :
  // un total plus bas passe en silence et devient une remise.
  const sommeLignes = items.reduce((s, i) => s + i.price, 0)
  const total = centimes(e.montantTotalTtc)
  if (sommeLignes !== total) {
    return {
      refus: true,
      raisons: [
        `le total (${(total / 100).toFixed(2)} €) ne correspond pas à la somme ` +
        `des lignes (${(sommeLignes / 100).toFixed(2)} €). Envoyer quand même ` +
        `ferait créer une remise silencieuse par la caisse.`,
      ],
    }
  }

  return {
    refus: false,
    commande: {
      // Notre numéro de commande fait office de clé d'idempotence : renvoyer
      // deux fois ne créera pas deux ventes.
      remote_id: e.numero,
      source: 'web',
      mode: e.mode,
      ...(e.creneau ? { due_date: new Date(e.creneau).toISOString() } : {}),
      items,
      total,
      ...(e.modePaiement
        ? { transactions: [{ name: e.modePaiement, price: String(total) }] }
        : {}),
      ...(e.commentaire ? { comment: e.commentaire.slice(0, 255) } : {}),
      ...(e.prenom ? { first_name: e.prenom } : {}),
      ...(e.telephone ? { phone: e.telephone } : {}),
    },
  }
}

/** Mode de consommation de notre commande → `mode` Zelty. */
export function modeZelty(livraison: boolean, surPlace = false): CommandeSortante['mode'] {
  if (livraison) return 'delivery'
  return surPlace ? 'eat_in' : 'takeaway'
}
