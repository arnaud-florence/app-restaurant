// Module 10 — types partagés équipes (chat / affichage / CR / matériel)

export type Canal = 'cuisine' | 'bar' | 'salle' | 'admin' | 'tous'

export const CANAUX: Canal[] = ['tous', 'cuisine', 'bar', 'salle', 'admin']

export const CANAL_INFO: Record<Canal, { label: string; emoji: string; color: string }> = {
  tous:    { label: 'Général',  emoji: '📢', color: 'bg-zinc-100 text-zinc-800 border-zinc-300' },
  cuisine: { label: 'Cuisine',  emoji: '👨‍🍳', color: 'bg-amber-100 text-amber-900 border-amber-300' },
  bar:     { label: 'Bar',      emoji: '🍷', color: 'bg-violet-100 text-violet-900 border-violet-300' },
  salle:   { label: 'Salle',    emoji: '🪑', color: 'bg-blue-100 text-blue-900 border-blue-300' },
  admin:   { label: 'Admin',    emoji: '🔧', color: 'bg-emerald-100 text-emerald-900 border-emerald-300' },
}

export type Employe = {
  id: string
  prenom: string
  nom: string
  poste: string
}

export type Message = {
  id: string
  canal: Canal
  expediteur_id: string | null
  expediteur_nom: string | null
  contenu: string
  lu_par: string[]
  /** Réactions emoji : { "<employe_id>": "<emoji>" } (une par personne). */
  reactions?: Record<string, string> | null
  created_at: string
}

export type Priorite = 'info' | 'warn' | 'urgent'

export const PRIORITE_INFO: Record<Priorite, { label: string; emoji: string; cls: string }> = {
  info:   { label: 'Info',    emoji: 'ℹ️', cls: 'bg-blue-50 text-blue-900 border-blue-300' },
  warn:   { label: 'À noter', emoji: '⚠️', cls: 'bg-amber-50 text-amber-900 border-amber-300' },
  urgent: { label: 'Urgent',  emoji: '🚨', cls: 'bg-red-50 text-red-900 border-red-300' },
}

export type InfoAffichage = {
  id: string
  titre: string
  contenu: string
  priorite: Priorite
  valable_du: string
  valable_jusqu: string | null
  ordre: number
  cree_par_nom: string | null
  created_at: string
}

export type CompteRendu = {
  id: string
  titre: string
  date_reunion: string
  contenu: string
  participants: string[]   // employe_ids
  participants_noms: string[]
  redacteur_nom: string | null
  created_at: string
}

export type TypeMateriel = 'uniforme' | 'ustensile' | 'cle' | 'badge' | 'equipement' | 'autre'
export type EtatMateriel = 'neuf' | 'bon' | 'use' | 'abime' | 'perdu'

export const TYPE_MATERIEL_LABEL: Record<TypeMateriel, { label: string; emoji: string }> = {
  uniforme:   { label: 'Uniforme',   emoji: '👕' },
  ustensile:  { label: 'Ustensile',  emoji: '🔪' },
  cle:        { label: 'Clé',        emoji: '🔑' },
  badge:      { label: 'Badge',      emoji: '🪪' },
  equipement: { label: 'Équipement', emoji: '🛠️' },
  autre:      { label: 'Autre',      emoji: '📦' },
}

export const ETAT_MATERIEL_LABEL: Record<EtatMateriel, { label: string; cls: string }> = {
  neuf:  { label: 'Neuf',     cls: 'bg-emerald-100 text-emerald-900 border-emerald-300' },
  bon:   { label: 'Bon état', cls: 'bg-zinc-100   text-zinc-800    border-zinc-300' },
  use:   { label: 'Usé',      cls: 'bg-amber-100  text-amber-900   border-amber-300' },
  abime: { label: 'Abîmé',    cls: 'bg-red-100    text-red-900     border-red-300' },
  perdu: { label: 'Perdu',    cls: 'bg-zinc-200   text-zinc-700    border-zinc-400' },
}

export type Materiel = {
  id: string
  nom: string
  type: TypeMateriel
  numero_serie: string | null
  etat: EtatMateriel
  attribue_a: string | null
  attribue_a_nom: string | null
  date_attribution: string | null
  notes: string | null
  actif: boolean
  created_at: string
}
