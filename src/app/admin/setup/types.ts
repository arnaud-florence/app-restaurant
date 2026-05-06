// Types partagés entre serveur (actions) et client (steps + wizard).
// Pas de 'use server' ici — un fichier server-actions ne peut exporter
// que des fonctions async, donc les types vivent à part.

export const JOURS = ['lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi', 'dimanche'] as const
export type Jour = typeof JOURS[number]

export const ROLES = ['gerant', 'cuisinier', 'pizzaiolo', 'serveur', 'barman'] as const
export type Role = typeof ROLES[number]

export const ROLE_LABELS: Record<Role, { label: string; icon: string }> = {
  gerant:    { label: 'Gérant',     icon: '👔' },
  cuisinier: { label: 'Cuisinier',  icon: '👨‍🍳' },
  pizzaiolo: { label: 'Pizzaiolo',  icon: '🍕' },
  serveur:   { label: 'Serveur',    icon: '🪑' },
  barman:    { label: 'Barman',     icon: '🍷' },
}

export const ZONES_DEFAUT = ['Salle', 'Terrasse', 'Bar', 'Privatif'] as const

export type Etablissement = {
  nom: string
  adresse: string
  telephone: string
  email: string
  site_web: string
  siret: string
  tva_intra: string
  logo_url: string
}

export type Horaire = {
  ouvert: boolean
  ouverture: string  // 'HH:MM'
  fermeture: string  // 'HH:MM'
}

export type Horaires = Record<Jour, Horaire>

export type Exception = {
  id: string          // id local pour la liste (uuid v4 généré côté client)
  date_debut: string  // YYYY-MM-DD
  date_fin: string
  motif: string
}

export type TableRow = {
  id: string          // UUID DB ou 'new-…' pour les non-sauvegardées
  numero: string
  capacite: number
  zone: string
}

export type TVA = {
  sur_place: number
  emporter: number
  alcool: number
}

export type FraisZone = {
  id: string
  rayon_max_km: number
  frais: number
}

export type Livraison = {
  active: boolean
  rayon_km: number
  minimum: number
  delai_min: number
  zones: FraisZone[]
}

export type Employe = {
  id: string          // UUID DB ou 'new-…'
  prenom: string
  nom: string
  email: string
  poste: Role
}

export type SetupData = {
  etablissement: Etablissement
  horaires: Horaires
  exceptions: Exception[]
  zones: string[]
  tables: TableRow[]
  tva: TVA
  livraison: Livraison
  employes: Employe[]
  setup_completed: boolean
}

// Valeurs par défaut pour un setup vierge.
export function defaultSetup(): SetupData {
  const horaireParDefaut: Horaire = { ouvert: true, ouverture: '12:00', fermeture: '14:30' }
  const horaires = JOURS.reduce<Horaires>((acc, j) => {
    acc[j] = { ...horaireParDefaut, ouvert: j !== 'dimanche' }
    return acc
  }, {} as Horaires)

  return {
    etablissement: { nom: '', adresse: '', telephone: '', email: '', site_web: '', siret: '', tva_intra: '', logo_url: '' },
    horaires,
    exceptions: [],
    zones: [...ZONES_DEFAUT],
    tables: [],
    tva: { sur_place: 10, emporter: 5.5, alcool: 20 },
    livraison: { active: false, rayon_km: 5, minimum: 15, delai_min: 30, zones: [] },
    employes: [],
    setup_completed: false,
  }
}

export const isNewId = (id: string) => id.startsWith('new-')
export const newLocalId = () =>
  'new-' + (typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2))
