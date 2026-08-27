// Accès HTTP à l'API Zelty.
//
// Tout ce qui n'est pas encore connu est un RÉGLAGE, pas une valeur en dur :
// le jour où la documentation arrive, on remplit des variables d'environnement
// au lieu de rouvrir le code.
//
// D'après https://docs.zelty.fr (API 2.11), lue le 28/08/2026 :
//   · base    https://api.zelty.fr/{version}/{endpoint}
//   · auth    Authorization: Bearer <clé>
//   · dates   `from` / `to` au format AAAA-MM-JJ — PAS de l'ISO complet
//   · pages   `limit` (défaut 100, MAX 200) + `offset`
//   · détail  `expand[]=items` sinon `items` revient vide
//
//   ZELTY_API_URL              défaut https://api.zelty.fr/2.11
//   ZELTY_API_KEY              la clé, générée depuis le back-office
//   ZELTY_AUTH                 'bearer' (défaut) | 'x-api-key'
//   ZELTY_ORDERS_PATH          défaut '/orders'
//   ZELTY_CATALOGUE_PATH       défaut '/catalog/dishes'
//   ZELTY_MONTANTS_EN_CENTIMES 'true' | 'false' — À DÉCLARER, cf. mapper.ts
//   ZELTY_ETABLISSEMENT_SLUG   point de vente à rattacher, défaut 'fournil'
//
// Server-only (secrets).

export type ConfigZelty = {
  baseUrl: string
  cle: string
  auth: 'bearer' | 'x-api-key'
  cheminCommandes: string
  cheminCatalogue: string
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
  // La base a une valeur par défaut : elle est documentée et stable. La CLÉ,
  // non — c'est un secret, il n'y a pas de défaut raisonnable.
  const baseUrl = process.env.ZELTY_API_URL ?? 'https://api.zelty.fr/2.11'
  const cle = process.env.ZELTY_API_KEY ?? ''
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
      cheminCatalogue: process.env.ZELTY_CATALOGUE_PATH ?? '/catalog/dishes',
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

/** Jour au format attendu par Zelty (AAAA-MM-JJ), en heure de Paris. */
const jourParis = (d: Date) =>
  new Intl.DateTimeFormat('fr-CA', {
    timeZone: 'Europe/Paris', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(d)

/** Taille de page. La doc plafonne à 200 ; au-delà, l'API refuse. */
const PAR_PAGE = 200

function construireUrl(c: ConfigZelty, debut: Date, fin: Date, offset: number): URL {
  const url = new URL(c.baseUrl.replace(/\/+$/, '') + c.cheminCommandes)
  url.searchParams.set('from', jourParis(debut))
  url.searchParams.set('to', jourParis(fin))
  // Sans ces `expand`, la réponse ne porte NI les lignes NI le mode de
  // paiement : le CA serait juste et tout le reste aveugle, sans erreur
  // visible. C'est le piège principal de cette API.
  url.searchParams.append('expand[]', 'items')
  url.searchParams.append('expand[]', 'transactions')
  url.searchParams.append('expand[]', 'transactions.method')
  url.searchParams.append('expand[]', 'price.taxes')
  // Le mode entraînement de la caisse ne doit jamais entrer dans le CA.
  url.searchParams.set('is_sandbox', 'false')
  url.searchParams.set('limit', String(PAR_PAGE))
  url.searchParams.set('offset', String(offset))
  return url
}

async function appeler(c: ConfigZelty, url: URL): Promise<unknown> {
  let derniereErreur = ''
  for (let essai = 1; essai <= 3; essai++) {
    const r = await fetch(url.toString(), { headers: entetes(c), cache: 'no-store' })
    if (r.ok) return r.json().catch(() => null)
    derniereErreur = `HTTP ${r.status} ${(await r.text().catch(() => '')).slice(0, 200)}`
    // 429 et 5xx sont transitoires. Un autre 4xx est une erreur de
    // configuration : la répéter ne la corrigera pas.
    if (r.status !== 429 && r.status < 500) break
    await new Promise(res => setTimeout(res, essai * 1000))
  }
  throw new Error(`Zelty injoignable : ${derniereErreur}`)
}

/**
 * Récupère TOUTES les commandes d'une fenêtre, page par page.
 *
 * ⚠️ La pagination n'est pas un confort : sans elle, l'API s'arrête à 100
 * commandes par défaut. Le Fournil fait déjà 75 tickets un bon jour — deux
 * jours suffiraient à perdre des ventes en silence, et le rapprochement
 * quotidien crierait sans qu'on sache pourquoi.
 */
export async function recupererCommandes(
  c: ConfigZelty, debut: Date, fin: Date,
): Promise<{ commandes: unknown[]; url: string; pages: number }> {
  const toutes: unknown[] = []
  let offset = 0
  let pages = 0
  const premiere = construireUrl(c, debut, fin, 0).toString()

  // Borne dure : 50 pages = 10 000 commandes. Au-delà, c'est une boucle, pas
  // une journée de vente.
  while (pages < 50) {
    const lot = extraireListe(await appeler(c, construireUrl(c, debut, fin, offset)))
    pages++
    toutes.push(...lot)
    if (lot.length < PAR_PAGE) break
    offset += PAR_PAGE
  }
  return { commandes: toutes, url: premiere, pages }
}

/**
 * Récupère TOUT le catalogue.
 *
 * `limit=0` désactive la clause SQL LIMIT et renvoie tous les plats — c'est
 * documenté, et contre-intuitif : zéro veut dire « tout », pas « aucun ».
 * On garde quand même une pagination de repli, au cas où le comportement
 * changerait : un catalogue tronqué en silence casserait le rapprochement
 * sans le dire.
 *
 * `show_all=true` inclut les plats marqués « caisse seulement » (`zc_only`) :
 * on veut les connaître pour ne PAS les publier sur le site, pas les ignorer.
 */
export async function recupererPlats(
  c: ConfigZelty,
): Promise<{ plats: unknown[]; url: string; pages: number }> {
  const base = () => {
    const u = new URL(c.baseUrl.replace(/\/+$/, '') + c.cheminCatalogue)
    u.searchParams.set('show_all', 'true')
    u.searchParams.set('lang', 'fr')
    return u
  }
  const premiere = base()
  premiere.searchParams.set('limit', '0')

  const rep = await appeler(c, premiere)
  const tout = extraireListeCle(rep, 'dishes')
  if (tout.length > 0) return { plats: tout, url: premiere.toString(), pages: 1 }

  // Repli paginé si `limit=0` ne se comporte pas comme documenté.
  const tous: unknown[] = []
  let offset = 0, pages = 0
  while (pages < 20) {
    const u = base()
    u.searchParams.set('limit', '500')
    u.searchParams.set('offset', String(offset))
    const lot = extraireListeCle(await appeler(c, u), 'dishes')
    pages++
    tous.push(...lot)
    if (lot.length < 500) break
    offset += 500
  }
  return { plats: tous, url: premiere.toString(), pages: pages + 1 }
}

/** Extrait un tableau sous une clé nommée, ou sous les enveloppes usuelles. */
export function extraireListeCle(reponse: unknown, cle: string): unknown[] {
  if (Array.isArray(reponse)) return reponse
  if (reponse && typeof reponse === 'object') {
    const v = (reponse as Record<string, unknown>)[cle]
    if (Array.isArray(v)) return v
  }
  return extraireListe(reponse)
}
