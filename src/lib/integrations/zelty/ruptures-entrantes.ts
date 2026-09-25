// ─── Ruptures : caisse Zelty → outil ─────────────────────────────────────
//
// Le sens qui manquait. `(ops)/ruptures` pousse nos ruptures vers la caisse
// depuis la 0141, mais l'inverse n'existait pas : un plat marqué en rupture
// SUR LA CAISSE — le geste naturel quand on s'en aperçoit en servant — ne
// redescendait pas, et casatasia.fr continuait de le vendre.
//
// Traduction PURE : aucun réseau, aucune base. Tout l'inconnu reste dehors.

/** Une ligne de `GET /restaurants/{id}/dishes_availability`. */
export type DispoZelty = {
  id_dish: number
  /** NOTRE identifiant, écrit dans `remote_id` à l'import. */
  dish_remote_id?: string | null
  outofstock?: boolean | null
}

/** Ce que l'outil sait déjà d'un produit. */
export type ProduitCourant = {
  id: string
  nom: string
  /** Date de rupture, ou null. Une rupture est datée : elle se périme seule. */
  rupture_le: string | null
}

export type Decision = {
  /** Produits à marquer en rupture aujourd'hui. */
  aMarquer: { id: string; nom: string }[]
  /** Déjà en rupture chez nous : rien à écrire. */
  dejaConnus: string[]
  /** Signalés par la caisse mais introuvables chez nous. */
  inconnus: number[]
  avertissements: string[]
}

/**
 * Que faire de ce que la caisse déclare.
 *
 * ⚠️⚠️ ON N'AJOUTE QUE DES RUPTURES. ON N'EN LÈVE JAMAIS.
 *
 * C'est la règle centrale, et elle n'est pas un excès de prudence :
 *
 * 1. **`outofstock: false` est la valeur PAR DÉFAUT de tout plat que personne
 *    n'a touché.** Les 181 plats du compte sont à `false` aujourd'hui. Ça ne
 *    veut pas dire « quelqu'un a vérifié qu'il y en a », ça veut dire « rien
 *    n'a été déclaré ». C'est exactement la faute de la 0138 — un tableau
 *    d'allergènes vide lu comme « aucun allergène » — et celle de
 *    `statutFoodCost(0)`, qui affichait en vert le produit dont on savait le
 *    moins. Une absence n'est pas une affirmation.
 *
 * 2. **Lever une rupture effacerait le geste de l'équipe, en silence.**
 *    Quelqu'un marque « plus de croissants » sur la tablette du comptoir ;
 *    personne ne touche à la caisse, qui reste donc à `false` ; le passage
 *    suivant lèverait la rupture et le site se remettrait à vendre des
 *    croissants qui n'existent pas. Trente secondes après la saisie, sans
 *    un message.
 *
 * 3. **Les deux erreurs ne coûtent pas la même chose.** Une fausse rupture
 *    fait perdre une vente. Une fausse disponibilité fait venir un client
 *    chercher un produit qu'on n'a pas — et ça, il le raconte.
 *
 * La levée reste donc un geste humain, dans `(ops)/ruptures`. Et elle se fait
 * toute seule de toute façon : `rupture_le` est DATÉ, il se périme le
 * lendemain.
 */
export function deciderRuptures(
  dispos: DispoZelty[],
  produits: ProduitCourant[],
  aujourdhui: string,
): Decision {
  const parId = new Map(produits.map(p => [p.id, p]))
  const d: Decision = { aMarquer: [], dejaConnus: [], inconnus: [], avertissements: [] }

  // ⚠️ Une liste VIDE n'est pas « aucune rupture », c'est une lecture ratée.
  // Sans ce garde-fou, une réponse tronquée passerait pour un catalogue sain.
  if (dispos.length === 0) {
    d.avertissements.push(
      'la caisse n\'a rendu AUCUNE disponibilité — lecture probablement ratée, rien n\'est écrit')
    return d
  }

  for (const z of dispos) {
    if (z.outofstock !== true) continue

    // ⚠️ Le rapprochement se fait sur `dish_remote_id`, qui porte NOTRE uuid
    // depuis l'import. Pas de rapprochement par le nom ici : un faux positif
    // retirerait un produit de la vente, et personne ne saurait pourquoi.
    const ref = z.dish_remote_id
    if (!ref) { d.inconnus.push(z.id_dish); continue }
    const p = parId.get(ref)
    if (!p) { d.inconnus.push(z.id_dish); continue }

    if (p.rupture_le === aujourdhui) { d.dejaConnus.push(p.nom); continue }
    d.aMarquer.push({ id: p.id, nom: p.nom })
  }

  if (d.inconnus.length > 0) {
    // Signalé, jamais créé : inventer une fiche à partir d'une rupture
    // doublonnerait nos produits sans nom, sans prix et sans photo.
    d.avertissements.push(
      `${d.inconnus.length} plat(s) en rupture chez la caisse sans correspondance ici`)
  }
  return d
}
