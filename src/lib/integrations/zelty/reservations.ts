// Réservations Zelty ↔ nos réservations de table.
//
// Traduction PURE : aucun réseau, aucune base. Le contrat ci-dessous n'est pas
// déduit d'une documentation — celle de Zelty exige une connexion au
// back-office — mais RELEVÉ sur des données réelles le 24/09/2026, en créant
// puis en annulant trois réservations d'essai sur le compte Casatasia (mode
// école). Chaque valeur écrite ici a été vue.
//
// ─── Le contrat, tel qu'il est vraiment ────────────────────────────────────
//
// ⚠️⚠️ `GET /bookings` SANS `?date=` RÉPOND `{"bookings": []}`, PAS UNE ERREUR.
// C'est le piège central de cet endpoint, et il est du même genre que
// `expand[]=items` sur les commandes : on interroge, on reçoit 200, on conclut
// « aucune réservation » — et on rate tout le carnet. Ni `from`/`to`, ni
// `start`/`end`, ni `day`, ni `limit` ne filtrent quoi que ce soit : seul
// `?date=AAAA-MM-JJ` rend les réservations, UN JOUR À LA FOIS. Un miroir qui
// veut une semaine fait sept appels.
//
// ⚠️ `POST /bookings` exige `booking_for`, `places` et `customer` — et
// `customer` doit être un OBJET, pas un identifiant (« Should be an object »).
// Zelty crée la fiche client tout seul : inutile de la créer d'abord.
//
// ⚠️ `remote_id` est accepté et CONSERVÉ. C'est ce qui rend la correspondance
// exacte dès le premier envoi, comme pour le catalogue (0137) — plus jamais de
// rapprochement par le nom, et un client renommé reste la même réservation.
//
// ⚠️ `src` vaut `bo` pour une saisie au back-office et `web` pour une création
// par l'API. Zelty le pose LUI-MÊME : c'est exactement notre `canal`, et il
// dit gratuitement d'où vient chaque réservation.
//
// ⚠️ ON NE PEUT NI MODIFIER NI ANNULER PAR L'API. `GET /bookings/{id}`,
// `PATCH` et `DELETE` répondent 404 sous toutes les formes essayées (par id,
// par uid, sur la collection avec l'id dans le corps), alors même que
// `OPTIONS` annonce `GET, POST, PATCH, DELETE, PUT`. Conséquence directe : une
// annulation faite chez nous ne peut PAS être poussée vers la caisse. Ne pas
// promettre cette synchronisation-là tant que Zelty ne l'ouvre pas.
//
// ⚠️ « Confirmation automatique des réservations » est COCHÉE dans les
// paramètres du restaurant. Une réservation créée sans `status` explicite
// ressortirait donc confirmée — et le client recevrait un mail de
// confirmation — alors que notre modèle est « demande, que le manager
// valide ». On envoie donc TOUJOURS `status` explicitement.

import { z } from 'zod'

/** Les cinq états d'une réservation Zelty.
 *  Relevés sur les onglets du back-office (`data-value`), donc sur la source,
 *  pas devinés. */
export const STATUT_ZELTY = {
  EN_ATTENTE: 0,
  CONFIRMEE: 80,
  INSTALLEE: 96,
  ANNULEE: 192,
  TERMINEE: 255,
} as const

/** Motif d'annulation. 32 = « Annulée par le restaurant », observé.
 *  ⚠️ Le back-office propose aussi « No show », dont le code n'a pas été
 *  relevé : il se lira à la première occurrence réelle. En attendant, tout
 *  motif inconnu est traité comme une annulation simple — jamais comme un
 *  no-show, qui est un reproche fait au client. */
export const MOTIF_ANNULATION = { RESTAURANT: 32 } as const

/** Notre statut ← celui de la caisse. */
export function statutDepuisZelty(status: number): string {
  switch (status) {
    case STATUT_ZELTY.EN_ATTENTE: return 'demande'
    case STATUT_ZELTY.CONFIRMEE:  return 'confirmee'
    case STATUT_ZELTY.INSTALLEE:  return 'arrivee'
    case STATUT_ZELTY.ANNULEE:    return 'annulee'
    case STATUT_ZELTY.TERMINEE:   return 'terminee'
    // ⚠️ Un état inconnu ne devient PAS « confirmée » : on ne réserve pas une
    // table sur un code qu'on ne comprend pas. Il reste une demande, donc il
    // passe sous les yeux de quelqu'un.
    default: return 'demande'
  }
}

/** Celui de la caisse ← le nôtre.
 *  `no_show` n'a pas d'équivalent dans `status` — Zelty le range dans
 *  `cancel_reason` — donc il part en « annulée », ce qui est vrai. */
export function statutVersZelty(statut: string): number {
  switch (statut) {
    case 'demande':   return STATUT_ZELTY.EN_ATTENTE
    case 'confirmee': return STATUT_ZELTY.CONFIRMEE
    case 'arrivee':   return STATUT_ZELTY.INSTALLEE
    case 'terminee':  return STATUT_ZELTY.TERMINEE
    case 'annulee':
    case 'no_show':   return STATUT_ZELTY.ANNULEE
    default:          return STATUT_ZELTY.EN_ATTENTE
  }
}

// ⚠️ TOUT CE QUI PEUT ÊTRE NUL EST EN `.nullish()`. Sur le catalogue, un seul
// champ à `null` avait fait rejeter 84 plats sur 84 par zod — `.optional()`
// accepte `undefined` mais REFUSE `null` — et le miroir se croyait vide sans
// qu'aucune erreur ne remonte. Les données réelles observées ici portent
// `remote_id`, `id_command`, `arrived_at`, `closed_at`, `table`, `final_price`
// et la moitié de la fiche client à `null`.
const clientZelty = z.object({
  id: z.number(),
  uuid: z.string().nullish(),
  name: z.string().nullish(),
  fname: z.string().nullish(),
  nice_name: z.string().nullish(),
  phone: z.string().nullish(),
  mail: z.string().nullish(),
}).passthrough()

export const reservationZelty = z.object({
  id: z.number(),
  uid: z.string().nullish(),
  remote_id: z.string().nullish(),
  id_customer: z.number().nullish(),
  created_at: z.string().nullish(),
  /** ISO 8601 AVEC fuseau : « 2027-01-04T20:30:00+01:00 ». */
  booking_for: z.string(),
  arrived_at: z.string().nullish(),
  closed_at: z.string().nullish(),
  table: z.number().nullish(),
  places: z.number(),
  status: z.number(),
  cancel_reason: z.number().nullish(),
  /** `bo` = saisi au back-office, `web` = créé par l'API. */
  src: z.string().nullish(),
  comment: z.string().nullish(),
  customer: clientZelty.nullish(),
}).passthrough()

export type ReservationZelty = z.infer<typeof reservationZelty>

export const reponseBookings = z.object({
  bookings: z.array(reservationZelty),
  errno: z.number().nullish(),
})

/** Forme normalisée, celle de `reservations_tables`. */
export type ReservationNormalisee = {
  caisse_externe_systeme: 'zelty'
  caisse_externe_id: string
  date_resa: string        // AAAA-MM-JJ
  heure_arrivee: string    // HH:MM
  nb_personnes: number
  client_nom: string
  client_telephone: string | null
  client_email: string | null
  notes: string | null
  statut: string
  canal: string
  table_zelty: number | null
}

/** Découpe « 2027-01-04T20:30:00+01:00 » en date et heure LOCALES.
 *
 *  ⚠️ On lit la chaîne, on ne la passe PAS par `new Date()`. Vercel tourne en
 *  UTC : une réservation à 00h30 heure française y deviendrait la veille à
 *  22h30, et le carnet du soir se retrouverait daté du jour d'avant. Le fuseau
 *  est déjà dans la chaîne, c'est l'heure du restaurant — il n'y a rien à
 *  convertir. */
export function decouperBookingFor(iso: string): { date: string; heure: string } | null {
  const m = /^(\d{4}-\d{2}-\d{2})[T ](\d{2}):(\d{2})/.exec(iso)
  if (!m) return null
  return { date: m[1], heure: `${m[2]}:${m[3]}` }
}

export type Avertissement = string

/** Caisse → nous. */
export function normaliser(
  brut: unknown,
): { ok: true; resa: ReservationNormalisee; avertissements: Avertissement[] } | { ok: false; motif: string } {
  const parsed = reservationZelty.safeParse(brut)
  if (!parsed.success) return { ok: false, motif: parsed.error.issues[0].message }
  const b = parsed.data

  const quand = decouperBookingFor(b.booking_for)
  if (!quand) return { ok: false, motif: `booking_for illisible : ${b.booking_for}` }

  const avertissements: Avertissement[] = []

  // Le nom est la seule chose dont l'équipe a vraiment besoin pour accueillir.
  // `nice_name` est « Prénom Nom » déjà composé par Zelty ; on s'en sert quand
  // il existe, sinon on recompose.
  const c = b.customer
  const nom = (c?.nice_name || [c?.fname, c?.name].filter(Boolean).join(' ')).trim()
  if (!nom) avertissements.push(`réservation ${b.id} sans nom de client`)

  if (b.status !== undefined && ![0, 80, 96, 192, 255].includes(b.status)) {
    // Un code inconnu n'est pas une panne, mais il ne doit pas passer
    // inaperçu : c'est ainsi qu'on apprend que la caisse a changé.
    avertissements.push(`statut Zelty inconnu (${b.status}) sur la réservation ${b.id}`)
  }

  return {
    ok: true,
    avertissements,
    resa: {
      caisse_externe_systeme: 'zelty',
      caisse_externe_id: String(b.id),
      date_resa: quand.date,
      heure_arrivee: quand.heure,
      nb_personnes: b.places,
      client_nom: nom || `Client ${b.id}`,
      client_telephone: c?.phone || null,
      client_email: c?.mail || null,
      notes: b.comment || null,
      statut: statutDepuisZelty(b.status),
      // `src` dit d'où vient la réservation, et Zelty le pose lui-même.
      canal: b.src === 'web' ? 'site_web' : b.src === 'bo' ? 'telephone' : 'autre',
      table_zelty: b.table ?? null,
    },
  }
}

/** Nous → caisse. Corps du POST, prêt à envoyer. */
export function versZelty(resa: {
  id: string
  date_resa: string
  heure_arrivee: string
  nb_personnes: number
  client_nom: string
  client_telephone: string | null
  client_email: string | null
  notes: string | null
  statut: string
}): { ok: true; corps: Record<string, unknown> } | { ok: false; motif: string } {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(resa.date_resa)) return { ok: false, motif: 'date invalide' }
  if (!/^\d{2}:\d{2}/.test(resa.heure_arrivee)) return { ok: false, motif: 'heure invalide' }
  if (!(resa.nb_personnes > 0)) return { ok: false, motif: 'nombre de couverts invalide' }
  if (!resa.client_nom.trim()) return { ok: false, motif: 'nom de client manquant' }

  return {
    ok: true,
    corps: {
      // ⚠️ Le fuseau est écrit EN DUR à l'heure de Paris. L'API l'exige dans la
      // chaîne, et le déduire de l'horloge du serveur — UTC sur Vercel —
      // décalerait chaque réservation d'une ou deux heures selon la saison.
      booking_for: `${resa.date_resa}T${resa.heure_arrivee.slice(0, 5)}:00${decalageParis(resa.date_resa)}`,
      places: resa.nb_personnes,
      // `customer` DOIT être un objet : Zelty refuse un identifiant et crée la
      // fiche client de lui-même.
      customer: {
        name: resa.client_nom,
        ...(resa.client_telephone ? { phone: resa.client_telephone } : {}),
        ...(resa.client_email ? { mail: resa.client_email } : {}),
      },
      // Notre identifiant chez eux : la correspondance devient exacte, et le
      // renvoi après un timeout ne crée pas de doublon.
      remote_id: resa.id,
      ...(resa.notes ? { comment: resa.notes } : {}),
      // Toujours explicite : sans lui, la « confirmation automatique » du
      // restaurant confirmerait la table ET enverrait un mail au client, alors
      // que personne n'a encore regardé le plan de salle.
      status: statutVersZelty(resa.statut),
    },
  }
}

/** « +02:00 » l'été, « +01:00 » l'hiver — l'heure légale française à cette
 *  date, calculée sans dépendre du fuseau du serveur. */
export function decalageParis(date: string): string {
  const [a, m, j] = date.split('-').map(Number)
  const midi = new Date(Date.UTC(a, m - 1, j, 12))
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Europe/Paris', hour: '2-digit', hour12: false,
  })
  const heureParis = Number(fmt.format(midi))
  const decalage = heureParis - 12
  return `+0${decalage}:00`
}
