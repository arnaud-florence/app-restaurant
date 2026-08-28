// Import initial du catalogue : outil → Zelty (`POST /catalog/dishes`).
//
// Zelty arrive vide. Plutôt que de saisir 85 produits à la main — avec les
// fautes de frappe et les prix mal recopiés que ça implique — on pousse la
// carte que nous avons déjà, prix et photos compris.
//
// FONCTION PURE : aucun réseau, aucune base.
//
// ⚠️ On écrit NOTRE identifiant dans leur champ `remote_id`. C'est ce qui rend
// la correspondance exacte dès le premier jour : plus jamais de rapprochement
// par le nom, et un produit renommé de part et d'autre reste le même produit.
//
// ⚠️ Aucun `id` n'est envoyé : un `id` inconnu ferait échouer l'appel, et un
// `id` réutilisé écraserait un plat existant. L'import CRÉE ; la mise à jour
// d'un plat déjà lié passe par le miroir du catalogue, pas par ici.
//
// Client + server safe.

/** Un produit de notre base, tel qu'on le connaît. */
export type ProduitLocalComplet = {
  id: string
  nom: string
  description: string | null
  /** Prix de vente HT — celui du panneau, à emporter. */
  prix_vente_ht: number | null
  /** Prix TTC en salle / au bar. NULL = même prix qu'à emporter. */
  prix_sur_place_ttc?: number | null
  /** Taux porté par le produit : 2.1, 5.5, 10 ou 20. */
  tva: number | null
  contient_alcool: boolean
  image_url: string | null
  actif: boolean
}

/** Le plat tel qu'on l'envoie à Zelty pour création. */
export type PlatACreer = {
  remote_id: string
  name: string
  description?: string
  image?: string
  /** Prix TTC sur place, en centimes. */
  price: number
  /** Prix TTC à emporter, en centimes. */
  price_togo: number
  /** TVA sur place, en millièmes : 1000 = 10 %. */
  tax: number
  /** TVA à emporter, en millièmes. */
  tax_takeaway: number
  disable?: boolean
}

export type ResultatImport = {
  aCreer: PlatACreer[]
  /** Produits écartés, avec la raison. Rien n'est envoyé à moitié renseigné. */
  ecartes: Array<{ nom: string; raison: string }>
  /** Déjà liés à un plat Zelty : ignorés, l'import ne repasse pas dessus. */
  dejaLies: number
}

const centimes = (euros: number) => Math.round(euros * 100)
/** Pourcentage → millièmes attendus par Zelty. 5,5 → 550 · 10 → 1000. */
const millieme = (pct: number) => Math.round(pct * 100)

/**
 * Taux de TVA SUR PLACE, selon la règle française.
 *
 * Notre `tva` est le taux du panneau, donc celui de l'emporter. Le recopier
 * tel quel pour la consommation sur place sous-déclarerait la TVA : un
 * croissant mangé à table est à 10 %, pas à 5,5 %. On applique donc la règle
 * légale plutôt que de recopier — sur-collecter est rattrapable, l'inverse
 * ne l'est pas.
 */
export function tauxSurPlace(contientAlcool: boolean, tauxEmporter: number): number {
  if (contientAlcool) return 20
  // La presse reste à 2,1 % quel que soit le lieu de consommation.
  if (tauxEmporter === 2.1) return 2.1
  return 10
}

export function construireImport(
  produits: ProduitLocalComplet[],
  dejaCorrespondants: Set<string>,
): ResultatImport {
  const aCreer: PlatACreer[] = []
  const ecartes: ResultatImport['ecartes'] = []
  let dejaLies = 0

  for (const p of produits) {
    if (dejaCorrespondants.has(p.id)) { dejaLies++; continue }

    if (!p.nom?.trim()) { ecartes.push({ nom: p.id, raison: 'produit sans nom' }); continue }
    if (p.prix_vente_ht == null || !Number.isFinite(Number(p.prix_vente_ht))) {
      ecartes.push({ nom: p.nom, raison: 'aucun prix de vente — Zelty l\'exige' })
      continue
    }
    const tauxEmporter = Number(p.tva)
    if (![2.1, 5.5, 10, 20].includes(tauxEmporter)) {
      ecartes.push({ nom: p.nom, raison: `taux de TVA inattendu (${p.tva})` })
      continue
    }

    const ttcEmporter = Number(p.prix_vente_ht) * (1 + tauxEmporter / 100)
    if (ttcEmporter <= 0) {
      ecartes.push({ nom: p.nom, raison: 'prix nul ou négatif' })
      continue
    }
    const surPlace = tauxSurPlace(p.contient_alcool, tauxEmporter)

    // ⚠️ Un Coca ne vaut pas le même prix dans sa canette au comptoir et dans
    // un verre consigné à une table. Envoyer le même montant des deux côtés
    // ferait facturer le tarif comptoir en salle — 70 centimes perdus à chaque
    // verre, sans que rien ne le signale. NULL = pas de tarif distinct.
    const surPlaceTtc = p.prix_sur_place_ttc == null ? null : Number(p.prix_sur_place_ttc)
    const ttcSurPlace = surPlaceTtc != null && Number.isFinite(surPlaceTtc) && surPlaceTtc > 0
      ? surPlaceTtc
      : ttcEmporter

    aCreer.push({
      // Le lien exact, écrit dès la création.
      remote_id: p.id,
      name: p.nom.trim(),
      ...(p.description?.trim() ? { description: p.description.trim() } : {}),
      // Zelty attend une URL : les nôtres sont absolues, elles fonctionnent.
      ...(p.image_url ? { image: p.image_url } : {}),
      // `price` = salle, `price_togo` = comptoir. Zelty les porte séparément,
      // et le taux change aussi : un croissant mangé à table est à 10 %, pas
      // à 5,5 %. Le prix du panneau, lui, ne bouge que si on l'a décidé.
      price: centimes(ttcSurPlace),
      price_togo: centimes(ttcEmporter),
      tax: millieme(surPlace),
      tax_takeaway: millieme(tauxEmporter),
      ...(p.actif ? {} : { disable: true }),
    })
  }

  return { aCreer, ecartes, dejaLies }
}
