// Réservation de table — QUAND une table peut être demandée.
//
// Fonctions PURES, client-safe : aucune base, aucun réseau. L'API les
// applique, le site les affiche, le test les rejoue sans serveur.
//
// ─── Pourquoi la réservation ouvre AVANT le restaurant ─────────────────────
//
// Le site disait le contraire : « tant que la salle n'a pas ouvert,
// "Réserver une table" n'aurait aucun sens » — et le bouton d'appel poussait
// la commande au fournil à la place. C'est l'inverse qui est vrai. Une salle
// ne se remplit pas le jour où elle ouvre : elle se remplit les jours qui
// précèdent. Pour l'inauguration du samedi 3 octobre 2026, le seul moment
// utile pour prendre les réservations, c'est MAINTENANT.
//
// Ce qui ne peut pas être avancé, en revanche, c'est la DATE du repas. D'où
// la règle : on réserve dès aujourd'hui, pour une date qui ne précède pas
// l'ouverture de la salle.
//
// ⚠️ La date d'ouverture est portée par `restaurant_salle`, PAS par
// `reservation_table` : c'est la salle qui ouvre, la réservation n'est que le
// guichet. Lire la date du mauvais module laisserait réserver pour demain.

import {
  HORAIRES_SERVICE,
  DERNIERE_COMMANDE,
  cartesDuService,
  type Service,
} from './services-restaurant'

/** Pas entre deux horaires proposés, en minutes. */
export const PAS_MINUTES = 15

/** Combien de temps avant la fin du service on peut encore s'asseoir, quand
 *  le service n'a pas d'heure de dernière commande déclarée. */
const MARGE_FIN_MIN = 30

/** Fourchette acceptée pour le nombre de couverts.
 *  Au-delà, ce n'est plus une table : c'est un groupe, et il passe par
 *  /admin/groupes (menu négocié, arrhes) — pas par le formulaire public. */
export const COUVERTS_MIN = 1
export const COUVERTS_MAX = 12

const hhmmEnMin = (s: string): number => {
  const [h, m] = s.split(':')
  return Number(h) * 60 + Number(m ?? 0)
}
const minEnHhmm = (n: number): string =>
  `${String(Math.floor(n / 60)).padStart(2, '0')}:${String(n % 60).padStart(2, '0')}`

/** Dernière arrivée possible pour un service.
 *
 *  Elle se DÉDUIT, elle ne se saisit pas ailleurs : c'est l'heure de dernière
 *  commande quand le gérant en a fixé une (22h30 le soir), sinon la fin du
 *  service moins une demi-heure. Faire asseoir quelqu'un après l'heure de
 *  dernière commande, c'est l'installer devant une cuisine qui ferme. */
export function derniereArrivee(service: Service): string {
  const commande = DERNIERE_COMMANDE[service]
  if (commande) return commande
  return minEnHhmm(hhmmEnMin(HORAIRES_SERVICE[service].fin) - MARGE_FIN_MIN)
}

/** `2026-10-03` → 0 (dimanche) … 6 (samedi), sans passer par le fuseau local.
 *  `new Date('2026-10-03')` est interprété en UTC : à l'ouest de Greenwich,
 *  `getDay()` rendrait la veille. */
export function jourDeLaSemaine(date: string): number {
  const [a, m, j] = date.split('-').map(Number)
  return new Date(Date.UTC(a, m - 1, j)).getUTCDay()
}

/** Les services servis ce jour-là, dans l'ordre.
 *  Un service sans aucune carte n'est pas un service : personne ne cuisine. */
export function servicesDuJour(date: string): Service[] {
  const jour = jourDeLaSemaine(date)
  return (['midi', 'soir'] as Service[]).filter(s => cartesDuService(jour, s).length > 0)
}

export type Creneau = { heure: string; service: Service }

/** Tous les horaires proposables un jour donné. */
export function creneauxDuJour(date: string): Creneau[] {
  const out: Creneau[] = []
  for (const service of servicesDuJour(date)) {
    const debut = hhmmEnMin(HORAIRES_SERVICE[service].debut)
    const fin = hhmmEnMin(derniereArrivee(service))
    for (let t = debut; t <= fin; t += PAS_MINUTES) out.push({ heure: minEnHhmm(t), service })
  }
  return out
}

/** Première date pour laquelle une table peut être demandée.
 *
 *  - salle ouverte      → aujourd'hui ;
 *  - salle annoncée     → son jour d'ouverture ;
 *  - ni l'un ni l'autre → null, et on ne prend AUCUNE réservation.
 *
 *  ⚠️ Le repli est le refus. Inventer une date ferait venir quelqu'un devant
 *  une porte fermée, et c'est le genre d'erreur qu'un client raconte. */
export function premiereDateReservable(
  salleOuverte: boolean,
  dateOuvertureSalle: string | null,
  aujourdhui: string,
): string | null {
  if (salleOuverte) return aujourdhui
  if (!dateOuvertureSalle) return null
  return dateOuvertureSalle > aujourdhui ? dateOuvertureSalle : aujourdhui
}

export type Refus = { ok: false; motif: string }
export type Accord = { ok: true; service: Service }

/** LE contrôle. L'API l'applique ; le site ne fait que l'anticiper.
 *
 *  ⚠️ Une interface ne protège de rien : le sélecteur du site peut être
 *  contourné, et un formulaire ancien gardé ouvert dans un onglet enverra les
 *  anciennes heures. Même leçon que la précommande de pizza — le contrôle qui
 *  compte est celui de la route. */
export function verifierReservation(input: {
  date: string
  heure: string
  couverts: number
  premiereDate: string | null
}): Accord | Refus {
  const { date, heure, couverts, premiereDate } = input

  if (!premiereDate) {
    return { ok: false, motif: 'Les réservations ne sont pas encore ouvertes.' }
  }
  if (date < premiereDate) {
    return {
      ok: false,
      motif: `Nous ne prenons pas de réservation avant le ${enClair(premiereDate)}.`,
    }
  }
  if (couverts < COUVERTS_MIN || couverts > COUVERTS_MAX) {
    return {
      ok: false,
      motif: `Au-delà de ${COUVERTS_MAX} personnes, écrivez-nous : nous organisons l’accueil des groupes à part.`,
    }
  }

  const creneaux = creneauxDuJour(date)
  if (creneaux.length === 0) {
    return { ok: false, motif: 'Nous ne servons pas ce jour-là.' }
  }

  const trouve = creneaux.find(c => c.heure === normaliserHeure(heure))
  if (!trouve) {
    return { ok: false, motif: `Cet horaire n’est pas servi. ${phraseServices(date)}` }
  }
  return { ok: true, service: trouve.service }
}

/** « 20:00:00 », « 20:0 » et « 20:00 » désignent le même horaire. */
export function normaliserHeure(heure: string): string {
  const [h, m] = heure.split(':')
  return `${String(Number(h)).padStart(2, '0')}:${String(Number(m ?? 0)).padStart(2, '0')}`
}

/** « Ce jour-là, nous servons de 12h à 14h et de 19h à 22h30. » */
export function phraseServices(date: string): string {
  const services = servicesDuJour(date)
  if (services.length === 0) return 'Nous ne servons pas ce jour-là.'
  const plages = services.map(s => {
    const d = heureCourte(HORAIRES_SERVICE[s].debut)
    const f = heureCourte(derniereArrivee(s))
    return `de ${d} à ${f}`
  })
  return `Ce jour-là, nous accueillons ${plages.join(' et ')}.`
}

/** « 14:30 » → « 14h30 », « 19:00 » → « 19h ». */
export function heureCourte(hhmm: string): string {
  const [h, m] = hhmm.split(':')
  return `${Number(h)}h${m && m !== '00' ? m : ''}`
}

/** « 2026-10-03 » → « samedi 3 octobre ». */
export function enClair(date: string): string {
  const [a, m, j] = date.split('-').map(Number)
  return new Intl.DateTimeFormat('fr-FR', {
    weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC',
  }).format(new Date(Date.UTC(a, m - 1, j)))
}

/** La date du jour à Paris, pas celle du serveur.
 *
 *  ⚠️ Vercel tourne en UTC : à 00h30 heure française, `toISOString()` rend
 *  encore la VEILLE. La date minimale du formulaire serait alors dans le
 *  passé, et le contrôle laisserait passer une réservation pour hier. */
export function aujourdhuiParis(maintenant: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Paris', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(maintenant)
}
