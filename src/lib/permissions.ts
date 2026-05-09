// Module 28 v2 — Matrice de permissions par poste.
// Source de vérité : la spec produit livrée par le gérant.
// Format des routes : préfixes (ex '/admin/recettes' couvre /admin/recettes/engineering).
// Le wildcard '*' = tout autorisé (manager).

export type Poste =
  | 'manager'
  | 'second'
  | 'cuisine'        // = cuisinier (legacy enum employes.poste)
  | 'cuisinier'      // alias explicite
  | 'pizzaiolo'
  | 'salle'          // = serveur (legacy)
  | 'serveur'
  | 'bar'            // = barman (legacy)
  | 'barman'
  | 'receptionniste'
  | 'plonge'
  | 'extra'
  | 'autre'

export type Permissions = {
  allowed: string[]      // routes autorisées (préfixes). '*' = toutes.
  readonly?: string[]    // routes accessibles en lecture seule (Add/Edit/Delete cachés)
  main: string           // page d'accueil par défaut du rôle
  label: string          // affichage UI
}

// Routes communes à tous les employés actifs (briefing/info).
// /mon-espace : tableau de bord personnel = landing par défaut après login.
// /formation : lecture seule des manuels + quiz (admin UI = /admin/formation, manager-only).
const COMMUN_EMPLOYE = ['/mon-espace', '/equipes', '/formation', '/login', '/']

export const PERMISSIONS_PAR_POSTE: Record<Poste, Permissions> = {
  manager: {
    allowed: ['*'],
    main: '/admin/pilotage',
    label: 'Gérant / Manager',
  },

  second: {
    label: 'Second / Chef de cuisine',
    main: '/mon-espace',
    allowed: [
      '/cuisine', '/pizza',
      '/admin/recettes', '/admin/recettes/engineering',
      '/admin/ingredients', '/admin/stock', '/admin/fournisseurs',
      '/admin/boissons', '/admin/hygiene', '/admin/allergenes',
      '/admin/dechets', '/admin/previsionnel', '/admin/journal',
      ...COMMUN_EMPLOYE,
    ],
  },

  cuisine: {  // = cuisinier (poste legacy)
    label: 'Cuisinier',
    main: '/mon-espace',
    allowed: [
      '/cuisine',
      '/admin/recettes',
      '/admin/ingredients',
      '/admin/stock',
      '/admin/hygiene',                 // checklists et températures
      '/admin/allergenes',
      '/admin/dechets',
      ...COMMUN_EMPLOYE,
    ],
    readonly: [
      '/admin/recettes',
      '/admin/ingredients',
      '/admin/allergenes',
    ],
  },
  cuisinier: { /* alias — populé après ce bloc */ } as unknown as Permissions,

  pizzaiolo: {
    label: 'Pizzaiolo',
    main: '/mon-espace',
    allowed: [
      '/pizza',                         // poste pizza dédié
      '/admin/recettes',                // pizza uniquement (v2 filtre contenu)
      '/admin/ingredients',             // pizza uniquement (v2 filtre contenu)
      '/admin/stock',                   // déduction pizza (v2 filtre contenu)
      '/admin/hygiene',                 // checklists pizza (v2 filtre contenu)
      '/admin/allergenes',              // pizza uniquement (v2 filtre contenu)
      '/admin/dechets',
      ...COMMUN_EMPLOYE,
    ],
    readonly: [
      '/admin/recettes',
      '/admin/ingredients',
      '/admin/allergenes',
    ],
  },

  salle: { /* alias serveur */ } as unknown as Permissions,
  serveur: {
    label: 'Serveur',
    main: '/mon-espace',
    allowed: [
      '/serveur', '/caisse',
      '/admin/clients',
      '/admin/allergenes',
      '/admin/boissons',
      '/admin/reservations',
      '/admin/evenements',
      '/admin/hygiene',                 // checklists salle
      ...COMMUN_EMPLOYE,
    ],
    readonly: [
      '/admin/allergenes',
      '/admin/boissons',
      '/admin/reservations',
      '/admin/evenements',
    ],
  },

  bar: { /* alias barman */ } as unknown as Permissions,
  barman: {
    label: 'Barman',
    main: '/mon-espace',
    allowed: [
      '/bar', '/caisse',
      '/admin/boissons',
      '/admin/stock',                   // boissons uniquement (v2)
      '/admin/ingredients',             // boissons uniquement (v2)
      '/admin/fournisseurs',            // boissons uniquement (v2)
      '/admin/clients',                 // allergies boissons
      '/admin/hygiene',                 // checklists bar
      '/admin/dechets',
      ...COMMUN_EMPLOYE,
    ],
  },

  receptionniste: {
    label: 'Réceptionniste',
    main: '/mon-espace',
    allowed: [
      '/admin/reservations',
      '/admin/evenements',
      '/admin/clients',
      '/admin/chambres',                // route legacy si existe, sinon dans reservations
      '/admin/groupes',
      '/admin/allergenes',
      ...COMMUN_EMPLOYE,
    ],
    readonly: [
      '/admin/allergenes',
    ],
  },

  plonge: {
    label: 'Plongeur',
    main: '/mon-espace',
    allowed: [
      '/admin/hygiene',                 // checklists nettoyage uniquement (v2)
      '/admin/dechets',
      ...COMMUN_EMPLOYE,
    ],
  },
  extra: { /* alias plonge */ } as unknown as Permissions,

  autre: {
    label: 'Autre',
    main: '/mon-espace',
    allowed: [...COMMUN_EMPLOYE],
  },
}

// Aliases : poste legacy → poste fonctionnel
;(PERMISSIONS_PAR_POSTE as Record<string, Permissions>)['cuisinier'] = PERMISSIONS_PAR_POSTE.cuisine
;(PERMISSIONS_PAR_POSTE as Record<string, Permissions>)['salle']     = PERMISSIONS_PAR_POSTE.serveur
;(PERMISSIONS_PAR_POSTE as Record<string, Permissions>)['bar']       = PERMISSIONS_PAR_POSTE.barman
;(PERMISSIONS_PAR_POSTE as Record<string, Permissions>)['extra']     = PERMISSIONS_PAR_POSTE.plonge

export type CustomPermissions = {
  allowed?: string[]                    // routes accordées en plus de la matrice
  denied?: string[]                     // routes interdites en plus de la matrice
  readonly?: string[]                   // routes forcées en lecture seule en plus de la matrice
  writable?: string[]                   // routes où la lecture seule de la matrice est levée
}

/** Renvoie les permissions effectives (matrice + overrides). */
export function getPermissions(poste: string | null | undefined): Permissions {
  if (!poste) return PERMISSIONS_PAR_POSTE.autre
  return PERMISSIONS_PAR_POSTE[poste as Poste] ?? PERMISSIONS_PAR_POSTE.autre
}

/** Match d'une route en préfixe (path === route OR path commence par route + '/'). */
function pathMatchPrefix(path: string, prefix: string): boolean {
  // Strip query string for matching
  const cleanPath = path.split('?')[0]
  const cleanPrefix = prefix.split('?')[0]
  return cleanPath === cleanPrefix || cleanPath.startsWith(cleanPrefix + '/')
}

/**
 * Vérifie si un poste (+ overrides) a accès à un chemin.
 * Règles d'évaluation (par ordre) :
 *  1. denied (override) → false
 *  2. allowed (override) → true
 *  3. allowed (matrice, '*' inclus) → true
 *  4. sinon → false
 */
export function canAccess(
  poste: string | null | undefined,
  path: string,
  overrides?: CustomPermissions | null,
): boolean {
  const perms = getPermissions(poste)

  // Override DENY (priorité absolue)
  if (overrides?.denied?.some(p => pathMatchPrefix(path, p))) return false

  // Override ALLOW
  if (overrides?.allowed?.some(p => pathMatchPrefix(path, p))) return true

  // Matrice — '*' = tout
  if (perms.allowed.includes('*')) return true
  return perms.allowed.some(p => pathMatchPrefix(path, p))
}

/** Page d'accueil du rôle (pour le redirect post-login + accès non autorisé). */
export function getMainRoute(poste: string | null | undefined): string {
  return getPermissions(poste).main
}

/**
 * Indique si un chemin est en lecture seule pour ce poste.
 * Le manager et les overrides "writable" lèvent la restriction.
 * Les overrides "readonly" forcent la restriction même si la matrice ne le prévoit pas.
 */
export function isReadOnly(
  poste: string | null | undefined,
  path: string,
  overrides?: CustomPermissions | null,
): boolean {
  // Manager (poste 'manager' OU '*' dans allowed) = jamais en lecture seule.
  const perms = getPermissions(poste)
  if (perms.allowed.includes('*')) return false

  // Override writable lève la restriction même si matrice impose readonly.
  if (overrides?.writable?.some(p => pathMatchPrefix(path, p))) return false

  // Override readonly impose la restriction.
  if (overrides?.readonly?.some(p => pathMatchPrefix(path, p))) return true

  // Matrice
  return (perms.readonly ?? []).some(p => pathMatchPrefix(path, p))
}

/** Liste des items de nav qu'un poste peut voir (pour filtrer AdminNav). */
export function filterNavItems<T extends { href: string }>(
  items: T[],
  poste: string | null | undefined,
  overrides?: CustomPermissions | null,
): T[] {
  return items.filter(it => canAccess(poste, it.href, overrides))
}

// ─── Filtres contenu par poste ────────────────────────────────────
//
// Certains postes voient uniquement une partie des données.
// Ex : pizzaiolo → recettes / ingrédients / allergènes "pizza" uniquement.
//
// Les pages serveur appellent getPosteFilter() et filtrent leurs requêtes
// Supabase. Si renvoie null, pas de filtre (manager + accès complet).

export type PosteContentFilter = {
  /** Tags de tag_destination autorisés sur les recettes (et ingrédients
   *  utilisés par ces recettes). null = tous tags autorisés. */
  recetteTags: Array<'CUISINE' | 'PIZZA' | 'BAR'> | null
}

export function getPosteFilter(poste: string | null | undefined): PosteContentFilter {
  switch (poste) {
    case 'pizzaiolo':
      return { recetteTags: ['PIZZA'] }
    case 'bar':
    case 'barman':
      return { recetteTags: ['BAR'] }
    // Cuisinier / second / serveur : pas de filtre contenu (la matrice
    // gère déjà l'accès + lecture seule). Manager : tout.
    default:
      return { recetteTags: null }
  }
}
