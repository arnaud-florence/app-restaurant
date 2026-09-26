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
  remise: EtatRemise | null
  /** N'afficher que ce qu'on achète déjà. */
  achetes: boolean
  /** N'afficher que les promotions en cours. */
  promos: boolean
  /** N'afficher que les « prix sur demande ». */
  sansPrix: boolean
}

export const FILTRES_VIDES: Filtres = {
  requete: '', fournisseur_id: null, remise: null,
  achetes: false, promos: false, sansPrix: false,
}

export function filtrer(articles: ArticleAchat[], f: Filtres): ArticleAchat[] {
  return articles.filter(a => {
    if (f.fournisseur_id && a.fournisseur_id !== f.fournisseur_id) return false
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
