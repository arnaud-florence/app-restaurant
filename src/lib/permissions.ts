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
  main: string           // page d'accueil par défaut du rôle
  label: string          // affichage UI
}

// Routes communes à tous les employés actifs (briefing/info)
const COMMUN_EMPLOYE = ['/equipes', '/admin/formation', '/login', '/']

export const PERMISSIONS_PAR_POSTE: Record<Poste, Permissions> = {
  manager: {
    allowed: ['*'],
    main: '/admin/pilotage',
    label: 'Gérant / Manager',
  },

  second: {
    label: 'Second / Chef de cuisine',
    main: '/cuisine',
    allowed: [
      '/cuisine',
      '/admin/recettes', '/admin/recettes/engineering',
      '/admin/ingredients', '/admin/stock', '/admin/fournisseurs',
      '/admin/boissons', '/admin/hygiene', '/admin/allergenes',
      '/admin/dechets', '/admin/previsionnel', '/admin/journal',
      ...COMMUN_EMPLOYE,
    ],
  },

  cuisine: {  // = cuisinier (poste legacy)
    label: 'Cuisinier',
    main: '/cuisine',
    allowed: [
      '/cuisine',
      '/admin/recettes',                // lecture seule (v2)
      '/admin/ingredients',             // lecture seule (v2)
      '/admin/stock',                   // déduction tablette uniquement (v2)
      '/admin/hygiene',                 // checklists et températures
      '/admin/allergenes',              // lecture seule (v2)
      '/admin/dechets',
      ...COMMUN_EMPLOYE,
    ],
  },
  cuisinier: { /* alias — populé après ce bloc */ } as unknown as Permissions,

  pizzaiolo: {
    label: 'Pizzaiolo',
    main: '/cuisine?role=pizzaiolo',
    allowed: [
      '/cuisine',                       // colonne pizza uniquement (v2 filtre contenu)
      '/admin/recettes',                // pizza uniquement (v2)
      '/admin/ingredients',             // pizza uniquement (v2)
      '/admin/stock',                   // déduction pizza (v2)
      '/admin/hygiene',                 // checklists pizza (v2)
      '/admin/allergenes',              // pizza uniquement (v2)
      '/admin/dechets',
      ...COMMUN_EMPLOYE,
    ],
  },

  salle: { /* alias serveur */ } as unknown as Permissions,
  serveur: {
    label: 'Serveur',
    main: '/serveur',
    allowed: [
      '/serveur', '/caisse',
      '/admin/clients',
      '/admin/allergenes',              // lecture seule (v2)
      '/admin/boissons',                // lecture seule (v2)
      '/admin/reservations',            // lecture seule (v2)
      '/admin/evenements',              // lecture seule (v2)
      '/admin/hygiene',                 // checklists salle
      ...COMMUN_EMPLOYE,
    ],
  },

  bar: { /* alias barman */ } as unknown as Permissions,
  barman: {
    label: 'Barman',
    main: '/bar',
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
    main: '/admin/reservations',
    allowed: [
      '/admin/reservations',
      '/admin/evenements',
      '/admin/clients',
      '/admin/chambres',                // route legacy si existe, sinon dans reservations
      '/admin/groupes',
      '/admin/allergenes',              // lecture seule (v2)
      ...COMMUN_EMPLOYE,
    ],
  },

  plonge: {
    label: 'Plongeur',
    main: '/admin/hygiene',
    allowed: [
      '/admin/hygiene',                 // checklists nettoyage uniquement (v2)
      '/admin/dechets',
      ...COMMUN_EMPLOYE,
    ],
  },
  extra: { /* alias plonge */ } as unknown as Permissions,

  autre: {
    label: 'Autre',
    main: '/login',
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

/** Liste des items de nav qu'un poste peut voir (pour filtrer AdminNav). */
export function filterNavItems<T extends { href: string }>(
  items: T[],
  poste: string | null | undefined,
  overrides?: CustomPermissions | null,
): T[] {
  return items.filter(it => canAccess(poste, it.href, overrides))
}
