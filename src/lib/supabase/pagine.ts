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
