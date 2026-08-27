// Accès HTTP à l'API Zelty.
//
// Tout ce qui n'est pas encore connu est un RÉGLAGE, pas une valeur en dur :
// le jour où la documentation arrive, on remplit des variables d'environnement
// au lieu de rouvrir le code.
//
//   ZELTY_API_URL              base, ex. https://api.zelty.fr/v1
//   ZELTY_API_KEY              la clé fournie en direct (confirmé en démo)
//   ZELTY_AUTH                 'bearer' (défaut) | 'x-api-key'
//   ZELTY_ORDERS_PATH          chemin des commandes, défaut '/orders'
//   ZELTY_PARAM_DEBUT          nom du paramètre de début, défaut 'from'
//   ZELTY_PARAM_FIN            nom du paramètre de fin, défaut 'to'
//   ZELTY_RESTAURANT_ID        identifiant d'établissement, si l'API en demande un
//   ZELTY_MONTANTS_EN_CENTIMES 'true' | 'false' — À DÉCLARER, cf. mapper.ts
//   ZELTY_ETABLISSEMENT_SLUG   point de vente à rattacher, défaut 'fournil'
//
// Server-only (secrets).

export type ConfigZelty = {
  baseUrl: string
  cle: string
  auth: 'bearer' | 'x-api-key'
  cheminCommandes: string
  paramDebut: string
  paramFin: string
  restaurantId?: string
  montantsEnCentimes: boolean
  etablissementSlug: string
}

export type ConfigManquante = { pret: false; manquants: string[] }
export type ConfigPrete = { pret: true; config: ConfigZelty }

/**
 * Lit la configuration. Ne lève pas : une caisse pas encore branchée n'est
 * pas une panne, et le monitoring compte tout code ≠ 200 comme une erreur.
 */
export function lireConfig(): ConfigPrete | ConfigManquante {
  const manquants: string[] = []
  const baseUrl = process.env.ZELTY_API_URL ?? ''
  const cle = process.env.ZELTY_API_KEY ?? ''
  if (!baseUrl) manquants.push('ZELTY_API_URL')
  if (!cle) manquants.push('ZELTY_API_KEY')

  // Volontairement sans valeur par défaut : se tromper d'unité multiplie le
  // chiffre d'affaires par cent. Mieux vaut refuser de démarrer.
  const centimes = process.env.ZELTY_MONTANTS_EN_CENTIMES
  if (centimes !== 'true' && centimes !== 'false') manquants.push('ZELTY_MONTANTS_EN_CENTIMES (true|false)')

  if (manquants.length > 0) return { pret: false, manquants }

  return {
    pret: true,
    config: {
      baseUrl: baseUrl.replace(/\/+$/, ''),
      cle,
      auth: process.env.ZELTY_AUTH === 'x-api-key' ? 'x-api-key' : 'bearer',
      cheminCommandes: process.env.ZELTY_ORDERS_PATH ?? '/orders',
      paramDebut: process.env.ZELTY_PARAM_DEBUT ?? 'from',
      paramFin: process.env.ZELTY_PARAM_FIN ?? 'to',
      restaurantId: process.env.ZELTY_RESTAURANT_ID || undefined,
      montantsEnCentimes: centimes === 'true',
      etablissementSlug: process.env.ZELTY_ETABLISSEMENT_SLUG ?? 'fournil',
    },
  }
}

function entetes(c: ConfigZelty): Record<string, string> {
  return c.auth === 'x-api-key'
    ? { 'x-api-key': c.cle, Accept: 'application/json' }
    : { Authorization: `Bearer ${c.cle}`, Accept: 'application/json' }
}

/**
 * Extrait le tableau de commandes d'une réponse, quelle que soit son
 * enveloppe. Les API renvoient tantôt un tableau nu, tantôt `{ data: [...] }`.
 */
export function extraireListe(reponse: unknown): unknown[] {
  if (Array.isArray(reponse)) return reponse
  if (reponse && typeof reponse === 'object') {
    for (const cle of ['data', 'orders', 'results', 'items']) {
      const v = (reponse as Record<string, unknown>)[cle]
      if (Array.isArray(v)) return v
    }
  }
  return []
}

/**
 * Récupère les commandes sur une fenêtre de dates.
 *
 * Réessaie sur 429 et 5xx — une caisse momentanément indisponible ne doit pas
 * faire perdre la journée. Un 4xx autre que 429 n'est pas réessayé : c'est une
 * erreur de configuration, la répéter ne la corrigera pas.
 */
export async function recupererCommandes(
  c: ConfigZelty, debut: Date, fin: Date,
): Promise<{ commandes: unknown[]; url: string }> {
  const url = new URL(c.baseUrl + c.cheminCommandes)
  url.searchParams.set(c.paramDebut, debut.toISOString())
  url.searchParams.set(c.paramFin, fin.toISOString())
  if (c.restaurantId) url.searchParams.set('restaurant_id', c.restaurantId)

  let derniereErreur = ''
  for (let essai = 1; essai <= 3; essai++) {
    const r = await fetch(url.toString(), { headers: entetes(c), cache: 'no-store' })
    if (r.ok) {
      const json = await r.json().catch(() => null)
      return { commandes: extraireListe(json), url: url.toString() }
    }
    derniereErreur = `HTTP ${r.status} ${(await r.text().catch(() => '')).slice(0, 200)}`
    const reessayable = r.status === 429 || r.status >= 500
    if (!reessayable) break
    await new Promise(res => setTimeout(res, essai * 1000))
  }
  throw new Error(`Zelty injoignable : ${derniereErreur}`)
}
