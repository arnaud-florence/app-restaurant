// Module 11 — types partagés hygiène & sécurité alimentaire

// ─── Plans HACCP ────────────────────────────────────────────────────
export type TypeDanger = 'biologique' | 'chimique' | 'physique' | 'allergene'

export const TYPE_DANGER_LABEL: Record<TypeDanger, { label: string; emoji: string; cls: string }> = {
  biologique: { label: 'Biologique', emoji: '🦠', cls: 'bg-red-100 text-red-900 border-red-300' },
  chimique:   { label: 'Chimique',   emoji: '🧪', cls: 'bg-amber-100 text-amber-900 border-amber-300' },
  physique:   { label: 'Physique',   emoji: '⚙️', cls: 'bg-zinc-100 text-zinc-800 border-zinc-300' },
  allergene:  { label: 'Allergène',  emoji: '⚠️', cls: 'bg-violet-100 text-violet-900 border-violet-300' },
}

export type PlanHaccp = {
  id: string
  titre: string
  type_danger: TypeDanger
  description_danger: string
  ccp_numero: number | null
  mesure_preventive: string
  surveillance_methode: string | null
  surveillance_frequence: string | null
  limite_critique: string | null
  action_corrective: string
  responsable_poste: string | null
  actif: boolean
  created_at: string
}

// ─── Lots produits ──────────────────────────────────────────────────
export type StatutLot = 'en_stock' | 'consomme' | 'jete' | 'expire' | 'rappele'

export const STATUT_LOT_LABEL: Record<StatutLot, { label: string; cls: string }> = {
  en_stock: { label: 'En stock', cls: 'bg-emerald-100 text-emerald-900 border-emerald-300' },
  consomme: { label: 'Consommé', cls: 'bg-zinc-100 text-zinc-700 border-zinc-300' },
  jete:     { label: 'Jeté',     cls: 'bg-amber-100 text-amber-900 border-amber-300' },
  expire:   { label: 'Expiré',   cls: 'bg-red-100 text-red-900 border-red-300' },
  rappele:  { label: 'Rappelé',  cls: 'bg-violet-100 text-violet-900 border-violet-300' },
}

export type Lot = {
  id: string
  ingredient_id: string | null
  ingredient_nom: string | null
  /** Produit tracé en saisie libre (sans passer par la liste des ingrédients) */
  produit_nom: string | null
  lot_numero: string
  dlc: string | null
  fournisseur_id: string | null
  fournisseur_nom: string | null
  quantite: number
  unite: string | null
  bon_commande_id: string | null
  date_reception: string
  statut: StatutLot
  notes: string | null
  created_at: string
}

export function alerteDLC(dlc: string | null): 'critique' | 'proche' | 'ok' | 'na' {
  if (!dlc) return 'na'
  const j = Math.floor((new Date(dlc).getTime() - Date.now()) / 86400000)
  if (j < 0) return 'critique'   // expiré
  if (j <= 3) return 'proche'    // ≤ 3j
  return 'ok'
}

// ─── Non-conformités ────────────────────────────────────────────────
export type TypeNC = 'temperature' | 'hygiene' | 'produit' | 'equipement' | 'procedure' | 'autre'
export type Gravite = 'mineure' | 'majeure' | 'critique'
export type StatutNC = 'ouverte' | 'en_cours' | 'resolue'

export const TYPE_NC_LABEL: Record<TypeNC, { label: string; emoji: string }> = {
  temperature: { label: 'Température', emoji: '🌡️' },
  hygiene:     { label: 'Hygiène',     emoji: '🧼' },
  produit:     { label: 'Produit',     emoji: '🥩' },
  equipement:  { label: 'Équipement',  emoji: '🛠️' },
  procedure:   { label: 'Procédure',   emoji: '📋' },
  autre:       { label: 'Autre',       emoji: '•' },
}

export const GRAVITE_LABEL: Record<Gravite, { label: string; cls: string }> = {
  mineure:  { label: 'Mineure',  cls: 'bg-zinc-100 text-zinc-800 border-zinc-300' },
  majeure:  { label: 'Majeure',  cls: 'bg-amber-100 text-amber-900 border-amber-300' },
  critique: { label: 'Critique', cls: 'bg-red-100 text-red-900 border-red-300' },
}

export const STATUT_NC_LABEL: Record<StatutNC, { label: string; cls: string }> = {
  ouverte:  { label: 'Ouverte',  cls: 'bg-red-100 text-red-900 border-red-300' },
  en_cours: { label: 'En cours', cls: 'bg-amber-100 text-amber-900 border-amber-300' },
  resolue:  { label: 'Résolue',  cls: 'bg-emerald-100 text-emerald-900 border-emerald-300' },
}

export type NonConformite = {
  id: string
  date_constat: string
  type: TypeNC
  gravite: Gravite
  description: string
  action_corrective: string | null
  responsable_id: string | null
  responsable_nom: string | null
  statut: StatutNC
  resolved_at: string | null
  resolved_by: string | null
  resolved_by_nom: string | null
  releve_temperature_id: string | null
  created_at: string
}

// ─── Antiparasitaire ────────────────────────────────────────────────
export type TypeTraitement = 'preventif' | 'curatif' | 'controle' | 'urgence'

export const TYPE_TRAITEMENT_LABEL: Record<TypeTraitement, { label: string; cls: string }> = {
  preventif: { label: 'Préventif', cls: 'bg-emerald-100 text-emerald-900 border-emerald-300' },
  curatif:   { label: 'Curatif',   cls: 'bg-amber-100 text-amber-900 border-amber-300' },
  controle:  { label: 'Contrôle',  cls: 'bg-blue-100 text-blue-900 border-blue-300' },
  urgence:   { label: 'Urgence',   cls: 'bg-red-100 text-red-900 border-red-300' },
}

export type Intervention3D = {
  id: string
  date_intervention: string
  prestataire: string
  type_traitement: TypeTraitement
  zones: string[]
  produits_utilises: string | null
  observations: string | null
  prochaine_intervention: string | null
  document_url: string | null
  cout: number | null
  created_at: string
}

// ─── Plan nettoyage ─────────────────────────────────────────────────
export type Frequence = 'apres_service' | 'quotidien' | 'hebdo' | 'mensuel' | 'trimestriel' | 'annuel'

export const FREQUENCE_LABEL: Record<Frequence, { label: string; emoji: string }> = {
  apres_service: { label: 'Après chaque service', emoji: '🔄' },
  quotidien:     { label: 'Quotidien',            emoji: '📅' },
  hebdo:         { label: 'Hebdomadaire',         emoji: '🗓️' },
  mensuel:       { label: 'Mensuel',              emoji: '📆' },
  trimestriel:   { label: 'Trimestriel',          emoji: '📊' },
  annuel:        { label: 'Annuel',               emoji: '🎯' },
}

export type PlanNettoyage = {
  id: string
  zone: string
  equipement: string | null
  frequence: Frequence
  produit_utilise: string | null
  methode: string | null
  responsable_poste: string | null
  ordre: number
  actif: boolean
  derniere_execution: string | null
  created_at: string
}

// ─── Températures (existing table) ──────────────────────────────────
export type TypeEquipement = 'frigo' | 'congelateur' | 'chambre_froide' | 'bain_marie'
export type Moment = 'matin' | 'midi' | 'soir' | 'autre'

export const TYPE_EQUIPEMENT_LABEL: Record<TypeEquipement, { label: string; emoji: string; tempMin: number; tempMax: number }> = {
  frigo:          { label: 'Frigo',          emoji: '🧊', tempMin: 0,   tempMax: 4   },
  congelateur:    { label: 'Congélateur',    emoji: '❄️', tempMin: -22, tempMax: -18 },
  chambre_froide: { label: 'Chambre froide', emoji: '🥶', tempMin: 0,   tempMax: 4   },
  bain_marie:     { label: 'Bain-marie',     emoji: '🍲', tempMin: 63,  tempMax: 90  },
}

export const MOMENT_LABEL: Record<Moment, { label: string; emoji: string }> = {
  matin: { label: 'Matin',  emoji: '🌅' },
  midi:  { label: 'Midi',   emoji: '☀️' },
  soir:  { label: 'Soir',   emoji: '🌙' },
  autre: { label: 'Autre',  emoji: '•' },
}

export type ReleveTemperature = {
  id: string
  equipement: string
  type_equipement: TypeEquipement | null
  temperature: number
  temperature_min_ok: number | null
  temperature_max_ok: number | null
  conforme: boolean | null
  moment: Moment | null
  employe_id: string | null
  employe_nom: string | null
  notes: string | null
  created_at: string
}

// ─── Procédures hygiène + checklists (existing tables) ─────────────
export type MomentProcedure = 'ouverture' | 'service' | 'fermeture' | 'hebdomadaire' | 'mensuel'

export const MOMENT_PROC_LABEL: Record<MomentProcedure, { label: string; emoji: string; cls: string }> = {
  ouverture:    { label: 'Ouverture',    emoji: '🌅', cls: 'bg-amber-100 text-amber-900 border-amber-300' },
  service:      { label: 'Service',      emoji: '🍽️', cls: 'bg-blue-100 text-blue-900 border-blue-300' },
  fermeture:    { label: 'Fermeture',    emoji: '🌙', cls: 'bg-violet-100 text-violet-900 border-violet-300' },
  hebdomadaire: { label: 'Hebdomadaire', emoji: '🗓️', cls: 'bg-emerald-100 text-emerald-900 border-emerald-300' },
  mensuel:      { label: 'Mensuel',      emoji: '📆', cls: 'bg-zinc-100 text-zinc-800 border-zinc-300' },
}

export type ProcedureHygiene = {
  id: string
  titre: string
  moment: MomentProcedure
  poste_concerne: string | null
  description: string | null
  ordre: number
  actif: boolean
}

export type ChecklistHygiene = {
  id: string
  procedure_id: string
  procedure_titre: string
  procedure_moment: MomentProcedure | null
  employe_id: string | null
  employe_nom: string | null
  date_realisation: string
  heure_realisation: string | null
  valide: boolean
  commentaire: string | null
  signature_text: string | null
}

export type Employe = {
  id: string
  prenom: string
  nom: string
  poste: string
}

export type IngredientShort = { id: string; nom: string; unite: string }
export type FournisseurShort = { id: string; nom: string }
