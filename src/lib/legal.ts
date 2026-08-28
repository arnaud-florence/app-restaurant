// Module 17 — Helpers obligations légales

import { format, parseISO, differenceInDays } from 'date-fns'
import { fr } from 'date-fns/locale'

export type CategorieObligation =
  | 'licence_iv' | 'permis_exploitation' | 'assurance' | 'bail_commercial'
  | 'autorisation_terrasse' | 'douane' | 'urssaf' | 'visite_medicale_employeur'
  | 'securite_erp' | 'hygiene' | 'personnel' | 'droits_musique' | 'autre'

export const CATEGORIE_OBLIGATION_INFO: Record<CategorieObligation, { label: string; emoji: string; cls: string }> = {
  licence_iv:                { label: 'Licence IV',                 emoji: '🍷', cls: 'bg-violet-100 text-violet-900 border-violet-300' },
  permis_exploitation:       { label: 'Permis d\'exploitation',     emoji: '📜', cls: 'bg-blue-100   text-blue-900   border-blue-300' },
  assurance:                 { label: 'Assurance',                  emoji: '🛡️', cls: 'bg-emerald-100 text-emerald-900 border-emerald-300' },
  bail_commercial:           { label: 'Bail commercial',            emoji: '🏠', cls: 'bg-amber-100  text-amber-900  border-amber-300' },
  autorisation_terrasse:     { label: 'Autorisation terrasse',      emoji: '☀️', cls: 'bg-yellow-100 text-yellow-900 border-yellow-300' },
  douane:                    { label: 'Douane (Contributions)',     emoji: '🇫🇷', cls: 'bg-red-100    text-red-900    border-red-300' },
  urssaf:                    { label: 'URSSAF',                     emoji: '📋', cls: 'bg-stone-100  text-stone-800  border-stone-300' },
  visite_medicale_employeur: { label: 'Visite médicale employeur',  emoji: '🩺', cls: 'bg-cyan-100   text-cyan-900   border-cyan-300' },
  securite_erp:              { label: 'Sécurité ERP',               emoji: '🧯', cls: 'bg-orange-100 text-orange-900 border-orange-300' },
  hygiene:                   { label: 'Hygiène / DDPP',             emoji: '🧼', cls: 'bg-teal-100   text-teal-900   border-teal-300' },
  personnel:                 { label: 'Personnel',                  emoji: '👥', cls: 'bg-indigo-100 text-indigo-900 border-indigo-300' },
  droits_musique:            { label: 'SACEM / SPRE',               emoji: '🎵', cls: 'bg-pink-100   text-pink-900   border-pink-300' },
  autre:                     { label: 'Autre',                      emoji: '•',  cls: 'bg-zinc-100   text-zinc-700   border-zinc-300' },
}

export type StatutObligation = 'a_faire' | 'fait' | 'en_cours'

export const STATUT_OBLIG_LABEL: Record<StatutObligation, { label: string; cls: string }> = {
  a_faire:  { label: 'À faire',   cls: 'bg-amber-100  text-amber-900  border-amber-300' },
  en_cours: { label: 'En cours',  cls: 'bg-blue-100   text-blue-900   border-blue-300' },
  fait:     { label: 'Fait',      cls: 'bg-emerald-100 text-emerald-900 border-emerald-300' },
}

export type Obligation = {
  id: string
  titre: string
  categorie: string                // mappable à CategorieObligation, sinon 'autre'
  description: string | null
  date_echeance: string | null
  frequence: string | null         // 'annuel', 'quinquennal', etc.
  statut: StatutObligation
  prestataire: string | null
  document_url: string | null
  notes: string | null
  /** Empêche l'exploitation tant qu'elle n'est pas satisfaite (0147). Une
   *  bloquante SANS date alerte quand même : l'absence de date y est le
   *  symptôme — personne ne l'a engagée — pas une raison de se taire. */
  bloquant: boolean
}

// ─── Accidents du travail ───────────────────────────────────────────
export type Gravite = 'legere' | 'grave' | 'mortel'

export const GRAVITE_INFO: Record<Gravite, { label: string; cls: string }> = {
  legere: { label: 'Légère',       cls: 'bg-amber-100 text-amber-900 border-amber-300' },
  grave:  { label: 'Grave',        cls: 'bg-red-100   text-red-900   border-red-300' },
  mortel: { label: 'Mortel',       cls: 'bg-red-700   text-white     border-red-900' },
}

export type Accident = {
  id: string
  employe_id: string | null
  employe_nom: string | null
  date_accident: string
  heure_accident: string | null
  lieu: string | null
  description: string
  gravite: Gravite
  jours_arret: number
  declaration_cpam: boolean
  declaration_cpam_date: string | null
  declaration_cpam_url: string | null
  temoin: string | null
  suites: string | null
  created_at: string
}

// ─── Affichages obligatoires ────────────────────────────────────────
export type Affichage = {
  id: string
  titre: string
  description: string | null
  reference_legale: string | null
  obligatoire: boolean
  present: boolean
  date_verification: string | null
  photo_url: string | null
  ordre: number
  notes: string | null
}

// ─── Statut échéance (alerte 1 mois avant) ──────────────────────────
export type StatutEcheance = 'expire' | 'critique' | 'proche' | 'ok' | 'na'

export function statutEcheance(iso: string | null): StatutEcheance {
  if (!iso) return 'na'
  const j = differenceInDays(parseISO(iso), new Date())
  if (j < 0) return 'expire'
  if (j < 7) return 'critique'
  if (j <= 30) return 'proche'
  return 'ok'
}

export const STATUT_ECHEANCE_STYLE: Record<StatutEcheance, { label: string; cls: string }> = {
  expire:   { label: 'EXPIRÉ',     cls: 'bg-red-600 text-white border-red-700' },
  critique: { label: '< 7 jours',  cls: 'bg-red-100 text-red-900 border-red-300' },
  proche:   { label: '< 1 mois',   cls: 'bg-amber-100 text-amber-900 border-amber-300' },
  ok:       { label: 'OK',         cls: 'bg-emerald-100 text-emerald-900 border-emerald-300' },
  na:       { label: '—',          cls: 'bg-zinc-100 text-zinc-600 border-zinc-300' },
}

export function joursRestants(iso: string | null): number | null {
  if (!iso) return null
  return differenceInDays(parseISO(iso), new Date())
}

// ─── Format ─────────────────────────────────────────────────────────
export const fmtDate = (iso: string | null) => iso ? format(parseISO(iso), 'd MMM yyyy', { locale: fr }) : '—'
