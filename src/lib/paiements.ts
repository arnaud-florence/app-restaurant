// Comment un mode de paiement se lit — source UNIQUE, pure, client-safe.
//
// ⚠️⚠️ Pourquoi ce fichier existe : `business-live.ts` classait TOUT ce qui
// n'est pas espèces en CARTE (`else carte += montant`). Mesuré le 14/10/2026 :
// sur 4 610 € encaissés, **2 253,80 € s'affichaient en « carte »** alors que
// leur mode est `caisse_agreee`, c'est-à-dire INCONNU — la caisse agréée a
// encaissé, on ne sait pas comment. Le gérant lisait donc un montant carte qui
// ne correspondait à rien sur son relevé bancaire. Encore une absence rendue
// comme une affirmation, la famille de `statutFoodCost(0)` en vert.
//
// ⚠️ Et la distinction qui compte n'est pas « quel moyen » mais **« l'argent
// est-il rentré »** : un ticket EN COMPTE est une vente faite et non encaissée.
// Le confondre avec de la carte fait croire que la trésorerie est là.
//
// `jour-stats.ts` et `ventes-stats.ts` portaient déjà chacun leur version,
// correcte mais distincte — c'était la troisième implémentation qui se
// profilait. Les trois lisent désormais ceci.

/** `true` l'argent est rentré · `false` vente à crédit · `null` on ne sait pas. */
export type Encaissement = true | false | null

export type LecturePaiement = {
  /** Clé stable pour regrouper. */
  cle: string
  /** Ce qu'on affiche. */
  libelle: string
  encaisse: Encaissement
}

/**
 * ⚠️ L'ORDRE DES TESTS COMPTE. « compte » et « ardoise » passent AVANT la
 * carte : un mode nommé « À crédit » contient `credit`, que la branche carte
 * reconnaît — il serait classé « payé par carte », donc exactement à l'envers.
 *
 * ⚠️ On ne reconnaît PAS `credit` comme une vente à crédit, et c'est
 * délibéré : « Credit Card » est une carte. Le nom seul ne permet pas de
 * trancher, donc le mode de règlement de la caisse doit s'appeler
 * « Compte client », « En compte » ou « Ardoise » — jamais « Crédit ».
 */
export function libellePaiement(mode: string | null | undefined): LecturePaiement {
  // ⚠️ LES ACCENTS SONT RETIRÉS AVANT DE TESTER, et c'est le test qui l'a
  // imposé : le mode de la caisse s'appelle littéralement « Espèces », et
  // `/espece/` ne matche pas « espèces » — le `è` casse le motif. Le mode le
  // plus utilisé de la maison (294 tickets) tombait en « Non ventilé ».
  const v = String(mode ?? '').toLowerCase().normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '').trim()

  if (!v) return { cle: 'inconnu', libelle: 'Non ventilé', encaisse: null }
  if (/compte|ardoise/.test(v)) return { cle: 'en_compte', libelle: 'En compte', encaisse: false }
  if (/cash|espece|liquide/.test(v)) return { cle: 'especes', libelle: 'Espèces', encaisse: true }
  if (/pos|carte|\bcb\b|card|tpe|bank/.test(v)) return { cle: 'carte', libelle: 'Carte', encaisse: true }
  if (/ticket|resto|swile|edenred|\btrd?\b/.test(v)) return { cle: 'ticket_resto', libelle: 'Ticket restaurant', encaisse: true }
  if (/cheque|chèque/.test(v)) return { cle: 'cheque', libelle: 'Chèque', encaisse: true }
  if (/virement|transfer/.test(v)) return { cle: 'virement', libelle: 'Virement', encaisse: true }
  if (/online|en.?ligne|web|stripe|paypal/.test(v)) return { cle: 'en_ligne', libelle: 'En ligne', encaisse: true }

  // `caisse_agreee` : la caisse a encaissé, le ticket ne dit pas comment.
  // Ce n'est ni de la carte ni un impayé — c'est une information absente.
  if (v === 'caisse_agreee') return { cle: 'inconnu', libelle: 'Non ventilé', encaisse: null }

  return { cle: v, libelle: v, encaisse: null }
}
