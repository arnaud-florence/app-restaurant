// Lire une table ENTIÈRE, quel que soit son nombre de lignes.
//
// ⚠️ PostgREST plafonne ses réponses à 1 000 lignes, et ce plafond ne se
// contourne ni par `.limit(10000)` ni par un en-tête `Range` : il rend mille
// lignes, code 200, sans le moindre avertissement. Mesuré le 26/09/2026,
// quand l'import du catalogue Gineys a porté `catalogue_fournisseur` à
// 3 303 lignes : l'écran en affichait 1 000 et se croyait complet.
//
// C'est la même famille de faute que `expand[]=items` oublié chez Zelty et
// que `limit=0` qui rend TOUT : une troncature silencieuse ne lève aucune
// erreur, elle rend juste un chiffre faux dans lequel on a confiance.

/** Taille d'une page. Sous le plafond de PostgREST, volontairement. */
const PAGE = 1000

/**
 * ⚠️⚠️ PAGINER SANS TRI STABLE SAUTE ET DUPLIQUE DES LIGNES.
 *
 * Sans `order by`, PostgreSQL ne promet aucun ordre : deux appels
 * `range(0,999)` et `range(1000,1999)` peuvent renvoyer des lignes
 * communes et en oublier d'autres. Mesuré le 27/09/2026 : deux
 * exécutions du même import Arti'Pat donnaient des remises différentes
 * (44 % puis 30 % sur les mêmes produits), parce que la table des prix
 * du portail n'était pas la même d'un run à l'autre.
 *
 * Et ça ne lève aucune erreur — on obtient un résultat plausible, faux,
 * et DIFFÉRENT à chaque fois. C'est le pire des trois.
 *
 * ⚠️ Le tri doit porter sur une colonne UNIQUE (`id`) : trier sur
 * `designation` ne suffit pas, les ex æquo peuvent se réordonner.
 */

type Requete<T> = {
  range: (de: number, a: number) => PromiseLike<{ data: T[] | null; error: unknown }>
}

/**
 * Enchaîne les pages jusqu'à épuisement.
 *
 * ⚠️ On s'arrête sur une page INCOMPLÈTE, pas sur une page vide : sinon une
 * table dont la taille est un multiple exact de 1 000 coûte un aller-retour
 * de plus à chaque lecture.
 *
 * ⚠️ `construire` doit rendre une requête NEUVE à chaque appel : un builder
 * Supabase déjà exécuté ne se rejoue pas, et le réutiliser rendrait la même
 * page indéfiniment — une boucle infinie qui ressemble à une lenteur.
 *
 * ⚠️ ET ELLE DOIT PORTER UN `.order('id')` : voir ci-dessus.
 */
export async function lireTout<T>(
  construire: () => Requete<T>,
  max = 50_000,
): Promise<T[]> {
  const out: T[] = []
  for (let de = 0; de < max; de += PAGE) {
    const { data, error } = await construire().range(de, de + PAGE - 1)
    if (error) throw error
    const lot = data ?? []
    out.push(...lot)
    if (lot.length < PAGE) break
  }
  return out
}
