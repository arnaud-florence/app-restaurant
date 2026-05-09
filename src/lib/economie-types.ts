// Types et constantes runtime (utilisable depuis Client Components).
// Server-only helpers : voir lib/economie-helpers.ts.

export type ChargeCategorie =
  | 'loyer' | 'salaires' | 'charges_sociales'
  | 'energie' | 'eau' | 'internet' | 'telephone'
  | 'assurance' | 'comptable' | 'abonnement_software'
  | 'maintenance' | 'marketing' | 'leasing' | 'banque' | 'autre'

export const CATEGORIE_INFO: Record<ChargeCategorie, { label: string; emoji: string }> = {
  loyer:                { label: 'Loyer',                emoji: '🏠' },
  salaires:             { label: 'Salaires bruts',       emoji: '💼' },
  charges_sociales:     { label: 'Charges sociales',     emoji: '📋' },
  energie:              { label: 'Énergie',              emoji: '⚡' },
  eau:                  { label: 'Eau',                  emoji: '💧' },
  internet:             { label: 'Internet',             emoji: '🌐' },
  telephone:            { label: 'Téléphone',            emoji: '📞' },
  assurance:            { label: 'Assurance',            emoji: '🛡️' },
  comptable:            { label: 'Expert-comptable',     emoji: '📊' },
  abonnement_software:  { label: 'Abonnements SaaS',     emoji: '💻' },
  maintenance:          { label: 'Maintenance',          emoji: '🔧' },
  marketing:            { label: 'Marketing',            emoji: '📢' },
  leasing:              { label: 'Leasing',              emoji: '🚗' },
  banque:               { label: 'Frais bancaires',      emoji: '🏦' },
  autre:                { label: 'Autre',                emoji: '•' },
}

export type ChargeRow = {
  id: string
  categorie: ChargeCategorie
  libelle: string
  montant_mensuel_eur: number
  fournisseur: string | null
  notes: string | null
  actif: boolean
  date_debut: string | null
  date_fin: string | null
}

// ─── Charges variables ─────────────────────────────────────
export type ChargeVarType =
  | 'food_cost' | 'commissions_cb' | 'jetable_emballage'
  | 'taxes_locales' | 'mensualisations_taxes' | 'transport' | 'autre'

export type ChargeVarMode = 'auto' | 'manuel_pct' | 'manuel_fixe'

export const CHARGE_VAR_INFO: Record<ChargeVarType, { label: string; emoji: string }> = {
  food_cost:              { label: 'Coût matières (food cost)', emoji: '🍅' },
  commissions_cb:         { label: 'Commissions bancaires',     emoji: '💳' },
  jetable_emballage:      { label: 'Jetable / emballage',       emoji: '📦' },
  taxes_locales:          { label: 'Taxes locales',             emoji: '🏛️' },
  mensualisations_taxes:  { label: 'Mensualisations taxes',     emoji: '📅' },
  transport:              { label: 'Transport / livraisons',    emoji: '🚐' },
  autre:                  { label: 'Autre',                     emoji: '•' },
}

export type ChargeVarRow = {
  id: string
  type: ChargeVarType
  libelle: string
  mode: ChargeVarMode
  valeur_pct: number | null
  valeur_fixe_eur: number | null
  notes: string | null
  actif: boolean
}

// ─── Contrat employé (extension) ─────────────────────────
export type ContratEmploye = {
  id: string
  prenom: string
  nom: string
  poste: string
  type_contrat: string
  salaire_horaire: number
  heures_contrat: number
  coef_charges_patronales: number
  avantages_mensuel_eur: number
  heures_supp_prevues_mois: number
  date_debut_contrat: string | null
  date_fin_contrat: string | null
  actif: boolean
}
