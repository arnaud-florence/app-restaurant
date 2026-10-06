import { mots, MOTS_COMMUNS_MINIMUM, prixReferenceMatiere } from '@/lib/tarifs-fournisseurs'
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
  /**
   * Prix ramené à l'unité de référence, quand il est calculable.
   *
   * ⚠️ `format` porte le format de conserve (« 5/1 »). Deux boîtes 5/1 se
   * comparent au prix de la boîte, mais une 4/4 n'a pas le même poids net :
   * sans ce champ, la comparaison de recherche opposerait les deux et la
   * 4/4 gagnerait à tous les coups.
   */
  ref: { prix: number; unite: string; format?: string | null } | null
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

/**
 * ⚠️ « Tarif public » ne veut pas dire « remise refusée », mais « remise
 * JAMAIS DEMANDÉE ». La nuance décide de ce qu'on fait ensuite : un tarif
 * refusé se subit, un tarif jamais demandé s'obtient en écrivant. Le
 * libellé le dit, sinon 2 400 références passeraient pour un sujet clos.
 */
export const LIBELLE_REMISE: Record<EtatRemise, string> = {
  negocie: 'Remisé',
  public: 'Tarif public — remise à demander',
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

// ─── NOTRE CATALOGUE D'ACHAT ────────────────────────────────────────────
//
// `/admin/achats` répond à « qui vend ça, et à quel prix ». Il ne répondait
// pas à la question la plus quotidienne : **qu'est-ce que NOUS achetons,
// chez qui, à quel prix, sous quelle référence**. L'information existait —
// éparpillée entre `/admin/ingredients`, `/admin/recettes`,
// `/admin/reassort` et les factures — donc introuvable d'un coup d'œil.

export type ArticleAchete = {
  cle: string
  /** Le libellé d'ACHAT — celui qu'on cite au fournisseur. */
  nom: string
  /** Le nom de vitrine, quand il diffère et qu'il est sans ambiguïté. */
  nom_vente: string | null
  /** Matière première, ou famille du produit revendu. */
  categorie: string | null
  /** L'étage : Fournil, bar, restauration. */
  etablissement: string | null
  unite: string | null
  fournisseur: string | null
  /** Ce qu'on cite au fournisseur pour commander. */
  reference: string | null
  prix: number | null
  /** ⚠️ Le prix est une HYPOTHÈSE, pas un relevé (0165). */
  estime: boolean
  /** Dernière facture où la référence apparaît. */
  dernier_achat: string | null
  /** Moins cher ailleurs, quand la comparaison tient. */
  ailleurs: { fournisseur: string; ecartPct: number } | null
  /**
   * Les offres concurrentes moins chères, triées du moins cher au plus
   * cher. ⚠️ On les montre TOUTES, pas seulement la meilleure : le
   * deuxième livre peut-être le lendemain, ou sans minimum de commande.
   */
  offres: OffreConcurrente[]
}

export type OffreConcurrente = {
  fournisseur_id: string
  fournisseur: string
  designation: string
  reference: string | null
  prix_ref: number
  unite_ref: string
  prix: number | null
  unite: string | null
  nature: string
  ecartPct: number
}

/**
 * CE QUE L'OFFRE VAUT DANS NOTRE UNITÉ D'ACHAT.
 *
 * ⚠️ PEUT-ON REPRENDRE LE PRIX ? Oui dès qu'on sait le ramener à l'unité
 * dans laquelle on achète — quelle que soit la nature de l'offre.
 *
 * ⚠️ CORRECTION D'UNE SUR-PRUDENCE (27/09/2026). Une première version
 * refusait tout prix qui ne venait pas d'une facture, pour protéger
 * `prix_achat_ht`. Le gérant a tranché l'inverse, et il a raison :
 * **garder l'ancien prix après avoir changé de fournisseur est PLUS FAUX
 * que reprendre le nouveau.** Laisser 8,049 € (Gineys) sur un beurre
 * désormais acheté chez Félix Potin affirme qu'on paie un tarif qui ne
 * s'applique plus ; reprendre 5,625 € dit ce qu'on va payer.
 *
 * ⚠️ Ce qui protège n'est donc PAS le refus, c'est le DRAPEAU : un prix
 * repris d'un devis, d'un portail ou d'un catalogue arrive marqué
 * `prix_estime = true` (0165). Il nourrit le food cost et les marges en
 * disant qu'il est une hypothèse, et la première facture le confirmera.
 * Seule une offre de nature `facture` coche « prix relevé ».
 *
 * ⚠️⚠️ ET LA CONTENANCE DE NOTRE UNITÉ EST LUE (05/10/2026). Jusqu'ici la
 * reprise exigeait que notre unité soit LITTÉRALEMENT celle de l'offre —
 * donc elle échouait sur « barquette 500 g » face à un €/kg, c'est-à-dire
 * sur la moitié de nos matières. Mesuré : 4 lignes sur 15 reprenaient le
 * prix. Or la conversion n'est pas une invention : c'est
 * `prixReferenceMatiere()`, exactement la fonction qui a permis d'AFFICHER
 * l'écart. Si on lui fait confiance pour comparer, on peut lui faire
 * confiance pour écrire — un écart calculé sur une contenance fausse
 * serait déjà faux, et il est déjà sous les yeux du gérant.
 *
 * ⚠️ La concordance de FORMAT et de BASE est garantie en AMONT : une offre
 * ne sort que d'un groupe rendu comparable par `comparer()`, qui exige
 * `memeBase()`. Une botte ne se confronte jamais à un kilo, ni une 5/1 à
 * une 4/4 — donc ici le facteur ne peut pas franchir ces frontières.
 *
 * ⚠️ `converti` et `facteur` sont RENDUS, pas gardés pour nous : un prix
 * dérivé qu'on ne sait pas décomposer n'est pas vérifiable, et c'est la
 * première chose qu'on conteste quand il paraît faux. L'écran doit pouvoir
 * montrer « tant €/kg × 0,5 kg ».
 *
 * ⚠️ RESTE REFUSÉ : une unité qu'on ne sait pas lire. « unité d'achat »
 * — celle des produits revendus — ne dit pas combien de kilos elle
 * contient, et il n'y a rien à en déduire. Là on reprend le fournisseur
 * et pas le prix, et on le dit.
 */
export type ReprisePrix = {
  /** Prix pour NOTRE unité d'achat. */
  prix: number
  /** ⚠️ Vrai quand le prix est DÉRIVÉ de l'unité de référence. */
  converti: boolean
  /** Combien d'unités de référence tient notre unité (1 si lu tel quel). */
  facteur: number
  /** L'unité de référence de l'offre — pour montrer le calcul. */
  unite_ref: string
}

/** kg / L / pièce, écrits de dix façons dans nos unités de stock. */
function uniteRef(u: string | null | undefined): string {
  const t = String(u ?? '').trim().toLowerCase()
  if (['kg', 'kilo', 'kilogramme'].includes(t)) return 'kg'
  if (['l', 'litre', 'litres'].includes(t)) return 'litre'
  if (['pce', 'pièce', 'piece', 'u', 'unité', 'unite'].includes(t)) return 'pièce'
  return t
}

export function prixReprenable(
  offre: Pick<OffreConcurrente, 'unite_ref' | 'prix_ref'>,
  uniteNotre: string | null,
): ReprisePrix | null {
  const cible = uniteRef(offre.unite_ref)
  // Notre unité EST celle de l'offre : rien à convertir.
  if (cible === uniteRef(uniteNotre)) {
    return { prix: offre.prix_ref, converti: false, facteur: 1, unite_ref: offre.unite_ref }
  }
  if (!uniteNotre) return null

  // ⚠️ `prixReferenceMatiere(u, 1)` rend le prix de reference d'une unite
  // qui coûterait 1 € : son `prix` vaut donc 1 / (contenance). On inverse.
  const r = prixReferenceMatiere(uniteNotre, 1)
  if (!r || uniteRef(r.unite) !== cible || !(r.prix > 0)) return null
  const facteur = 1 / r.prix
  // ⚠️ 4 décimales, comme `cout_achat_ht` et `prix_achat_ht` : un arrondi
  // à 2 fait disparaître le prix d'une capsule ou d'un sac.
  return {
    prix: Math.round(offre.prix_ref * facteur * 10000) / 10000,
    converti: true,
    facteur: Math.round(facteur * 10000) / 10000,
    unite_ref: offre.unite_ref,
  }
}

export type FiltresAchete = {
  requete: string
  /** Clé de rayon, ou `undefined` pour tous. */
  rayon?: string
  fournisseur?: string | null
  /** Ne montrer que ce dont le prix est une estimation. */
  estimeSeul: boolean
  /** Ne montrer que ce qui n'a ni prix ni fournisseur. */
  incompletSeul: boolean
}

export const FILTRES_ACHETE_VIDES: FiltresAchete = {
  requete: '', rayon: undefined, fournisseur: undefined, estimeSeul: false, incompletSeul: false,
}

/**
 * ⚠️ Une ligne est INCOMPLÈTE s'il lui manque le prix OU le fournisseur.
 * Ce sont les deux seules choses sans lesquelles on ne peut pas commander :
 * l'une dit combien ça coûte, l'autre à qui écrire. La référence, elle,
 * se retrouve — un commercial sait reconnaître son produit par son nom.
 */
export function acheteIncomplet(a: ArticleAchete): boolean {
  return a.prix == null || !a.fournisseur
}

export function filtrerAchetes(articles: ArticleAchete[], f: FiltresAchete): ArticleAchete[] {
  const mots = motsCles(f.requete)
  return articles.filter(a => {
    if (f.fournisseur !== undefined && (a.fournisseur ?? null) !== f.fournisseur) return false
    if (f.rayon !== undefined && rayonDe(a.categorie).cle !== f.rayon) return false
    if (f.estimeSeul && !a.estime) return false
    if (f.incompletSeul && !acheteIncomplet(a)) return false
    if (!mots.length) return true
    // Tous les mots, en préfixe — un « ou » rendrait la moitié de la liste.
    const foin = motsCles(`${a.nom} ${a.reference ?? ''} ${a.categorie ?? ''}`)
    return mots.every(m => foin.some(h => h.startsWith(m)))
  })
}

export type BilanAchats = {
  references: number
  avecPrix: number
  sansPrix: number
  avecReference: number
  estimes: number
  releves: number
  incomplets: number
  /** Ce que vaut une reconstitution complète, sur les prix CONNUS. */
  valeurConnue: number
}

export function bilanAchats(articles: ArticleAchete[]): BilanAchats {
  return {
    references: articles.length,
    avecPrix: articles.filter(a => a.prix != null).length,
    sansPrix: articles.filter(a => a.prix == null).length,
    avecReference: articles.filter(a => a.reference).length,
    estimes: articles.filter(a => a.prix != null && a.estime).length,
    releves: articles.filter(a => a.prix != null && !a.estime).length,
    incomplets: articles.filter(acheteIncomplet).length,
    valeurConnue: 0,   // sans quantité, un total n'aurait pas de sens
  }
}

/** Regroupement par fournisseur — l'ordre dans lequel on passe commande. */
export function achetesParFournisseur(articles: ArticleAchete[]): Array<{
  fournisseur: string | null; articles: ArticleAchete[]; estimes: number
}> {
  const m = new Map<string, ArticleAchete[]>()
  for (const a of articles) {
    const k = a.fournisseur ?? '\u0000'
    if (!m.has(k)) m.set(k, [])
    m.get(k)!.push(a)
  }
  return [...m.entries()]
    .map(([k, as]) => ({
      fournisseur: k === '\u0000' ? null : k,
      articles: as.sort((x, y) => (x.nom < y.nom ? -1 : 1)),
      estimes: as.filter(a => a.estime && a.prix != null).length,
    }))
    // ⚠️ « Sans fournisseur » en DERNIER, jamais masqué : ce sont les
    // références qu'on ne sait pas commander, donc celles à traiter.
    .sort((a, b) => (a.fournisseur === null ? 1 : b.fournisseur === null ? -1
      : b.articles.length - a.articles.length))
}

// ─── LES RAYONS ─────────────────────────────────────────────────────────
//
// Les 193 références portent 21 catégories différentes — « Pain »,
// « Viennoiserie », « Pâtisserie », « Gourmandise »… C'est la bonne
// granularité pour une carte, pas pour une liste de courses : on ne
// commande pas la viennoiserie séparément du pain, c'est le même camion.
//
// ⚠️ On REGROUPE pour l'affichage, on ne renomme RIEN en base. La
// catégorie sert aussi à la caisse et au site ; la toucher casserait un
// bouton au comptoir (leçon des familles, `verifier-carte-zelty`).

export type Rayon = {
  cle: string
  nom: string
  emoji: string
  /** Classe Tailwind du filet de couleur, pour distinguer d'un coup d'œil. */
  teinte: string
  categories: string[]
}

export const RAYONS: Rayon[] = [
  { cle: 'boulangerie', nom: 'Boulangerie', emoji: '🥖', teinte: 'bg-amber-400',
    categories: ['Pain', 'Viennoiserie', 'Pâtisserie', 'Boulangerie', 'Gourmandise', 'Dessert'] },
  { cle: 'pizzeria', nom: 'Pizzeria', emoji: '🍕', teinte: 'bg-red-500',
    categories: ['Pizzeria', 'Pizza'] },
  { cle: 'restaurant', nom: 'Restaurant', emoji: '🍽️', teinte: 'bg-orange-500',
    categories: ['Restaurant'] },
  { cle: 'charcuterie', nom: 'Charcuterie & marée', emoji: '🥩', teinte: 'bg-rose-400',
    categories: ['Charcuterie', 'Poisson'] },
  { cle: 'cremerie', nom: 'Crémerie', emoji: '🧀', teinte: 'bg-yellow-300',
    categories: ['Crémerie'] },
  { cle: 'epicerie', nom: 'Épicerie', emoji: '🧂', teinte: 'bg-lime-500',
    categories: ['Épicerie'] },
  { cle: 'boissons', nom: 'Boissons', emoji: '🥤', teinte: 'bg-sky-400',
    categories: ['Boisson fraîche', 'Boisson chaude'] },
  { cle: 'cave', nom: 'Cave & bar', emoji: '🍷', teinte: 'bg-violet-500',
    categories: ['Alcool', 'Apéritif', 'Bière', 'Vin'] },
  { cle: 'glaces', nom: 'Glaces', emoji: '🍦', teinte: 'bg-cyan-300',
    categories: ['Glace'] },
  { cle: 'emballages', nom: 'Emballages', emoji: '📦', teinte: 'bg-zinc-400',
    categories: ['Emballage'] },
]

/**
 * ⚠️ UNE CATÉGORIE INCONNUE N'EST PAS RANGÉE DE FORCE. Elle tombe dans
 * « Autres », qui est AFFICHÉ : une catégorie créée demain (le tabac, la
 * presse) apparaîtrait sinon dans un rayon qui n'est pas le sien, ou
 * disparaîtrait de l'écran — et un produit qu'on ne voit pas ne se
 * commande pas.
 */
export const RAYON_AUTRES: Rayon = {
  cle: 'autres', nom: 'Autres', emoji: '•', teinte: 'bg-zinc-300', categories: [],
}

const PAR_CATEGORIE = new Map<string, Rayon>()
for (const r of RAYONS) for (const c of r.categories) PAR_CATEGORIE.set(c, r)

export function rayonDe(categorie: string | null): Rayon {
  return (categorie && PAR_CATEGORIE.get(categorie)) || RAYON_AUTRES
}

export function parRayon(articles: ArticleAchete[]): Array<{
  rayon: Rayon; articles: ArticleAchete[]; estimes: number; incomplets: number
}> {
  const m = new Map<string, ArticleAchete[]>()
  for (const a of articles) {
    const k = rayonDe(a.categorie).cle
    if (!m.has(k)) m.set(k, [])
    m.get(k)!.push(a)
  }
  const ordre = [...RAYONS, RAYON_AUTRES]
  return ordre
    .filter(r => m.has(r.cle))
    .map(r => {
      const as = m.get(r.cle)!.sort((x, y) => (x.nom < y.nom ? -1 : 1))
      return {
        rayon: r,
        articles: as,
        estimes: as.filter(a => a.estime && a.prix != null).length,
        incomplets: as.filter(acheteIncomplet).length,
      }
    })
}

// ─── LES RAYONS DU CATALOGUE FOURNISSEUR ────────────────────────────────
//
// Les 3 392 références portent **279 familles** venues des catalogues de
// marques : « B.O.F. », « ACCOMPAGNEMENT », « SECS », mais aussi « DANS
// LES BOIS », « P'TITS GOURMANDS », « PALAIS AIGUISÉ » — des chapitres de
// prose commerciale, déjà signalés comme tels à l'indexation. Un menu de
// 279 entrées ne se parcourt pas.
//
// ⚠️ On range par MOTS-CLÉS, pas par correspondance exacte : les
// fournisseurs n'écrivent pas leurs rayons de la même façon, et chaque
// nouveau catalogue en apporterait d'autres. Une table exacte serait
// périmée au devis suivant.
//
// ⚠️ L'ORDRE COMPTE, et il est délibéré : « FRUITS SURGELÉS » contient
// FRUIT et SURGEL. On veut le fruit — c'est ce qu'on cherche quand on
// commande — donc les produits passent AVANT le mode de conservation.
//
// ⚠️ CE QUI RESTE « NON CLASSÉ » L'EST VOLONTAIREMENT. Les chapitres de
// prose des livres d'inspiration — « DANS LES BOIS », « PALAIS AIGUISÉ »,
// « BUCOLIQUES », « D'EXCEPTION », « EXOTIQUES », « HERBACÉS » — ne
// décrivent aucun rayon : personne ne cherchera un produit sous ce nom, et
// les ranger au jugé les mettrait dans le mauvais. C'est le même
// raisonnement que l'ordre des catalogues à l'indexation, où les livres
// d'inspiration passent en dernier.

const RAYONS_FOURNISSEUR: Array<Rayon & { mots: string[] }> = [
  { cle: 'f-cremerie', nom: 'Crémerie', emoji: '🧀', teinte: 'bg-yellow-300', categories: [],
    mots: ['B.O.F', 'BOF', 'LAITIER', 'FROMAGE', 'BEURRE', 'CREME', 'CRÈME', 'OEUF', 'ŒUF', 'YAOURT'] },
  { cle: 'f-boulangerie', nom: 'Boulangerie & pâtisserie', emoji: '🥖', teinte: 'bg-amber-400', categories: [],
    mots: ['BOULANG', 'VIENNOIS', 'PATISS', 'PÂTISS', 'PAIN', 'BRIOCH', 'DESSERT', 'GOURMAND', 'MACARON',
      'TARTE', 'BEIGNET', 'BAVAROISE', 'BÛCHETTE', 'BUCHETTE', 'CHOCOLAT', 'FEUILLET', 'CROISSANT',
      'GATEAU', 'GÂTEAU', 'ENTREMET', 'BUCHE', 'BÛCHE', 'COOKIE', 'MUFFIN', 'DONUT', 'CREPE', 'CRÊPE',
      'GAUFRE', 'CANELE', 'CANELÉ', 'ECLAIR', 'ÉCLAIR'] },
  { cle: 'f-boucherie', nom: 'Boucherie & charcuterie', emoji: '🥩', teinte: 'bg-rose-400', categories: [],
    mots: ['VIANDE', 'BOEUF', 'BŒUF', 'POULET', 'VOLAILLE', 'PORC', 'CHARCUT', 'AGNEAU', 'CANARD', 'VEAU',
      'SAUCISS', 'HACHÉ', 'HACHE', 'TARTARE', 'JAMBON', 'MERGUEZ', 'BROCHETTE'] },
  { cle: 'f-maree', nom: 'Marée', emoji: '🐟', teinte: 'bg-sky-500', categories: [],
    mots: ['POISSON', 'CREVETTE', 'CRUSTACE', 'CRUSTACÉ', 'SAUMON', 'COQUILLAGE', 'CALAMAR', 'POULPE',
      'MAREE', 'MARÉE', 'MOLLUSQUE', 'FILET', 'ST-JACQUES', 'MOULE', 'HUITRE', 'HUÎTRE', 'SEICHE'] },
  { cle: 'f-primeur', nom: 'Fruits & légumes', emoji: '🥬', teinte: 'bg-lime-500', categories: [],
    mots: ['LEGUME', 'LÉGUME', 'FRUIT', 'VERGER', 'SALADE', 'POMME DE TERRE', 'HERBE'] },
  { cle: 'f-cave', nom: 'Cave & bar', emoji: '🍷', teinte: 'bg-violet-500', categories: [],
    mots: ['VIN', 'BIERE', 'BIÈRE', 'ALCOOL', 'SPIRITUEUX', 'CHAMPAGNE', 'APERITIF', 'APÉRITIF'] },
  { cle: 'f-boissons', nom: 'Boissons', emoji: '🥤', teinte: 'bg-sky-400', categories: [],
    mots: ['BOISSON', 'BOUTEILLE', 'JUS', 'SODA', 'CAFE', 'CAFÉ', 'THE', 'THÉ'] },
  { cle: 'f-traiteur', nom: 'Traiteur & snacking', emoji: '🍕', teinte: 'bg-red-500', categories: [],
    mots: ['SNACK', 'TRAITEUR', 'PIZZA', 'RESTAURATION', 'ACCOMPAGNEMENT', 'RECEPTION', 'RÉCEPTION',
      'APERO', 'APÉRO', 'PANINI', 'CROQUE', 'BURGER', 'SANDWICH', 'PLANCHE', 'BRUNCH', 'CUISINE',
      'BAGEL', 'WRAP', 'QUICHE', 'TACOS'] },
  { cle: 'f-epicerie', nom: 'Épicerie', emoji: '🧂', teinte: 'bg-orange-400', categories: [],
    mots: ['EPICERIE', 'ÉPICERIE', 'SECS', 'SAUCE', 'ASSAISON', 'CONDIMENT', 'HUILE', 'CONSERVE',
      'FARINE', 'SUCRE', 'EPICE', 'ÉPICE', 'AIDE CULINAIRE', 'AIDES CULINAIRE', 'VINAIGRE', 'PUREE',
      'PURÉE', 'RIZ', 'PATE ', 'PÂTE ', 'SEL', 'POIVRE'] },
  { cle: 'f-surgeles', nom: 'Surgelés & glaces', emoji: '❄️', teinte: 'bg-cyan-300', categories: [],
    mots: ['SURGEL', 'GLACE', 'SORBET'] },
  { cle: 'f-emballage', nom: 'Emballages & hygiène', emoji: '📦', teinte: 'bg-zinc-400', categories: [],
    mots: ['EMBALLAGE', 'SERVICE', 'HYGIENE', 'HYGIÈNE', 'VAISSELLE', 'NETTOYAGE', 'PAPIER'] },
  { cle: 'f-frais', nom: 'Frais', emoji: '🧊', teinte: 'bg-teal-400', categories: [],
    mots: ['FRAIS'] },
]

/**
 * ⚠️ « Non classé » est un rayon À PART ENTIÈRE, affiché comme les autres.
 * 1 093 références n'ont aucune famille (le portail Gineys ne la donnait
 * pas au relevé) et 239 familles sont des chapitres de prose que personne
 * ne cherchera sous ce nom. Les fondre dans un rayon existant les rendrait
 * introuvables là où on les attend ; les masquer les rendrait
 * introuvables tout court.
 */
export const RAYON_NON_CLASSE: Rayon = {
  cle: 'f-autres', nom: 'Non classé', emoji: '•', teinte: 'bg-zinc-300', categories: [],
}

export function rayonFournisseur(famille: string | null): Rayon {
  if (!famille) return RAYON_NON_CLASSE
  const f = famille.toUpperCase()
  // ⚠️ UN JUS EST UNE BOISSON, QUEL QUE SOIT LE FRUIT DONT IL EST FAIT.
  // « Jus de fruits » — 67 références chez Euro-Cash — contient FRUIT, et
  // `f-primeur` passant avant `f-boissons`, le rayon entier se rangeait
  // dans « Fruits & légumes », à côté des tomates et de la salade. On ne
  // cherche pas un jus d'orange au rayon primeur. C'est l'exception à la
  // règle d'ordre voisine (« FRUITS SURGELÉS » va bien aux fruits) : là le
  // fruit EST le produit, ici il n'est que la matière première.
  if (f.includes('JUS')) return RAYONS_FOURNISSEUR.find(r => r.cle === 'f-boissons') ?? RAYON_NON_CLASSE
  for (const r of RAYONS_FOURNISSEUR) {
    if (r.mots.some(m => f.includes(m))) return r
  }
  return RAYON_NON_CLASSE
}

export const RAYONS_FOURNISSEUR_LISTE: Rayon[] = RAYONS_FOURNISSEUR

/**
 * CE QUE LES AUTRES FOURNISSEURS ONT DE SEMBLABLE — une PISTE, pas un verdict.
 *
 * ⚠️⚠️ CE N'EST PAS `comparer()`, ET LA DISTINCTION EST TOUTE LA PRUDENCE DE
 * CE PROJET. `comparer()` travaille sur des `cle_comparaison` posées À LA
 * MAIN — un humain a regardé les deux produits et dit « c'est le même ». Il
 * y en a 305 sur 4 888 au 04/10/2026, donc la comparaison ne répondait
 * presque jamais à « et chez les autres ? ».
 *
 * Ici on CALCULE un rapprochement probable. La 0151 a montré ce que ça donne
 * livré à soi-même : « Roquette » rapproché de « ROQUEFORT », « Citron » de
 * « GATEAU CITRON ROND », « Glace » de « SUCRE GLACE 25KG ». Donc : on
 * propose, **on n'écrit jamais de clé**, et l'écran dit que c'est une piste.
 *
 * ⚠️⚠️ ET ON NE DONNE UN POURCENTAGE QUE SI LES DEUX PRIX TOMBENT SUR LA MÊME
 * BASE. Mesuré le 04/10/2026 sur les desserts : l'éclair Krill à 0,89 € face
 * au nôtre à 1,296 € annonce « −31 % », alors que l'un fait 80 g et l'autre
 * 120 g — au gramme, Krill est 3 % PLUS cher. Sans cette retenue, l'écran
 * ferait changer de fournisseur sur un chiffre faux.
 */
export type PisteAchat = {
  article: ArticleAchat
  /** Les deux prix se ramènent-ils à la même unité ? */
  comparable: boolean
  /** Écart en %, UNIQUEMENT si comparable. Négatif = moins cher qu'elle. */
  ecartPct: number | null
  /** Les mots partagés — pour que l'œil juge du rapprochement. */
  communs: string[]
}

export function pistesAchat(
  origine: ArticleAchat,
  catalogue: ArticleAchat[],
  max = 5,
): PisteAchat[] {
  const ma = mots(origine.designation)
  if (ma.length === 0) return []
  const out: Array<PisteAchat & { s: number }> = []
  for (const a of catalogue) {
    // ⚠️ Un AUTRE fournisseur : deux références du même vendeur ne sont pas
    // une alternative, et les opposer annonce un « moins cher » qui n'en
    // est pas un.
    if (a.fournisseur_id === origine.fournisseur_id || a.id === origine.id) continue
    const communs = ma.filter(m => mots(a.designation).includes(m))
    if (communs.length < MOTS_COMMUNS_MINIMUM) continue
    // ⚠️ `ref` est calculé côté serveur par `prixReference()`. Deux `null`
    // ne sont PAS « la même base » — c'est deux fois « on ne sait pas ».
    const comparable = !!(origine.ref && a.ref && origine.ref.unite === a.ref.unite)
    out.push({
      article: a, comparable, communs,
      ecartPct: comparable && origine.ref!.prix > 0
        ? Math.round(((a.ref!.prix - origine.ref!.prix) / origine.ref!.prix) * 1000) / 10
        : null,
      // La couverture prime, le nombre de mots départage — même règle que
      // `score()`, pour que les écrans classent pareil.
      s: (communs.length / ma.length) * 100 + communs.length,
    })
  }
  return out
    .sort((a, b) => (b.s - a.s) || ((a.ecartPct ?? 0) - (b.ecartPct ?? 0)))
    .slice(0, max)
    .map(({ s: _s, ...p }) => p)
}

/**
 * ─────────────────────────────────────────────────────────────────────────
 * TAPER UN PRODUIT, ET VOIR TOUT DE SUITE QUI LE VEND ET À QUEL PRIX
 * ─────────────────────────────────────────────────────────────────────────
 *
 * La recherche rendait une LISTE À PLAT : trente lignes « mozzarella » de
 * quatre fournisseurs, dans l'ordre du catalogue, avec chacune le prix de
 * SON conditionnement. Pour savoir qui est le moins cher il fallait sortir
 * une calculatrice — donc personne ne le faisait, et on recommandait chez
 * l'habituel.
 *
 * `comparerRecherche()` regroupe les résultats et ramène chaque ligne à son
 * unité de référence.
 *
 * ⚠️⚠️ DEUX NATURES DE GRAPPE, ET IL NE FAUT JAMAIS LES CONFONDRE.
 *
 *   • VALIDÉE — les lignes partagent une `cle_comparaison`, posée à la main
 *     par quelqu'un qui a regardé les deux produits (0151). C'est une
 *     comparaison sur laquelle on peut arbitrer.
 *   • PISTE — les lignes ont seulement des MOTS en commun. C'est un calcul,
 *     et le calcul livré à lui-même rapproche « Roquette » de « ROQUEFORT »,
 *     « Citron » de « GATEAU CITRON ROND », « Glace » de « SUCRE GLACE ».
 *     On propose, l'écran le DIT, et **aucune clé n'est jamais écrite**.
 *
 * ⚠️ UNE GRAPPE VALIDÉE REMONTE TOUTES SES LIGNES, même celles que la
 * recherche n'a pas trouvées. Taper « serrano » doit montrer le concurrent
 * dont le libellé dit « JAMBON CRU PETALE » — sinon la comparaison cache
 * précisément ce qu'on cherchait, et c'est pire que pas de comparaison.
 *
 * ⚠️ ON N'ANNONCE UN ÉCART QUE SI LES PRIX TOMBENT SUR LA MÊME BASE — même
 * unité ET même format de conserve, exactement la règle de `comparer()`.
 * Hors de là l'écran montre les lignes sans les classer : une poche de
 * 600 g et une d'un kilo portent deux prix justes et aucune comparaison.
 */
export type GrappeRecherche = {
  /** Le libellé le plus court du groupe — le plus lisible. */
  titre: string
  cle: string | null
  /** Clé posée par un humain (true) ou rapprochement calculé (false). */
  validee: boolean
  lignes: ArticleAchat[]
  comparable: boolean
  /** Écart entre le moins cher et le plus cher, en %. Null si incomparable. */
  ecartPct: number | null
  /** Id de la ligne la moins chère — UNIQUEMENT si le groupe est comparable. */
  moinsCher: string | null
  /** Nombre de fournisseurs DISTINCTS ayant chiffré. */
  fournisseurs: number
}

/** La base d'un prix de référence : unité ET format doivent concorder. */
const baseRef = (a: ArticleAchat) => `${a.ref!.unite}|${a.ref!.format ?? ''}`

function juger(lignes: ArticleAchat[], titre: string, cle: string | null, validee: boolean): GrappeRecherche {
  const chiffrees = lignes.filter(l => l.ref)
  const bases = new Set(chiffrees.map(baseRef))
  const comparable = bases.size === 1 && chiffrees.length > 1
  let moinsCher: string | null = null, ecartPct: number | null = null
  if (comparable) {
    const tri = [...chiffrees].sort((a, b) => a.ref!.prix - b.ref!.prix)
    moinsCher = tri[0].id
    const bas = tri[0].ref!.prix, haut = tri[tri.length - 1].ref!.prix
    ecartPct = bas > 0 ? Math.round(((haut - bas) / bas) * 1000) / 10 : null
  }
  return {
    titre, cle, validee, comparable, moinsCher, ecartPct,
    // ⚠️ On compte ceux qui ont CHIFFRÉ : un fournisseur à qui on vient
    // d'envoyer une demande de tarif n'est pas un participant au duel.
    fournisseurs: new Set((chiffrees.length ? chiffrees : lignes).map(l => l.fournisseur_id)).size,
    lignes: [...lignes].sort((a, b) =>
      (a.ref ? a.ref.prix : Infinity) - (b.ref ? b.ref.prix : Infinity)),
  }
}

export function comparerRecherche(
  articles: ArticleAchat[],
  requete: string,
  max = 12,
): GrappeRecherche[] {
  if (!motsCles(requete).length) return []
  const trouves = articles.filter(a => correspond(a, requete))
  if (!trouves.length) return []

  const grappes: GrappeRecherche[] = []
  const pris = new Set<string>()

  // ① Les comparaisons VALIDÉES, avec toutes leurs lignes.
  const cles = new Set(trouves.map(a => a.cle).filter((c): c is string => !!c))
  for (const cle of cles) {
    const l = articles.filter(a => a.cle === cle)
    for (const a of l) pris.add(a.id)
    if (l.length < 2) continue
    const titre = [...l].sort((a, b) => a.designation.length - b.designation.length)[0].designation
    grappes.push(juger(l, titre, cle, true))
  }

  // ② Les PISTES : ce que la recherche a trouvé et que rien ne relie encore.
  // On part des libellés les plus COURTS — ce sont les plus génériques, donc
  // les meilleurs noyaux ; partir d'un libellé à rallonge produirait autant
  // de grappes d'une ligne que de références.
  const reste = trouves.filter(a => !pris.has(a.id))
    .sort((a, b) => a.designation.length - b.designation.length)
  for (const noyau of reste) {
    if (pris.has(noyau.id)) continue
    const mn = mots(noyau.designation)
    if (!mn.length) continue
    const grappe = [noyau]
    pris.add(noyau.id)
    for (const a of reste) {
      if (pris.has(a.id)) continue
      if (mots(a.designation).filter(m => mn.includes(m)).length < MOTS_COMMUNS_MINIMUM) continue
      grappe.push(a); pris.add(a.id)
    }
    // ⚠️ Un seul fournisseur n'est pas une comparaison, c'est une gamme :
    // opposer deux de ses propres références annoncerait un « moins cher »
    // qui ne fait changer de personne.
    if (new Set(grappe.map(a => a.fournisseur_id)).size < 2) continue
    grappes.push(juger(grappe, noyau.designation, null, false))
  }

  // Les comparaisons sûres d'abord, puis le plus gros écart : c'est là qu'il
  // y a de l'argent à aller chercher.
  return grappes
    .sort((a, b) =>
      Number(b.validee) - Number(a.validee) ||
      Number(b.comparable) - Number(a.comparable) ||
      (b.ecartPct ?? -1) - (a.ecartPct ?? -1))
    .slice(0, max)
}
