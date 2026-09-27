// La plateforme d'achat — un seul catalogue, tous fournisseurs.
//
// L'outil savait comparer ce qu'on achète DÉJÀ (`/admin/tarifs-fournisseurs`,
// 0151/0152). Il ne savait pas répondre à « est-ce que quelqu'un a ça ? ».
// Les 2 892 références du portail Gineys (0158) rendent la question utile :
// le catalogue d'un grossiste couvre bien plus que nos quarante matières.
//
// Règles PURES : aucun réseau, aucune base. Testables sans compte.

/** Ce que la remise vaut comme information. */
export type EtatRemise =
  /** Prix négocié CONFIRMÉ — vérifié contre nos factures. */
  | 'negocie'
  /** Tarif public CONFIRMÉ. */
  | 'public'
  /** Personne n'a vérifié. ⚠️ Ce n'est PAS « non remisé ». */
  | 'inconnu'

export type ArticleAchat = {
  id: string
  /** Famille du fournisseur (son rayon à lui). NULL = pas encore relevée. */
  famille: string | null
  /** Clé de comparaison, quand un humain l'a posée. */
  cle: string | null
  /** Prix ramené à l'unité de référence, quand il est calculable. */
  ref: { prix: number; unite: string } | null
  /** Vrai si cette ligne est la MOINS CHÈRE de son groupe comparable. */
  meilleur: boolean
  fournisseur_id: string
  fournisseur_nom: string
  reference: string
  designation: string
  unite: string
  /** NULL = prix sur demande. ⚠️ Jamais 0 : il sortirait « le moins cher ». */
  prix_ht: number | null
  remise_pct: number | null
  tarif_negocie: boolean | null
  achete: boolean
  remise_demandee_le: string | null
  date_tarif: string
  nature: string
}

/**
 * ⚠️ TROIS ÉTATS, PAS DEUX. `tarif_negocie` à NULL veut dire « personne n'a
 * vérifié », pas « pas de remise ». Le rendre en « non remisé » serait une
 * affirmation qu'on ne peut pas tenir — même faute que le tableau
 * d'allergènes vide lu « aucun allergène » (0138). Et c'est justement
 * l'état `inconnu` qui doit déclencher la demande au fournisseur : le
 * confondre avec « public » la rendrait inutile.
 */
export function etatRemise(a: Pick<ArticleAchat, 'tarif_negocie'>): EtatRemise {
  if (a.tarif_negocie === true) return 'negocie'
  if (a.tarif_negocie === false) return 'public'
  return 'inconnu'
}

export const LIBELLE_REMISE: Record<EtatRemise, string> = {
  negocie: 'Remisé',
  public: 'Tarif public',
  inconnu: 'Remise inconnue',
}

/** Mots significatifs d'un libellé, pour la recherche. */
export function motsCles(s: string): string[] {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toUpperCase().split(/[^A-Z0-9]+/).filter(Boolean)
}

/**
 * La recherche : TOUS les mots saisis doivent se retrouver, en préfixe.
 *
 * ⚠️ Le préfixe, et pas l'égalité : « mozza » doit trouver « MOZZARELLA ».
 * ⚠️ Mais TOUS les mots, et pas au moins un : sur 3 300 références, un « ou »
 * rend la moitié du catalogue et la recherche ne sert plus à rien.
 * La référence est comparée telle quelle — on la colle souvent entière.
 */
export function correspond(a: Pick<ArticleAchat, 'designation' | 'reference'>, requete: string): boolean {
  const termes = motsCles(requete)
  if (!termes.length) return true
  const cibles = motsCles(a.designation)
  const ref = (a.reference || '').toUpperCase()
  return termes.every(t =>
    ref.includes(t) || cibles.some(c => c.startsWith(t)))
}

export type Filtres = {
  requete: string
  fournisseur_id: string | null
  /** `undefined` = toutes ; `null` = seulement les non classés. */
  famille: string | null | undefined
  remise: EtatRemise | null
  /** N'afficher que ce qu'on achète déjà. */
  achetes: boolean
  /** N'afficher que les promotions en cours. */
  promos: boolean
  /** N'afficher que les « prix sur demande ». */
  sansPrix: boolean
}

export const FILTRES_VIDES: Filtres = {
  requete: '', fournisseur_id: null, remise: null, famille: undefined,
  achetes: false, promos: false, sansPrix: false,
}

export function filtrer(articles: ArticleAchat[], f: Filtres): ArticleAchat[] {
  return articles.filter(a => {
    if (f.fournisseur_id && a.fournisseur_id !== f.fournisseur_id) return false
    // ⚠️ Comparaison insensible à la CASSE : le menu fusionne « Boissons » et
    // « BOISSONS », donc le filtre doit retenir les deux.
    if (f.famille !== undefined) {
      if (f.famille === null) { if (a.famille) return false }
      else if ((a.famille ?? '').toLowerCase() !== f.famille.toLowerCase()) return false
    }
    if (f.remise && etatRemise(a) !== f.remise) return false
    if (f.achetes && !a.achete) return false
    if (f.promos && !a.remise_pct) return false
    if (f.sansPrix && a.prix_ht !== null) return false
    return correspond(a, f.requete)
  })
}

/**
 * Le message envoyé au fournisseur.
 *
 * ⚠️ Il porte la RÉFÉRENCE de chaque article, pas seulement le libellé : un
 * commercial qui doit retrouver « BAGUETTE PRECUITE 280G » dans son propre
 * catalogue chiffrera peut-être autre chose, et une remise accordée sur le
 * mauvais produit se découvre à la livraison. C'est la leçon du tableau
 * Euro-Cash (« les codes sont TIRÉS du PDF, jamais recopiés »).
 *
 * ⚠️ Il ne cite AUCUN prix d'un autre fournisseur. Divulguer un tarif négocié
 * ailleurs est une décision de négociation, pas un automatisme — c'est déjà
 * la règle posée sur les deux lignes France Boissons du tableau Euro-Cash.
 */
export function messageDemandeRemise(input: {
  fournisseur: string
  articles: Pick<ArticleAchat, 'reference' | 'designation' | 'prix_ht' | 'unite'>[]
  etablissement?: string
}): { objet: string; texte: string } {
  const nom = input.etablissement ?? 'CASATASIA'
  const n = input.articles.length
  const lignes = input.articles.map(a => {
    const prix = a.prix_ht == null
      ? 'prix sur demande'
      : `${a.prix_ht.toFixed(3).replace('.', ',')} € / ${a.unite}`
    return `  · ${a.reference} — ${a.designation} (affiché : ${prix})`
  })
  const texte = [
    `Bonjour,`,
    ``,
    `Nous ouvrons notre établissement et souhaitons connaître vos conditions`,
    `sur ${n === 1 ? 'la référence suivante' : `les ${n} références suivantes`} :`,
    ``,
    ...lignes,
    ``,
    `Pourriez-vous nous indiquer, pour chacune, le prix remisé applicable à`,
    `notre compte ainsi que le conditionnement de commande ?`,
    ``,
    `Merci d'avance,`,
    nom,
  ].join('\n')
  return {
    objet: `${nom} — demande de conditions tarifaires (${n} référence${n > 1 ? 's' : ''})`,
    texte,
  }
}


// ─── Les promotions du moment ────────────────────────────────────────

/**
 * ⚠️ UNE PROMO A UNE DATE DE PÉREMPTION, ET ELLE NE LA DIT PAS.
 *
 * Les remises relevées au portail sont celles du jour du relevé. Affichées
 * trois mois plus tard comme « promos du moment », elles feraient commander
 * au tarif plein en croyant profiter d'une affaire — la faute déjà
 * documentée sur les 26 prix Gel Var, « promotions de septembre » qu'un
 * comparateur aurait prises pour le tarif courant.
 *
 * On ne masque pas les vieilles promos — on les DATE, et on dit leur âge.
 */
export const FRAICHEUR_JOURS = { fraiche: 7, tiede: 30 } as const
export type Fraicheur = 'fraiche' | 'tiede' | 'perimee'

export function fraicheur(dateTarif: string, aujourdhui = new Date()): Fraicheur {
  const j = Math.floor((aujourdhui.getTime() - new Date(dateTarif + 'T00:00:00Z').getTime()) / 86_400_000)
  if (j <= FRAICHEUR_JOURS.fraiche) return 'fraiche'
  if (j <= FRAICHEUR_JOURS.tiede) return 'tiede'
  return 'perimee'
}

export function joursDepuis(dateTarif: string, aujourdhui = new Date()): number {
  return Math.max(0, Math.floor((aujourdhui.getTime() - new Date(dateTarif + 'T00:00:00Z').getTime()) / 86_400_000))
}

/**
 * Les promotions, de la plus forte à la plus faible.
 *
 * ⚠️ Une remise sur un article qu'on n'achète pas n'est pas une affaire,
 * c'est une tentation. Celles qui portent sur nos articles remontent en
 * tête — `interessante` les marque.
 */
export function promotions(articles: ArticleAchat[], aujourdhui = new Date()): Array<ArticleAchat & {
  age: number; etat: Fraicheur; interessante: boolean
}> {
  return articles
    .filter(a => a.remise_pct != null && a.remise_pct > 0)
    .map(a => ({
      ...a,
      age: joursDepuis(a.date_tarif, aujourdhui),
      etat: fraicheur(a.date_tarif, aujourdhui),
      // ⚠️ « Intéressante » veut dire : sur un produit qu'on achète DÉJÀ, ou
      // qu'on a pris la peine de rattacher. Le reste est du catalogue.
      interessante: a.achete || a.cle != null,
    }))
    .sort((x, y) =>
      Number(y.interessante) - Number(x.interessante)
      || (y.remise_pct ?? 0) - (x.remise_pct ?? 0))
}

/**
 * Les familles présentes, avec leur effectif. NULL regroupé en « non classé ».
 *
 * ⚠️ Les variantes de CASSE sont fusionnées : chaque fournisseur écrit ses
 * rayons à sa façon, et « Boissons » face à « BOISSONS » ferait deux entrées
 * dans le menu pour une seule idée. On garde l'orthographe la plus fréquente.
 * ⚠️ On ne fusionne QUE la casse : « SECS » et « Sauce » viennent de deux
 * taxonomies différentes et ne se rapprochent pas.
 */
export function familles(articles: ArticleAchat[]): Array<{ nom: string | null; n: number; variantes: string[] }> {
  const m = new Map<string, { n: number; formes: Map<string, number> }>()
  let sans = 0
  for (const a of articles) {
    if (!a.famille) { sans++; continue }
    const k = a.famille.toLowerCase()
    const e = m.get(k) ?? { n: 0, formes: new Map() }
    e.n++; e.formes.set(a.famille, (e.formes.get(a.famille) ?? 0) + 1)
    m.set(k, e)
  }
  const out: Array<{ nom: string | null; n: number; variantes: string[] }> = [...m.values()].map(e => {
    const formes = [...e.formes].sort((x, y) => y[1] - x[1])
    return { nom: formes[0][0], n: e.n, variantes: formes.map(f => f[0]) }
  }).sort((a, b) => b.n - a.n)
  if (sans) out.push({ nom: null, n: sans, variantes: [] })
  return out
}


// ─── Les offres conditionnelles d'un fournisseur (0161) ──────────────

export type OffreFournisseur = {
  id: string
  fournisseur_nom: string
  libelle: string
  type: 'gratuite' | 'remise_montant' | 'remise_pct' | 'prix_promo'
  seuil_quantite: number | null
  seuil_unite: string | null
  avantage: number | null
  date_debut: string | null
  date_fin: string | null
  releve_le: string
}

/**
 * Dans combien de jours l'offre se termine. NULL = elle ne le dit pas.
 *
 * ⚠️ NÉGATIF veut dire TERMINÉE. On ne masque pas une offre expirée — on
 * l'affiche barrée : la faire disparaître laisserait croire qu'on n'a rien
 * relevé, alors qu'on a relevé une offre qui a pris fin.
 */
export function joursRestants(o: Pick<OffreFournisseur, 'date_fin'>, aujourdhui = new Date()): number | null {
  if (!o.date_fin) return null
  return Math.ceil((new Date(o.date_fin + 'T00:00:00Z').getTime() - aujourdhui.getTime()) / 86_400_000)
}

/** Les offres, les plus urgentes d'abord ; les terminées à la fin. */
export function offresTriees(offres: OffreFournisseur[], aujourdhui = new Date()): Array<OffreFournisseur & { restants: number | null; finie: boolean }> {
  return offres
    .map(o => {
      const restants = joursRestants(o, aujourdhui)
      return { ...o, restants, finie: restants !== null && restants < 0 }
    })
    .sort((a, b) =>
      Number(a.finie) - Number(b.finie)
      || (a.restants ?? 9999) - (b.restants ?? 9999))
}

// ─── L'ÉTAT DE LA PLATEFORME ────────────────────────────────────────────
//
// « Qu'est-ce qui est en place ? » n'avait pas de réponse dans l'outil : il
// fallait relancer un script pour le savoir, donc personne ne le savait.
// Un chantier dont on ne voit pas l'avancement est un chantier qu'on croit
// fini — et ici « fini » voudrait dire qu'on arbitre ses fournisseurs sur
// une surface de comparaison de 22 lignes en la croyant complète.

/** Un groupe de comparaison, tel que `comparer()` le rend. */
export type GroupeComparaison = {
  cle: string
  /** Toutes les lignes ont pu être ramenées à la même base. */
  comparable: boolean
  /** Nombre de fournisseurs DISTINCTS dans le groupe. */
  fournisseurs: number
  /** Écart entre le moins cher et le plus cher, en %, si comparable. */
  ecartPct: number | null
}

export type LigneFournisseurEtat = {
  nom: string
  lignes: number
  avecPrix: number
  /** Répartition par nature : facture / devis / portail / catalogue. */
  natures: Array<{ nature: string; n: number }>
  email: string | null
  /** Tarif le plus récent connu pour ce fournisseur. */
  dernierTarif: string | null
}

export type Manque = {
  /** Ce qui manque, en une phrase. */
  quoi: string
  /** Combien, quand ça se compte. */
  combien: number | null
  /** Pourquoi ça compte — jamais une simple constatation. */
  consequence: string
}

export type EtatPlateforme = {
  lignes: number
  fournisseurs: number
  avecPrix: number
  /** ⚠️ Prix sur demande. Ni zéro, ni exclu : à demander. */
  sansPrix: number
  avecFamille: number
  /** Clés de comparaison posées à la main. */
  cles: number
  /** Les VRAIS face-à-face : ≥ 2 fournisseurs ET comparables. */
  faceAFace: number
  /** Groupes à ≥ 2 fournisseurs mais dont les unités ne concordent pas. */
  nonComparables: number
  /** Groupes d'un seul fournisseur : ce n'est pas une comparaison. */
  seul: number
  remises: Record<EtatRemise, number>
  demandees: number
  achetes: number
  promos: number
  parFournisseur: LigneFournisseurEtat[]
}

export function etatPlateforme(
  articles: ArticleAchat[],
  offres: OffreFournisseur[],
  fournisseurs: Array<{ id: string; nom: string; email: string | null; actif: boolean }>,
  groupes: GroupeComparaison[],
): EtatPlateforme {
  const remises: Record<EtatRemise, number> = { negocie: 0, public: 0, inconnu: 0 }
  const parF = new Map<string, LigneFournisseurEtat & { _nat: Map<string, number> }>()

  for (const f of fournisseurs) {
    if (!f.actif) continue
    parF.set(f.id, { nom: f.nom, lignes: 0, avecPrix: 0, natures: [], email: f.email, dernierTarif: null, _nat: new Map() })
  }

  for (const a of articles) {
    remises[etatRemise(a)]++
    let e = parF.get(a.fournisseur_id)
    // Un fournisseur désactivé peut porter des lignes (Lavazza) : on le
    // montre quand même, sinon des lignes existent sans être attribuées.
    if (!e) {
      e = { nom: a.fournisseur_nom, lignes: 0, avecPrix: 0, natures: [], email: null, dernierTarif: null, _nat: new Map() }
      parF.set(a.fournisseur_id, e)
    }
    e.lignes++
    if (a.prix_ht != null) e.avecPrix++
    e._nat.set(a.nature, (e._nat.get(a.nature) ?? 0) + 1)
    if (!e.dernierTarif || a.date_tarif > e.dernierTarif) e.dernierTarif = a.date_tarif
  }

  const liste = [...parF.values()]
    .map(e => ({
      nom: e.nom, lignes: e.lignes, avecPrix: e.avecPrix, email: e.email, dernierTarif: e.dernierTarif,
      natures: [...e._nat.entries()].map(([nature, n]) => ({ nature, n })).sort((a, b) => b.n - a.n),
    }))
    .sort((a, b) => b.lignes - a.lignes)

  // ⚠️ UN FACE-À-FACE EXIGE DEUX CONDITIONS, pas une. Deux fournisseurs ne
  // suffisent pas si les unités ne concordent pas — c'est le cas du colis
  // de 3 000 serviettes face au paquet de 200, qui affichait « −97 % ».
  // Et un groupe d'un seul fournisseur ne compare rien du tout.
  const aDeux = groupes.filter(g => g.fournisseurs >= 2)

  return {
    lignes: articles.length,
    fournisseurs: liste.length,
    avecPrix: articles.filter(a => a.prix_ht != null).length,
    sansPrix: articles.filter(a => a.prix_ht == null).length,
    avecFamille: articles.filter(a => a.famille).length,
    cles: groupes.length,
    faceAFace: aDeux.filter(g => g.comparable).length,
    nonComparables: aDeux.filter(g => !g.comparable).length,
    seul: groupes.length - aDeux.length,
    remises,
    demandees: articles.filter(a => a.remise_demandee_le).length,
    achetes: articles.filter(a => a.achete).length,
    promos: offres.length,
    parFournisseur: liste,
  }
}

/**
 * ⚠️ CE QUI MANQUE, DIT EN TOUTES LETTRES.
 *
 * Un écran qui n'affiche que ce qu'il a laisse croire que c'est tout ce
 * qu'il y a. Même raisonnement que la fiche technique, qui dit « aucune
 * composition saisie » plutôt que de paraître complète : la conséquence est
 * nommée, pas seulement le trou — sinon la liste se lit comme une plainte
 * et personne n'agit.
 */
export function manques(e: EtatPlateforme, matieresSansOffre: number): Manque[] {
  const m: Manque[] = []

  if (matieresSansOffre > 0) m.push({
    quoi: 'matières suivies au stock sans AUCUNE offre fournisseur',
    combien: matieresSansOffre,
    consequence: 'on ne peut pas savoir si on les paie au bon prix — ni les commander ailleurs.',
  })

  const sansEmail = e.parFournisseur.filter(f => !f.email).length
  if (sansEmail > 0) m.push({
    quoi: 'fournisseurs sans adresse e-mail',
    combien: sansEmail,
    consequence: 'aucun bon de commande ni demande de conditions ne peut partir chez eux.',
  })

  if (e.remises.inconnu > 0) m.push({
    quoi: 'références dont on ignore si le prix porte notre remise',
    combien: e.remises.inconnu,
    consequence: '« inconnu » n’est pas « tarif public » : c’est exactement ce qu’il faut demander.',
  })

  if (e.nonComparables > 0) m.push({
    quoi: 'groupes à plusieurs fournisseurs dont les unités ne concordent pas',
    combien: e.nonComparables,
    consequence: 'un colis face à une pièce donnerait un écart faux — la contenance se tranche à la main.',
  })

  const sansFamille = e.lignes - e.avecFamille
  if (sansFamille > 0) m.push({
    quoi: 'références sans famille',
    combien: sansFamille,
    consequence: 'elles sont introuvables par le filtre par catégorie, seulement par la recherche.',
  })

  if (e.sansPrix > 0) m.push({
    quoi: 'références à « prix sur demande »',
    combien: e.sansPrix,
    consequence: 'jamais comptées pour zéro — ce sont celles pour lesquelles il faut écrire.',
  })

  // ⚠️ Celui-ci n'est pas un chiffre, et c'est le plus structurant : aucune
  // de ces sources ne se rafraîchit toute seule. Le taire ferait croire à
  // des prix vivants alors qu'ils datent du dernier relevé.
  m.push({
    quoi: 'aucun fournisseur n’expose d’API',
    combien: null,
    consequence: 'tous ces prix datent du dernier relevé manuel et ne se mettent jamais à jour seuls.',
  })

  return m
}
