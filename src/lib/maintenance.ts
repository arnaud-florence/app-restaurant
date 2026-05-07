// Module 16 — Helpers maintenance & équipements.

import { format, parseISO, differenceInDays } from 'date-fns'
import { fr } from 'date-fns/locale'

// ─── Types ──────────────────────────────────────────────────────────
export type CategorieEquip = 'cuisine' | 'froid' | 'chaud' | 'laverie' | 'climatisation' | 'securite' | 'divers'
export type TypeControle = 'electricite' | 'gaz' | 'extincteur' | 'hotte' | 'desenfumage' | 'climatisation' | 'autre'
export type TypeIntervention = 'preventive' | 'curative' | 'controle_obligatoire'

export const CATEGORIE_INFO: Record<CategorieEquip, { label: string; emoji: string; cls: string }> = {
  cuisine:       { label: 'Cuisine',         emoji: '🍳', cls: 'bg-amber-100  text-amber-900  border-amber-300' },
  froid:         { label: 'Froid',           emoji: '🧊', cls: 'bg-cyan-100   text-cyan-900   border-cyan-300' },
  chaud:         { label: 'Chaud',           emoji: '🔥', cls: 'bg-red-100    text-red-900    border-red-300' },
  laverie:       { label: 'Laverie',         emoji: '🧽', cls: 'bg-blue-100   text-blue-900   border-blue-300' },
  climatisation: { label: 'Climatisation',   emoji: '❄️', cls: 'bg-sky-100    text-sky-900    border-sky-300' },
  securite:      { label: 'Sécurité',        emoji: '🛡️', cls: 'bg-emerald-100 text-emerald-900 border-emerald-300' },
  divers:        { label: 'Divers',          emoji: '🔧', cls: 'bg-zinc-100   text-zinc-700   border-zinc-300' },
}

export const TYPE_CONTROLE_INFO: Record<TypeControle, { label: string; emoji: string; periodicite_mois: number; obligatoire: boolean }> = {
  electricite:   { label: 'Vérification électrique (Q-18)', emoji: '⚡',  periodicite_mois: 12, obligatoire: true },
  gaz:           { label: 'Contrôle installation gaz',      emoji: '🔥',  periodicite_mois: 12, obligatoire: true },
  extincteur:    { label: 'Extincteurs',                    emoji: '🧯',  periodicite_mois: 12, obligatoire: true },
  hotte:         { label: 'Nettoyage hotte + dégraissage',  emoji: '💨',  periodicite_mois: 6,  obligatoire: true },
  desenfumage:   { label: 'Désenfumage',                    emoji: '🚪',  periodicite_mois: 12, obligatoire: true },
  climatisation: { label: 'Climatisation (étanchéité)',     emoji: '❄️',  periodicite_mois: 12, obligatoire: false },
  autre:         { label: 'Autre',                          emoji: '•',   periodicite_mois: 12, obligatoire: false },
}

export const TYPE_INTERVENTION_INFO: Record<TypeIntervention, { label: string; emoji: string; cls: string }> = {
  preventive:           { label: 'Préventive',           emoji: '🔧', cls: 'bg-emerald-100 text-emerald-900 border-emerald-300' },
  curative:             { label: 'Curative (panne)',     emoji: '🚨', cls: 'bg-red-100    text-red-900    border-red-300' },
  controle_obligatoire: { label: 'Contrôle obligatoire', emoji: '🛡️', cls: 'bg-blue-100   text-blue-900   border-blue-300' },
}

export type Equipement = {
  id: string
  nom: string
  marque: string | null
  modele: string | null
  numero_serie: string | null
  date_achat: string | null
  valeur_achat: number | null
  garantie_fin: string | null
  prestataire_maintenance: string | null
  contact_prestataire: string | null
  frequence_maintenance: string | null
  prochaine_maintenance: string | null
  categorie: CategorieEquip | null
  type_controle_obligatoire: TypeControle | null
  prochain_controle_obligatoire: string | null
  derniere_controle_obligatoire: string | null
  organisme_certifie: string | null
  actif: boolean
}

export type Intervention = {
  id: string
  equipement_id: string | null
  equipement_nom: string | null
  type: TypeIntervention
  date_intervention: string | null
  description: string | null
  prestataire: string | null
  cout: number
  prochaine_intervention: string | null
  documents_url: string[]
}

// ─── Helpers statut ─────────────────────────────────────────────────

export type StatutEcheance = 'expire' | 'critique' | 'proche' | 'ok' | 'na'

/** Statut d'une date d'échéance future (garantie, maintenance, contrôle) :
 *   expire  : passée
 *   critique: < 7 jours
 *   proche  : < 30 jours
 *   ok      : > 30 jours
 *   na      : aucune date renseignée
 */
export function statutEcheance(iso: string | null): StatutEcheance {
  if (!iso) return 'na'
  const j = differenceInDays(parseISO(iso), new Date())
  if (j < 0) return 'expire'
  if (j < 7) return 'critique'
  if (j < 30) return 'proche'
  return 'ok'
}

export const STATUT_ECHEANCE_STYLE: Record<StatutEcheance, { label: string; cls: string }> = {
  expire:   { label: 'EXPIRÉ',     cls: 'bg-red-600 text-white border-red-700' },
  critique: { label: '< 7 jours',  cls: 'bg-red-100 text-red-900 border-red-300' },
  proche:   { label: '< 30 jours', cls: 'bg-amber-100 text-amber-900 border-amber-300' },
  ok:       { label: 'OK',         cls: 'bg-emerald-100 text-emerald-900 border-emerald-300' },
  na:       { label: '—',          cls: 'bg-zinc-100 text-zinc-600 border-zinc-300' },
}

export function joursRestants(iso: string | null): number | null {
  if (!iso) return null
  return differenceInDays(parseISO(iso), new Date())
}

// ─── Format ─────────────────────────────────────────────────────────
export const fmtPrix = (n: number) =>
  new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n)

export const fmtDate = (iso: string | null) => iso ? format(parseISO(iso), 'd MMM yyyy', { locale: fr }) : '—'
