// Disponibilités : outil → caisse Zelty (`POST /catalog/dishes`).
//
// FONCTION PURE : aucun réseau, aucune base.
//
// ⚠️ C'EST LA MANIPULATION LA PLUS DANGEREUSE DE TOUTE L'INTÉGRATION.
// `POST /catalog/dishes` est un UPSERT, et `name`, `price` et `tax` y sont
// obligatoires. Un objet incomplet envoyé là-dedans peut écraser le nom ou le
// prix d'un plat dans la caisse — c'est-à-dire ce qui s'imprime sur les
// tickets et ce qui fait foi fiscalement.
//
// D'où la règle absolue de ce fichier : on ne construit une mise à jour
// QU'À PARTIR du plat relu chez Zelty à l'instant. On recopie ses champs
// obligatoires tels quels, on ne touche QUE les drapeaux de disponibilité, et
// on REFUSE de construire si l'un des champs obligatoires manque.
//
// On n'invente jamais un prix. Jamais.
//
// Client + server safe.

/** Le plat tel que Zelty vient de nous le rendre. */
export type PlatCourant = {
  id: string | number
  name?: string | null
  price?: number | null
  tax?: number | null
  disable_takeaway?: boolean | null
  disable_delivery?: boolean | null
}

/** Ce qu'on veut obtenir pour ce plat. */
export type Voulu = { indisponibleEnLigne: boolean }

/** La charge utile minimale d'un upsert de disponibilité. */
export type MajDisponibilite = {
  id: number
  /** Recopiés de Zelty, jamais inventés — l'API les exige. */
  name: string
  price: number
  tax: number
  disable_takeaway: boolean
  disable_delivery: boolean
}

export type ResultatDisponibilites = {
  /** Ce qu'il faut envoyer. Vide si rien ne change. */
  majs: MajDisponibilite[]
  /** Plats écartés, avec la raison. Rien n'est tenté à l'aveugle. */
  refus: Array<{ id: string; raison: string }>
  /** Plats déjà dans l'état voulu — comptés, pas renvoyés. */
  inchanges: number
}

/**
 * Construit les mises à jour de disponibilité.
 *
 * Ne renvoie QUE les plats dont l'état change : réémettre un catalogue entier
 * à chaque passage multiplierait par cent le risque d'écraser quelque chose,
 * pour aucun gain.
 */
export function construireDisponibilites(
  courants: PlatCourant[],
  voulus: Map<string, Voulu>,
): ResultatDisponibilites {
  const majs: MajDisponibilite[] = []
  const refus: ResultatDisponibilites['refus'] = []
  let inchanges = 0

  for (const p of courants) {
    const cle = String(p.id)
    const voulu = voulus.get(cle)
    if (!voulu) continue          // pas concerné par cette passe

    const id = Number(p.id)
    if (!Number.isInteger(id) || id <= 0) {
      refus.push({ id: cle, raison: 'identifiant caisse illisible' })
      continue
    }
    // Les trois champs que l'API exige. Les inventer reviendrait à écrire un
    // faux prix dans la caisse — donc on refuse plutôt que de deviner.
    if (!p.name || typeof p.name !== 'string') {
      refus.push({ id: cle, raison: 'nom absent — refus de construire un upsert incomplet' })
      continue
    }
    if (p.price == null || !Number.isFinite(Number(p.price))) {
      refus.push({ id: cle, raison: 'prix absent — refus : un upsert écraserait le prix en caisse' })
      continue
    }
    if (p.tax == null || !Number.isFinite(Number(p.tax))) {
      refus.push({ id: cle, raison: 'TVA absente — refus : un upsert écraserait le taux en caisse' })
      continue
    }

    const dejaCoupe = p.disable_takeaway === true && p.disable_delivery === true
    const dejaOuvert = p.disable_takeaway !== true && p.disable_delivery !== true
    if ((voulu.indisponibleEnLigne && dejaCoupe) || (!voulu.indisponibleEnLigne && dejaOuvert)) {
      inchanges++
      continue
    }

    majs.push({
      id,
      name: p.name,
      price: Number(p.price),
      tax: Number(p.tax),
      // On ne touche QUE ces deux drapeaux. `disable` reste intact : l'éteindre
      // ferait relire « produit inactif » par le miroir du catalogue, qui
      // éteindrait la fiche chez nous — et le produit disparaîtrait même une
      // fois réapprovisionné.
      disable_takeaway: voulu.indisponibleEnLigne,
      disable_delivery: voulu.indisponibleEnLigne,
    })
  }

  return { majs, refus, inchanges }
}
