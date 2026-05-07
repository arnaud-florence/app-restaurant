// Module 20 — Helpers CRM & fidélité.

import { format, parseISO, differenceInDays } from 'date-fns'
import { fr } from 'date-fns/locale'

// ─── Types ──────────────────────────────────────────────────────────
export type Client = {
  id: string
  prenom: string | null
  nom: string
  email: string | null
  telephone: string | null
  adresse: string | null
  date_naissance: string | null
  allergies: string[]
  preferences: string | null
  points_fidelite: number
  niveau_fidelite: string
  notes_internes: string | null
  code_parrainage: string | null
  parraine_par_id: string | null
  parraine_par_nom: string | null
  opt_in_marketing: boolean
  total_depense: number
  nb_visites: number
  derniere_visite: string | null
  created_at: string
}

export type NiveauFidelite = 'standard' | 'bronze' | 'argent' | 'or' | 'platine'

export const NIVEAU_INFO: Record<NiveauFidelite, { label: string; emoji: string; cls: string; min_visites: number }> = {
  standard: { label: 'Standard', emoji: '👤', cls: 'bg-zinc-100   text-zinc-700   border-zinc-300',     min_visites: 0  },
  bronze:   { label: 'Bronze',   emoji: '🥉', cls: 'bg-amber-100  text-amber-900  border-amber-300',    min_visites: 5  },
  argent:   { label: 'Argent',   emoji: '🥈', cls: 'bg-stone-100  text-stone-900  border-stone-300',    min_visites: 15 },
  or:       { label: 'Or',       emoji: '🥇', cls: 'bg-yellow-100 text-yellow-900 border-yellow-300',   min_visites: 30 },
  platine:  { label: 'Platine',  emoji: '💎', cls: 'bg-violet-100 text-violet-900 border-violet-300',   min_visites: 60 },
}

export function calculerNiveau(nb_visites: number): NiveauFidelite {
  if (nb_visites >= 60) return 'platine'
  if (nb_visites >= 30) return 'or'
  if (nb_visites >= 15) return 'argent'
  if (nb_visites >= 5)  return 'bronze'
  return 'standard'
}

// ─── Segmentation dynamique ─────────────────────────────────────────
export type SegmentClient = 'vip' | 'fidele' | 'nouveau' | 'dormant' | 'allergique' | 'anniversaire'

export const SEGMENT_INFO: Record<SegmentClient, { label: string; emoji: string; cls: string; description: string }> = {
  vip:          { label: 'VIP',          emoji: '💎', cls: 'bg-violet-100 text-violet-900 border-violet-300', description: 'Niveau Or ou Platine' },
  fidele:       { label: 'Fidèles',      emoji: '⭐', cls: 'bg-amber-100  text-amber-900  border-amber-300',   description: '≥ 5 visites + visite < 90j' },
  nouveau:      { label: 'Nouveaux',     emoji: '🌱', cls: 'bg-emerald-100 text-emerald-900 border-emerald-300', description: 'Inscrits < 30j' },
  dormant:      { label: 'Dormants',     emoji: '😴', cls: 'bg-zinc-100   text-zinc-700   border-zinc-300',     description: 'Aucune visite depuis 90j' },
  allergique:   { label: 'Allergiques',  emoji: '⚠️', cls: 'bg-red-100    text-red-900    border-red-300',      description: 'Au moins 1 allergie déclarée' },
  anniversaire: { label: 'Anniv 30j',    emoji: '🎂', cls: 'bg-pink-100   text-pink-900   border-pink-300',     description: 'Date de naissance dans les 30j' },
}

export function appartientSegment(client: Client, segment: SegmentClient): boolean {
  const today = new Date()
  switch (segment) {
    case 'vip': {
      const niv = calculerNiveau(client.nb_visites)
      return niv === 'or' || niv === 'platine'
    }
    case 'fidele': {
      if (client.nb_visites < 5) return false
      if (!client.derniere_visite) return false
      return differenceInDays(today, parseISO(client.derniere_visite)) < 90
    }
    case 'nouveau': {
      return differenceInDays(today, parseISO(client.created_at)) < 30
    }
    case 'dormant': {
      if (client.nb_visites === 0) return false  // jamais venu, n'est pas un dormant
      if (!client.derniere_visite) return true
      return differenceInDays(today, parseISO(client.derniere_visite)) >= 90
    }
    case 'allergique': {
      return client.allergies.length > 0
    }
    case 'anniversaire': {
      if (!client.date_naissance) return false
      const naiss = parseISO(client.date_naissance)
      const dansAnneeCourante = new Date(today.getFullYear(), naiss.getMonth(), naiss.getDate())
      const j = differenceInDays(dansAnneeCourante, today)
      return j >= 0 && j <= 30
    }
  }
}

// ─── Campagnes ──────────────────────────────────────────────────────
export type TypeCampagne = 'email' | 'sms'
export type SegmentCampagne = 'tous' | 'vip' | 'dormants' | 'anniversaires' | 'nouveaux' | 'allergiques' | 'custom'

export const SEGMENT_CAMPAGNE_LABEL: Record<SegmentCampagne, string> = {
  tous:           'Tous (opt-in)',
  vip:            'VIP (Or + Platine)',
  dormants:       'Dormants (>90j)',
  anniversaires:  'Anniversaires 30j',
  nouveaux:       'Nouveaux (<30j)',
  allergiques:    'Allergiques',
  custom:         'Personnalisé',
}

export type StatutCampagne = 'brouillon' | 'envoyee' | 'annulee'

export const STATUT_CAMPAGNE_INFO: Record<StatutCampagne, { label: string; cls: string }> = {
  brouillon: { label: 'Brouillon', cls: 'bg-zinc-100  text-zinc-700  border-zinc-300' },
  envoyee:   { label: 'Envoyée',   cls: 'bg-emerald-100 text-emerald-900 border-emerald-300' },
  annulee:   { label: 'Annulée',   cls: 'bg-red-100   text-red-900   border-red-300' },
}

export type Campagne = {
  id: string
  titre: string
  type: TypeCampagne
  segment: SegmentCampagne
  segment_filtre: Record<string, unknown> | null
  sujet: string | null
  contenu: string
  nb_destinataires: number
  date_envoi: string | null
  statut: StatutCampagne
  notes: string | null
  created_at: string
}

// ─── Réclamations & retours ─────────────────────────────────────────
export type TypeReclamation = 'service' | 'plat' | 'attente' | 'hygiene' | 'prix' | 'autre'

export const TYPE_RECLAM_INFO: Record<TypeReclamation, { label: string; emoji: string }> = {
  service: { label: 'Service',  emoji: '🛎️' },
  plat:    { label: 'Plat',     emoji: '🍽️' },
  attente: { label: 'Attente',  emoji: '⏱️' },
  hygiene: { label: 'Hygiène',  emoji: '🧼' },
  prix:    { label: 'Prix',     emoji: '💶' },
  autre:   { label: 'Autre',    emoji: '•'  },
}

export type GraviteReclam = 'mineure' | 'majeure' | 'critique'
export type StatutReclam = 'ouverte' | 'en_cours' | 'resolue'

export const GRAVITE_RECLAM_INFO: Record<GraviteReclam, { label: string; cls: string }> = {
  mineure:  { label: 'Mineure',  cls: 'bg-zinc-100  text-zinc-800  border-zinc-300' },
  majeure:  { label: 'Majeure',  cls: 'bg-amber-100 text-amber-900 border-amber-300' },
  critique: { label: 'Critique', cls: 'bg-red-100   text-red-900   border-red-300' },
}

export const STATUT_RECLAM_INFO: Record<StatutReclam, { label: string; cls: string }> = {
  ouverte:  { label: 'Ouverte',  cls: 'bg-red-100   text-red-900   border-red-300' },
  en_cours: { label: 'En cours', cls: 'bg-amber-100 text-amber-900 border-amber-300' },
  resolue:  { label: 'Résolue',  cls: 'bg-emerald-100 text-emerald-900 border-emerald-300' },
}

export type Reclamation = {
  id: string
  client_id: string | null
  client_nom: string
  client_nom_libre: string | null
  date_reclamation: string
  type: TypeReclamation
  gravite: GraviteReclam
  description: string
  statut: StatutReclam
  action_corrective: string | null
  geste_commercial: string | null
  resolved_at: string | null
  responsable_id: string | null
  responsable_nom: string | null
  notes: string | null
}

export type MotifRetour = 'cuisson' | 'temperature' | 'gout' | 'presentation' | 'allergie' | 'autre'

export const MOTIF_RETOUR_LABEL: Record<MotifRetour, { label: string; emoji: string }> = {
  cuisson:      { label: 'Cuisson',      emoji: '🔥' },
  temperature:  { label: 'Température',  emoji: '🌡️' },
  gout:         { label: 'Goût',         emoji: '👅' },
  presentation: { label: 'Présentation', emoji: '🎨' },
  allergie:     { label: 'Allergie',     emoji: '⚠️' },
  autre:        { label: 'Autre',        emoji: '•'  },
}

export type RetourPlat = {
  id: string
  client_id: string | null
  client_nom: string | null
  date_retour: string
  recette_id: string | null
  recette_nom: string
  motif: MotifRetour
  description: string | null
  cout_food_cost: number
  geste_commercial: string | null
  refait: boolean
  notes: string | null
  responsable_id: string | null
  responsable_nom: string | null
}

// ─── Code parrainage : génération ───────────────────────────────────
export function genererCodeParrainage(prenom: string, nom: string): string {
  const base = (prenom.slice(0, 3) + nom.slice(0, 3)).toUpperCase().replace(/[^A-Z]/g, '')
  const rand = Math.random().toString(36).slice(2, 6).toUpperCase()
  return `${base}-${rand}`
}

// ─── Format ─────────────────────────────────────────────────────────
export const fmtPrix = (n: number) =>
  new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n)

export const fmtDate = (iso: string | null) => iso ? format(parseISO(iso), 'd MMM yyyy', { locale: fr }) : '—'
