// Les services du restaurant — QUI sert QUOI, et QUAND.
//
// Règle du gérant (22/09/2026) :
//   · le MIDI, c'est la brasserie uniquement, 7 jours sur 7 ;
//   · le SOIR, c'est la pizzeria uniquement, 7 jours sur 7 ;
//   · le vendredi et le samedi SOIR, brasserie ET pizzeria.
//
// Une seule source, client-safe : le site public la reçoit par
// /api/public/activation (`services`), l'outil l'importe directement. Deux
// textes d'horaires écrits séparément finissent toujours par se contredire —
// c'est ce qui était arrivé à la page Contact du site (« pizzas en continu »,
// « midi — brasserie, pizzas »), écrite en dur avant que la règle existe.
//
// ⚠️ Les heures sont des valeurs de départ, à ajuster ici : c'est le seul
// endroit où elles vivent.

export type Service = 'midi' | 'soir'

export const HORAIRES_SERVICE: Record<Service, { debut: string; fin: string }> = {
  midi: { debut: '12:00', fin: '14:30' },
  soir: { debut: '19:00', fin: '22:00' },
}

// ─── Jusqu'à quelle heure la maison est ouverte ──────────────────
//
// Trois régimes, et les confondre est exactement ce que faisait le site
// jusqu'au 23/09/2026 : il annonçait « 6h30 – 19h30 » partout, y compris
// dans la description Google, alors que l'affiche du gérant disait « de 6h30
// jusqu'à la fin du service de restauration ». Quelqu'un qui lisait l'affiche
// puis vérifiait sur le site croyait la brasserie fermée à 19h30.
export const FERMETURES = {
  /** Fournil et relais colis : le pain et les colis s'arrêtent avant le reste. */
  fournil: '20:00',
  /** Comptoir et restauration : on ferme après le service du soir. */
  restauration: HORAIRES_SERVICE.soir.fin,
  /** Soirée organisée : environ une par mois, annoncée à l'avance. */
  soireeSpeciale: '01:00',
} as const

/** Ce qu'on affiche au public, en toutes lettres. */
export const PHRASE_FERMETURE = {
  fournil: 'Fournil et relais colis : 6h30 – 20h, 7 jours sur 7',
  restauration: 'Comptoir et restauration : jusqu’à la fin du service du soir',
  soireeSpeciale: 'Soirées organisées, une fois par mois : jusqu’à 1 h du matin',
} as const

/** Jours au format Date.getDay() : 0 = dimanche … 6 = samedi. */
const TOUS_LES_JOURS = [0, 1, 2, 3, 4, 5, 6]
const WEEK_END_SOIR = [5, 6] // vendredi, samedi

/** Pour chaque carte (tag_destination), les créneaux où elle est servie. */
export const SERVICES_PAR_TAG: Record<string, Array<{ service: Service; jours: number[] }>> = {
  CUISINE: [
    { service: 'midi', jours: TOUS_LES_JOURS },
    { service: 'soir', jours: WEEK_END_SOIR },
  ],
  PIZZA: [
    { service: 'soir', jours: TOUS_LES_JOURS },
  ],
}

/** Phrase affichée sous le titre de chaque carte. */
export const PHRASE_SERVICE: Record<string, string> = {
  CUISINE: 'Le midi, 7 jours sur 7 — et le vendredi et le samedi soir',
  PIZZA: 'Le soir, 7 jours sur 7',
}

/** Cartes servies à un service donné, un jour donné. */
export function cartesDuService(jour: number, service: Service): string[] {
  return Object.entries(SERVICES_PAR_TAG)
    .filter(([, creneaux]) => creneaux.some(c => c.service === service && c.jours.includes(jour)))
    .map(([tag]) => tag)
}

/** Forme publique, pour le site. */
export function servicesPublics() {
  return {
    horaires: HORAIRES_SERVICE,
    par_tag: SERVICES_PAR_TAG,
    phrases: PHRASE_SERVICE,
    fermetures: FERMETURES,
    phrases_fermeture: PHRASE_FERMETURE,
  }
}
