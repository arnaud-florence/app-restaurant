/**
 * L'ARDOISE DE LA SEMAINE — ce qu'on sert, donc ce qu'on achète.
 *
 * Décision du gérant (04/10/2026) : la restauration tourne sur une ardoise.
 * Toutes les pizzas restent en permanence ; la brasserie change chaque
 * semaine ; un plat du jour, hors carte, change chaque jour mais se décide
 * une semaine à l'avance.
 *
 * ⚠️⚠️ POURQUOI CE FICHIER EXISTE. Le réassort commandait pour les 48 plats
 * de la carte, dont deux ou trois sont réellement servis. Mesuré le
 * 04/10/2026 sur les fiches techniques réelles et 230 couverts par semaine :
 *
 *   carte entière (19 + 12)   62 ingrédients   152 € de périssable jeté/sem.
 *   ardoise 8 + 10            49 ingrédients    97 €
 *   ardoise 4 + 6             36 ingrédients    97 €
 *
 * ⚠️ LE MONTANT DE LA COMMANDE NE BOUGE PRESQUE PAS (780 → 748 €), et c'est
 * contre-intuitif : 230 couverts mangent 230 plats, que la carte en propose
 * trente ou dix. Raccourcir l'ardoise ne fait pas acheter moins de matière,
 * ça la CONCENTRE sur moins de références — et c'est là qu'est le gain, dans
 * la casse : ~55 €/semaine, ~2 850 €/an.
 *
 * ⚠️⚠️ COROLLAIRE, ET C'EST LE VRAI LEVIER : le gain PLAFONNE vers dix plats.
 * Ce qui compte n'est donc pas la LONGUEUR de l'ardoise mais QUELS PLATS ON
 * MET ENSEMBLE. Dix plats qui puisent dans le socle gaspillent deux fois
 * moins que dix plats réclamant chacun sa référence propre — la crème de
 * balsamique d'un seul plat se jette à 97 %, que l'ardoise fasse dix plats
 * ou trente. D'où `coutMarginal()` : l'écran de composition doit dire ce que
 * chaque plat AJOUTE, au moment où on le choisit, pas à la poubelle du
 * dimanche.
 *
 * Tout ici est PUR : aucune base, aucun réseau.
 */

/** Un ingrédient d'une fiche technique, ou d'un plat du jour. */
export type LigneComposition = {
  ingredient_id: string
  /** Par portion servie. */
  quantite: number
  unite: string
}

export type PlatArdoise = {
  id: string
  nom: string
  /** `PIZZA` passe au service du soir, le reste au midi + ven/sam soir. */
  carte: 'PIZZA' | 'CUISINE'
  composition: LigneComposition[]
}

export type Matiere = {
  id: string
  nom: string
  unite: string
  /** Prix de l'unité ACHETÉE. `null` = inconnu, jamais zéro (0158). */
  prix_achat_ht: number | null
  /**
   * Le plus petit lot qu'on puisse acheter, dans l'unité de la matière.
   * ⚠️ C'est LUI qui crée la casse : on n'achète pas 0,23 kg de courgettes
   * grillées, on achète le kilo, et on jette 77 %.
   */
  conditionnement?: number
  /**
   * Combien de jours la matière tient une fois reçue.
   * ⚠️ `null` = INCONNU, et surtout pas « se garde ». Mesuré le 04/10/2026 :
   * renseignée sur 4 ingrédients sur 117, et les quatre sont des rescapés du
   * jeu de démonstration. Tant qu'elle manque, aucun écran ne doit trancher
   * entre « périssable » et « de garde » — classer sur le NOM produit des
   * faux positifs (la crème de balsamique n'est pas un périssable).
   */
  dlc_jours?: number | null
}

/**
 * LE VOLUME DE LA SEMAINE, en couverts assis.
 *
 * ⚠️ Ces nombres sont une DÉCISION du gérant, pas une mesure : la
 * restauration n'a pas encore servi un seul couvert. Ils sont donc un
 * paramètre explicite, jamais une constante enfouie — c'est la seule façon
 * qu'ils se corrigent quand les vraies ventes arriveront.
 */
export type Volume = {
  /** Couverts par service du midi (brasserie, 7 j/7). */
  midi: number
  /** Couverts le soir du vendredi et du samedi (brasserie + pizzeria). */
  soirWeekEnd: number
  /** Couverts le soir du dimanche au jeudi (pizzeria). */
  soirSemaine: number
  /**
   * Pizzas à emporter par soir.
   * ⚠️ Elles ne sont PAS dans les couverts assis — le gérant l'a précisé — et
   * ce sont elles qui portent les pâtons, la sauce et la mozzarella. À zéro,
   * le socle pizzeria est sous-dimensionné et rien ne le signale.
   */
  pizzasAEmporter: number
}

/**
 * LE VOLUME DE CASATASIA — décision du gérant, 04/10/2026.
 *
 * ⚠️ Ce ne sont PAS des mesures : la restauration n'a pas encore servi un
 * couvert. Ils vivent ici, nommés et datés, plutôt que dispersés dans les
 * écrans — c'est la seule façon qu'ils se corrigent d'un seul geste quand
 * les vraies ventes arriveront.
 *
 * ⚠️ Les 30 pizzas à emporter S'AJOUTENT aux couverts assis. Les compter
 * dedans avait sous-dimensionné le socle pizzeria d'un tiers en septembre
 * — pâton 210 au lieu de 280 : la rupture du samedi soir.
 */
export const VOLUME_CASATASIA: Volume = {
  midi: 20,
  soirWeekEnd: 20,
  soirSemaine: 10,
  pizzasAEmporter: 30,
}

/** Les portions d'une semaine, par carte. */
export function portionsSemaine(v: Volume): { CUISINE: number; PIZZA: number } {
  // ⚠️ Le vendredi et le samedi soir, les DEUX cartes tournent (règle de
  // `services-restaurant.ts`). On partage ces couverts en deux faute de
  // mieux : inventer une pondération aurait l'air d'un savoir.
  const soirWE = v.soirWeekEnd * 2
  return {
    CUISINE: v.midi * 7 + soirWE / 2,
    PIZZA: v.soirSemaine * 5 + soirWE / 2 + v.pizzasAEmporter * 7,
  }
}

/**
 * CE QU'IL FAUT ACHETER POUR LA SEMAINE, matière par matière.
 *
 * ⚠️ Les portions se répartissent UNIFORMÉMENT sur les plats de l'ardoise.
 * C'est faux — la margherita se vendra plus que la signature — mais c'est la
 * seule hypothèse neutre tant qu'aucune vente n'existe, et l'erreur se
 * corrige d'elle-même après deux semaines. Une pondération inventée aurait
 * l'air d'un savoir (même doctrine que les cibles de stock, 0163).
 */
export function besoinSemaine(ardoise: PlatArdoise[], v: Volume): Map<string, number> {
  const p = portionsSemaine(v)
  const besoin = new Map<string, number>()
  for (const carte of ['CUISINE', 'PIZZA'] as const) {
    const plats = ardoise.filter(x => x.carte === carte)
    if (plats.length === 0) continue
    const parPlat = p[carte] / plats.length
    for (const plat of plats) {
      for (const l of plat.composition) {
        besoin.set(l.ingredient_id, (besoin.get(l.ingredient_id) ?? 0) + l.quantite * parPlat)
      }
    }
  }
  return besoin
}

export type LigneAchat = {
  ingredient_id: string
  nom: string
  unite: string
  /** Ce que l'ardoise consomme réellement. */
  besoin: number
  /** Ce qu'on est obligé d'acheter, au conditionnement près. */
  achat: number
  /**
   * `achat − besoin` : CE QUI RESTE en fin de semaine.
   *
   * ⚠️⚠️ CE N'EST PAS DE LA CASSE, et l'appeler ainsi était faux. Mesuré sur
   * l'ardoise du 12 octobre : sur 171 € de reliquat, les épices à tajine
   * (16,56 €), la crème de balsamique (11,06 €) et le pesto (11,52 €) se
   * gardent des mois — c'est du STOCK pour la semaine suivante, pas une
   * perte. Seul le reliquat d'un PÉRISSABLE se jette.
   *
   * ⚠️ Et on ne peut pas trancher aujourd'hui : `dlc_moyenne_jours` est
   * renseignée sur 4 ingrédients sur 117. D'où `perissable`, qui vaut `null`
   * quand on ne sait pas — et un écran qui additionne les `null` dans « ce
   * qu'on jette » ment, comme l'ancien libellé le faisait.
   */
  perte: number
  /**
   * La matière se périme-t-elle dans la semaine ?
   * `null` = DLC inconnue, et surtout pas « se garde ».
   */
  perissable: boolean | null
  /** `null` quand le prix est inconnu — jamais zéro (0158). */
  coutHT: number | null
  /** La valeur du RELIQUAT. Perte seulement si `perissable` est vrai. */
  perteHT: number | null
  /** Combien de plats de l'ardoise l'utilisent. 1 = spécifique, ≥4 = socle. */
  plats: number
}

/**
 * LA LISTE D'ACHAT DE LA SEMAINE, avec ce qu'elle va coûter en casse.
 *
 * ⚠️ `conditionnement` par défaut à 1 : c'est le plancher honnête quand on
 * ignore le colisage — on achète au moins une unité. Le mettre à 0 ferait
 * croire qu'on peut acheter 0,03 L de crème de balsamique.
 */
export function listeAchat(
  ardoise: PlatArdoise[],
  v: Volume,
  matieres: Map<string, Matiere>,
): LigneAchat[] {
  const besoin = besoinSemaine(ardoise, v)
  const usage = new Map<string, number>()
  for (const plat of ardoise) {
    for (const l of plat.composition) usage.set(l.ingredient_id, (usage.get(l.ingredient_id) ?? 0) + 1)
  }
  const lignes: LigneAchat[] = []
  for (const [id, q] of besoin) {
    const m = matieres.get(id)
    if (!m) continue
    const lot = m.conditionnement && m.conditionnement > 0 ? m.conditionnement : 1
    const achat = Math.ceil(q / lot) * lot
    const perte = Math.round((achat - q) * 1000) / 1000
    const pu = m.prix_achat_ht
    // ⚠️ Moins de 7 jours = ce qui ne passe pas la semaine. `null` quand la
    // DLC n'est pas renseignée : une absence n'est pas un « ça se garde ».
    const perissable = m.dlc_jours == null ? null : m.dlc_jours < 7
    lignes.push({
      ingredient_id: id, nom: m.nom, unite: m.unite,
      besoin: Math.round(q * 1000) / 1000,
      achat, perte, perissable,
      coutHT: pu == null ? null : Math.round(achat * pu * 100) / 100,
      perteHT: pu == null ? null : Math.round(perte * pu * 100) / 100,
      plats: usage.get(id) ?? 0,
    })
  }
  return lignes.sort((a, b) => (b.perteHT ?? 0) - (a.perteHT ?? 0))
}

/** Les matières présentes quoi qu'il arrive — le socle de la cuisine. */
export const SEUIL_SOCLE = 4
export function socle(lignes: LigneAchat[]): LigneAchat[] {
  return lignes.filter(l => l.plats >= SEUIL_SOCLE)
}
/** Celles qui ne servent qu'à UN plat : elles disparaissent avec lui. */
export function specifiques(lignes: LigneAchat[]): LigneAchat[] {
  return lignes.filter(l => l.plats === 1)
}

/**
 * CE QUE COÛTE D'AJOUTER UN PLAT À L'ARDOISE — la question qu'on se pose au
 * moment de composer, et à laquelle rien ne répondait.
 *
 * ⚠️ On compare deux ardoises COMPLÈTES plutôt que de sommer les besoins du
 * plat seul : ajouter un plat redistribue les portions sur un plat de plus,
 * donc il allège aussi les autres. Sommer naïvement surestimerait le coût et
 * découragerait d'allonger l'ardoise.
 */
export function coutMarginal(
  ardoise: PlatArdoise[],
  candidat: PlatArdoise,
  v: Volume,
  matieres: Map<string, Matiere>,
): { referencesNouvelles: number; deltaAchatHT: number | null; deltaPerteHT: number | null } {
  const avant = listeAchat(ardoise, v, matieres)
  const apres = listeAchat([...ardoise, candidat], v, matieres)
  const connus = new Set(avant.map(l => l.ingredient_id))
  // ⚠️ Un total qui saute les prix inconnus se présenterait comme ferme : on
  // rend `null` dès qu'une ligne concernée n'a pas de prix (0160).
  const somme = (ls: LigneAchat[], f: (l: LigneAchat) => number | null) =>
    ls.some(l => f(l) == null) ? null : ls.reduce((s, l) => s + (f(l) as number), 0)
  const a = somme(avant, l => l.coutHT), b = somme(apres, l => l.coutHT)
  const pa = somme(avant, l => l.perteHT), pb = somme(apres, l => l.perteHT)
  return {
    referencesNouvelles: apres.filter(l => !connus.has(l.ingredient_id)).length,
    deltaAchatHT: a == null || b == null ? null : Math.round((b - a) * 100) / 100,
    deltaPerteHT: pa == null || pb == null ? null : Math.round((pb - pa) * 100) / 100,
  }
}
