// Règle de synchronisation `commande.statut` depuis l'agrégat des articles.
//
// Extraite en fonction pure pour être testable sans base ni serveur
// (scripts/test-commande-statut.mjs). Voir CLAUDE.md §5 « Règle d'or ».
//
// Agrégat :
//   tous 'servi'                → 'servi'
//   tous 'pret' ou 'servi'      → 'pret'
//   au moins un 'en_preparation'→ 'en_preparation'
//   sinon                       → 'en_attente'
//
// Puis, cas particulier des VENTES AU COMPTOIR : voir `estVenteComptoirDirecte`.

export type StatutArticleAgrege = 'en_attente' | 'en_preparation' | 'pret' | 'servi'
export type StatutCommandeCalcule =
  | 'en_attente' | 'en_preparation' | 'pret' | 'servi' | 'encaisse'

export type ContexteCommande = {
  source: string | null
  numero_table: string | null
  ardoise_nom: string | null
}

/** Agrégat brut des statuts d'articles, sans considération de source. */
export function agregerStatutsArticles(statuts: StatutArticleAgrege[]): StatutCommandeCalcule {
  if (statuts.length === 0) return 'en_attente'
  if (statuts.every(s => s === 'servi')) return 'servi'
  if (statuts.every(s => s === 'pret' || s === 'servi')) return 'pret'
  if (statuts.some(s => s === 'en_preparation')) return 'en_preparation'
  return 'en_attente'
}

/** Vente au comptoir « directe » : produit remis, transaction terminée.
 *
 *  Exclut :
 *   - les commandes de TABLE (addition demandée plus tard) ;
 *   - les ARDOISES (compte ouvert, soldé à la fin — cf. migration 0106).
 *     Les clôturer dès la première tournée les rendrait introuvables et
 *     ferait compter le total comme payé avant de l'être. */
export function estVenteComptoirDirecte(cmd: ContexteCommande): boolean {
  return cmd.source === 'COMPTOIR'
    && !cmd.numero_table
    && !cmd.ardoise_nom?.trim()
}

/** Statut cible de la commande compte tenu de ses articles et de sa nature.
 *
 *  Une vente au comptoir entièrement servie passe directement à 'encaisse' :
 *  sans cela elle resterait à 'servi' indéfiniment et son chiffre d'affaires
 *  n'apparaîtrait nulle part (tout le calcul du CA filtre sur 'encaisse').
 *
 *  ⚠️ Ce n'est pas un encaissement FISCAL : aucune ligne de `paiements_caisse`
 *  n'est créée. La caisse agréée reste la source de vérité fiscale. */
export function statutCommandeCible(
  statutsArticles: StatutArticleAgrege[],
  cmd: ContexteCommande,
): StatutCommandeCalcule {
  const agrege = agregerStatutsArticles(statutsArticles)
  if (agrege === 'servi' && estVenteComptoirDirecte(cmd)) return 'encaisse'
  return agrege
}
