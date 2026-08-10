// Activation par activité — TYPES + CONSTANTES + REPLI.
//
// Ce fichier est importé côté SERVEUR **et** CLIENT → aucun import server-only,
// aucun accès base. La lecture en base est dans `./server.ts`.
//
// Contexte : le Fournil ouvre seul (juillet-septembre 2026), le restaurant
// n'ouvre que fin octobre 2026. Chaque brique du produit est allumée ou éteinte
// par une ligne de la table `activites_modules` (migration 0110), pilotée depuis
// /admin/etablissements → onglet « Activités ».

import type { Activite } from '@/lib/activites'

/** Clés de module. Toute nouvelle brique activable s'ajoute ici ET en base. */
export type ModuleCle =
  // ── Fournil ──
  | 'fournil'
  | 'fournil_commande_en_ligne'
  | 'fournil_livraison'
  | 'relais_colis'
  | 'fdj'
  | 'tabac'
  // ── Restaurant ──
  | 'restaurant_salle'
  | 'bar'
  | 'pizzeria'
  | 'snack_emporter'
  | 'reservation_table'
  | 'chambres'
  | 'evenementiel'
  // ── Commun ──
  | 'fidelite'

export type ModuleActivation = {
  cle: ModuleCle
  activite: Activite | 'commun'
  libelle: string
  emoji: string
  description: string | null
  actif: boolean
  /** Afficher « ouverture prochainement » sur le site quand actif = false. */
  teaser: boolean
  teaser_texte: string | null
  date_ouverture_prevue: string | null
  ordre: number
}

/** État d'activation résolu : un booléen par clé. */
export type EtatActivation = Record<ModuleCle, boolean>

export const MODULE_CLES: ModuleCle[] = [
  'fournil', 'fournil_commande_en_ligne', 'fournil_livraison', 'relais_colis',
  'fdj', 'tabac',
  'restaurant_salle', 'bar', 'pizzeria', 'snack_emporter', 'reservation_table',
  'chambres', 'evenementiel',
  'fidelite',
]

// ─────────────────────────────────────────────────────────────────────
// REPLI DE SÉCURITÉ
// ─────────────────────────────────────────────────────────────────────
// Utilisé quand la base (ou l'API) est injoignable.
//
// ⚠️ RÈGLE : le repli n'ouvre QUE le Fournil. Une panne ne doit jamais
// révéler au public une activité qui n'a pas encore ouvert. Se tromper
// dans ce sens est réparable ; dans l'autre, non.
export const REPLI_FOURNIL_SEUL: EtatActivation = {
  fournil: true,
  fournil_commande_en_ligne: true,
  fournil_livraison: true,
  relais_colis: true,
  fdj: false,
  tabac: false,
  restaurant_salle: false,
  bar: false,
  pizzeria: false,
  snack_emporter: false,
  reservation_table: false,
  chambres: false,
  evenementiel: false,
  fidelite: false,
}

/** Construit un EtatActivation depuis les lignes de la base. */
export function etatDepuisModules(modules: ModuleActivation[]): EtatActivation {
  const etat = { ...REPLI_FOURNIL_SEUL }
  for (const m of modules) {
    if (MODULE_CLES.includes(m.cle)) etat[m.cle] = m.actif
  }
  return etat
}

// ─────────────────────────────────────────────────────────────────────
// Correspondances module → reste de l'application
// ─────────────────────────────────────────────────────────────────────

/** tag_destination des recettes couvert par chaque module.
 *  Sert à filtrer la carte publique et les écrans de production. */
export const TAGS_PAR_MODULE: Partial<Record<ModuleCle, string[]>> = {
  fournil: ['FOURNIL'],
  restaurant_salle: ['CUISINE'],
  pizzeria: ['PIZZA'],
  bar: ['BAR'],
  snack_emporter: ['SNACKING'],
}

/** Slugs `etablissements` couverts par chaque module. */
export const PDV_PAR_MODULE: Partial<Record<ModuleCle, string[]>> = {
  fournil: ['fournil'],
  relais_colis: ['relais-colis'],
  fdj: ['fdj'],
  tabac: ['tabac'],
  bar: ['bar'],
  snack_emporter: ['snack-emporter'],
}

/** Routes de l'outil conditionnées par un module.
 *  Préfixes — '/admin/reservations' couvre '/admin/reservations/evenements'. */
export const ROUTES_PAR_MODULE: Partial<Record<ModuleCle, string[]>> = {
  restaurant_salle: ['/serveur', '/cuisine', '/admin/capacite-cuisine'],
  pizzeria: ['/pizza'],
  bar: ['/bar', '/comptoir/bar', '/admin/boissons'],
  snack_emporter: ['/emporter', '/comptoir/snack-emporter', '/borne', '/admin/borne', '/admin/borne-pin'],
  reservation_table: ['/admin/reservations'],
  chambres: ['/admin/chambres', '/reception'],
  evenementiel: ['/admin/groupes'],
  fournil: ['/fournil', '/comptoir/fournil'],
  fournil_livraison: ['/livreur'],
  fidelite: ['/admin/clients/fidelite'],
}

/** Renvoie les tags de destination visibles compte tenu de l'état d'activation. */
export function tagsActifs(etat: EtatActivation): string[] {
  const tags = new Set<string>()
  for (const [cle, list] of Object.entries(TAGS_PAR_MODULE)) {
    if (etat[cle as ModuleCle]) list.forEach(t => tags.add(t))
  }
  return [...tags]
}

/** true si la route est éteinte par un module inactif. */
export function routeEteinte(pathname: string, etat: EtatActivation): ModuleCle | null {
  for (const [cle, prefixes] of Object.entries(ROUTES_PAR_MODULE)) {
    if (etat[cle as ModuleCle]) continue
    if (prefixes.some(p => pathname === p || pathname.startsWith(p + '/'))) {
      return cle as ModuleCle
    }
  }
  return null
}

// ─────────────────────────────────────────────────────────────────────
// Paramètres de la livraison Fournil (clés de la table `parametres`)
// ─────────────────────────────────────────────────────────────────────
export type ConfigLivraisonFournil = {
  /** Communes livrées. Le site propose un choix fermé → pas de hors-zone possible. */
  communes: string[]
  /** Au-delà de cette heure, la commande part sur la tournée du lendemain. */
  heureLimite: string      // 'HH:MM'
  /** Heure de départ de la tournée, affichée au client. */
  heureTournee: string     // 'HH:MM'
  minimumTtc: number
  fraisTtc: number
}

export const LIVRAISON_FOURNIL_DEFAUT: ConfigLivraisonFournil = {
  communes: ['Sainte-Anastasie-sur-Issole'],
  heureLimite: '08:30',
  heureTournee: '10:00',
  minimumTtc: 0,
  fraisTtc: 0,
}

/** Date de livraison retenue pour une commande passée à `maintenant`.
 *  Avant l'heure limite → tournée du jour. Après → tournée du lendemain. */
export function dateLivraisonPour(
  maintenant: Date,
  cfg: ConfigLivraisonFournil = LIVRAISON_FOURNIL_DEFAUT,
): { date: string; jourMeme: boolean } {
  const [h, m] = cfg.heureLimite.split(':').map(Number)
  const limite = new Date(maintenant)
  limite.setHours(h ?? 8, m ?? 30, 0, 0)

  const jourMeme = maintenant <= limite
  const cible = new Date(maintenant)
  if (!jourMeme) cible.setDate(cible.getDate() + 1)

  return { date: cible.toISOString().slice(0, 10), jourMeme }
}
