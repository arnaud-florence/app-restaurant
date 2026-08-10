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
  /** Amplitude d'ouverture du fournil — borne les heures de retrait proposées. */
  ouverture: string        // 'HH:MM'
  fermeture: string        // 'HH:MM'
}

export const LIVRAISON_FOURNIL_DEFAUT: ConfigLivraisonFournil = {
  communes: ['Sainte-Anastasie-sur-Issole'],
  heureLimite: '08:30',
  heureTournee: '10:00',
  minimumTtc: 0,
  fraisTtc: 0,
  ouverture: '06:00',
  fermeture: '20:00',
}

// ─── Calcul de la tournée de livraison ───────────────────────────────
// ⚠️ TOUT se calcule en heure de Paris, jamais en heure serveur : Vercel
// tourne en UTC, donc `new Date().getHours()` renvoie 8h alors qu'il est 10h
// au fournil. Sans ça, l'heure limite de 8h30 basculerait en réalité à 6h30
// l'été — et les clients perdraient deux heures de commande chaque matin.

const FUSEAU = 'Europe/Paris'

/** Composants date/heure d'un instant, lus dans le fuseau de Paris. */
function partiesParis(instant: Date): { annee: number; mois: number; jour: number; heures: number; minutes: number } {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: FUSEAU, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false,
  })
  const p = Object.fromEntries(fmt.formatToParts(instant).map(x => [x.type, x.value]))
  return {
    annee: Number(p.year), mois: Number(p.month), jour: Number(p.day),
    heures: Number(p.hour === '24' ? '0' : p.hour), minutes: Number(p.minute),
  }
}

/** Décalage UTC de Paris (en minutes) à un instant donné — gère l'heure d'été. */
function decalageParisMin(instant: Date): number {
  const p = partiesParis(instant)
  const commeUtc = Date.UTC(p.annee, p.mois - 1, p.jour, p.heures, p.minutes)
  // Arrondi à la minute pour neutraliser les secondes.
  return Math.round((commeUtc - Math.floor(instant.getTime() / 60000) * 60000) / 60000)
}

/** Instant UTC correspondant à une date + heure locale de Paris. */
export function instantParis(dateISO: string, heureHHMM: string): Date {
  const [a, m, j] = dateISO.split('-').map(Number)
  const [h, min] = heureHHMM.split(':').map(Number)
  // Première approximation en UTC, puis correction par le décalage réel.
  const approx = new Date(Date.UTC(a, (m ?? 1) - 1, j ?? 1, h ?? 0, min ?? 0))
  const decalage = decalageParisMin(approx)
  return new Date(approx.getTime() - decalage * 60000)
}

/** Tournée retenue pour une commande passée à `maintenant`.
 *  Avant l'heure limite → tournée du jour. Après → tournée du lendemain.
 *  `creneau` est l'instant UTC du départ de tournée, à stocker dans
 *  `commandes.creneau_retrait`. */
export function tourneePour(
  maintenant: Date,
  cfg: ConfigLivraisonFournil = LIVRAISON_FOURNIL_DEFAUT,
): { date: string; jourMeme: boolean; creneau: string } {
  const p = partiesParis(maintenant)
  const [hLim, mLim] = cfg.heureLimite.split(':').map(Number)

  const minutesMaintenant = p.heures * 60 + p.minutes
  const minutesLimite = (hLim ?? 8) * 60 + (mLim ?? 30)
  const jourMeme = minutesMaintenant <= minutesLimite

  // Décalage de jour effectué sur une date « nue », sans repasser par un
  // fuseau : évite les erreurs de bord autour des changements d'heure.
  const base = new Date(Date.UTC(p.annee, p.mois - 1, p.jour))
  if (!jourMeme) base.setUTCDate(base.getUTCDate() + 1)
  const date = base.toISOString().slice(0, 10)

  return { date, jourMeme, creneau: instantParis(date, cfg.heureTournee).toISOString() }
}

/** Heures de retrait proposées au fournil pour une date donnée.
 *  Pas de réservation de capacité ici : la boulangerie vend au comptoir en
 *  continu, l'heure sert à préparer le sachet, pas à bloquer un créneau.
 *  Les heures déjà passées sont retirées quand la date est aujourd'hui. */
export function heuresRetraitFournil(
  dateISO: string,
  maintenant: Date,
  cfg: ConfigLivraisonFournil = LIVRAISON_FOURNIL_DEFAUT,
): Array<{ heure: string; iso: string }> {
  const [hOuv] = cfg.ouverture.split(':').map(Number)
  const [hFer] = cfg.fermeture.split(':').map(Number)

  const p = partiesParis(maintenant)
  const aujourdhui = `${p.annee}-${String(p.mois).padStart(2, '0')}-${String(p.jour).padStart(2, '0')}`
  // 30 min de préparation minimum sur la journée en cours.
  const minHeure = dateISO === aujourdhui ? p.heures + (p.minutes > 30 ? 2 : 1) : hOuv

  const out: Array<{ heure: string; iso: string }> = []
  for (let h = Math.max(hOuv ?? 6, minHeure); h < (hFer ?? 20); h++) {
    const hh = `${String(h).padStart(2, '0')}:00`
    out.push({ heure: `${h}h`, iso: instantParis(dateISO, hh).toISOString() })
  }
  return out
}

/** Normalise un nom de commune pour comparaison (casse, accents, tirets). */
export function normaliseCommune(s: string): string {
  return s.trim().toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[\s'-]+/g, '-')
}

/** La commune est-elle dans la zone livrée ? */
export function communeLivrable(commune: string, cfg: ConfigLivraisonFournil): boolean {
  const cible = normaliseCommune(commune)
  return cfg.communes.some(c => normaliseCommune(c) === cible)
}
