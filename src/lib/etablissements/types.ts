// Couche multi-établissement / multi-activité — TYPES.
//
// ⚠️ PRÉPARÉ — NON CÂBLÉ. Ces types décrivent l'architecture flexible. Ils ne
// sont importés par aucune page tant que la config n'est pas activée (après
// migrations 0089/0090/0091). Activer = brancher ces helpers dans le dashboard.

export type TypeEtablissement = 'restaurant' | 'fournil' | 'autre'

export type CategorieActivite =
  | 'restauration'
  | 'boulangerie'
  | 'tabac_presse'
  | 'service_tiers'
  | 'autre'

// Rempli après la réponse de l'expert-comptable :
//   'rattache' = activité rattachée à l'entité principale (CA consolidé)
//   'autonome' = entité juridiquement séparée (P&L distinct)
export type ModeFiscal = 'rattache' | 'autonome' | null

// Mode d'affichage du dashboard.
export type ModeDashboard = 'consolide' | 'par_activite'

export type Etablissement = {
  id: string
  nom: string
  slug: string
  type: TypeEtablissement
  categorie: CategorieActivite | null
  /** false = activité EXCLUE du CA principal (encaissement pour compte de tiers). */
  inclus_ca_principal: boolean
  couleur: string
  ordre: number
  mode_fiscal: ModeFiscal
  actif: boolean
  is_principal: boolean
}

/** Ventes agrégées par établissement (alimenté par la caisse / le connecteur). */
export type VenteParEtablissement = {
  etablissement_id: string
  ca_ttc: number
  nb_tickets: number
}

/** Résultat d'agrégation flexible. */
export type AgregatCA = {
  /** Somme des activités incluses dans le CA principal. */
  caPrincipal: number
  /** Somme des activités exclues (commissions / pour compte de tiers). */
  caHorsPrincipal: number
  /** Détail par établissement, avec le flag d'inclusion. */
  parEtablissement: Array<{
    etablissement: Etablissement
    ca_ttc: number
    nb_tickets: number
    inclus: boolean
  }>
}
