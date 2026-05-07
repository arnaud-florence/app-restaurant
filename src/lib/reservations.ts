// Module 21 — Helpers réservations & événementiel.

import { format, parseISO, differenceInDays, addDays, startOfWeek } from 'date-fns'
import { fr } from 'date-fns/locale'

// ─── Chambres ───────────────────────────────────────────────────────
export type Chambre = {
  id: string
  nom: string
  numero: string
  capacite: number
  prix_nuit_ht: number
  description: string | null
  equipements: string[]
  photos: string[]
  actif: boolean
}

export type StatutResa = 'demande' | 'confirmee' | 'annulee' | 'terminee' | 'arrivee'

export const STATUT_RESA_INFO: Record<StatutResa, { label: string; cls: string }> = {
  demande:   { label: 'Demande',     cls: 'bg-amber-100  text-amber-900  border-amber-300' },
  confirmee: { label: 'Confirmée',   cls: 'bg-blue-100   text-blue-900   border-blue-300' },
  arrivee:   { label: 'Arrivée',     cls: 'bg-emerald-100 text-emerald-900 border-emerald-300' },
  terminee:  { label: 'Terminée',    cls: 'bg-zinc-100   text-zinc-700   border-zinc-300' },
  annulee:   { label: 'Annulée',     cls: 'bg-red-100    text-red-900    border-red-300' },
}

export type ResaChambre = {
  id: string
  chambre_id: string
  chambre_nom: string
  client_nom: string
  client_email: string | null
  client_telephone: string | null
  date_arrivee: string
  date_depart: string
  nb_personnes: number
  montant_total: number
  acompte_verse: number
  statut: StatutResa
  notes: string | null
}

export function nbNuits(arrivee: string, depart: string): number {
  return Math.max(1, differenceInDays(parseISO(depart), parseISO(arrivee)))
}

// ─── Tables / terrasse ──────────────────────────────────────────────
export type StatutResaTable = 'demande' | 'confirmee' | 'arrivee' | 'terminee' | 'no_show' | 'annulee'

export const STATUT_RESA_TABLE_INFO: Record<StatutResaTable, { label: string; cls: string }> = {
  demande:   { label: 'Demande',   cls: 'bg-amber-100  text-amber-900  border-amber-300' },
  confirmee: { label: 'Confirmée', cls: 'bg-blue-100   text-blue-900   border-blue-300' },
  arrivee:   { label: 'Arrivée',   cls: 'bg-emerald-100 text-emerald-900 border-emerald-300' },
  terminee:  { label: 'Terminée',  cls: 'bg-zinc-100   text-zinc-700   border-zinc-300' },
  no_show:   { label: 'No-show',   cls: 'bg-red-100    text-red-900    border-red-300' },
  annulee:   { label: 'Annulée',   cls: 'bg-red-100    text-red-900    border-red-300' },
}

export type ResaTable = {
  id: string
  table_id: string | null
  table_numero: string | null
  zone: string | null
  date_resa: string
  heure_arrivee: string
  heure_depart: string | null
  nb_personnes: number
  client_nom: string
  client_telephone: string | null
  client_email: string | null
  client_id: string | null
  notes: string | null
  statut: StatutResaTable
  rappel_envoye: boolean
}

// ─── Événements ─────────────────────────────────────────────────────
export type TypeEvenement = 'mariage' | 'anniversaire' | 'seminaire' | 'cocktail' | 'banquet' | 'enterrement_vie' | 'privatisation' | 'autre'

export const TYPE_EVENT_INFO: Record<TypeEvenement, { label: string; emoji: string; cls: string }> = {
  mariage:          { label: 'Mariage',           emoji: '💍', cls: 'bg-pink-100   text-pink-900   border-pink-300' },
  anniversaire:     { label: 'Anniversaire',      emoji: '🎂', cls: 'bg-amber-100  text-amber-900  border-amber-300' },
  seminaire:        { label: 'Séminaire',         emoji: '🏢', cls: 'bg-blue-100   text-blue-900   border-blue-300' },
  cocktail:         { label: 'Cocktail',          emoji: '🍸', cls: 'bg-violet-100 text-violet-900 border-violet-300' },
  banquet:          { label: 'Banquet',           emoji: '🍽️', cls: 'bg-emerald-100 text-emerald-900 border-emerald-300' },
  enterrement_vie:  { label: 'EVJF / EVG',        emoji: '🎉', cls: 'bg-yellow-100 text-yellow-900 border-yellow-300' },
  privatisation:    { label: 'Privatisation',     emoji: '🔒', cls: 'bg-red-100    text-red-900    border-red-300' },
  autre:            { label: 'Autre',             emoji: '•',  cls: 'bg-zinc-100   text-zinc-700   border-zinc-300' },
}

export type StatutEvent = 'demande' | 'confirmee' | 'realise' | 'annulee'

export const STATUT_EVENT_INFO: Record<StatutEvent, { label: string; cls: string }> = {
  demande:   { label: 'Demande',  cls: 'bg-amber-100  text-amber-900  border-amber-300' },
  confirmee: { label: 'Confirmé', cls: 'bg-blue-100   text-blue-900   border-blue-300' },
  realise:   { label: 'Réalisé',  cls: 'bg-emerald-100 text-emerald-900 border-emerald-300' },
  annulee:   { label: 'Annulé',   cls: 'bg-red-100    text-red-900    border-red-300' },
}

export type Evenement = {
  id: string
  titre: string
  type: TypeEvenement | null
  date_evenement: string
  heure_debut: string | null
  heure_fin: string | null
  nb_personnes: number
  prix_par_personne_ht: number | null
  taux_tva: number
  montant_devis: number
  acompte_verse: number
  statut: StatutEvent
  client_nom: string | null
  client_email: string | null
  client_telephone: string | null
  lieu: string | null
  privatisation: boolean
  materiel_demande: string | null
  besoins_techniques: string | null
  notes: string | null
}

// ─── Calcul total séjour chambre ────────────────────────────────────
export function totalSejour(chambre: Chambre, arrivee: string, depart: string): number {
  return Math.round(chambre.prix_nuit_ht * nbNuits(arrivee, depart) * 100) / 100
}

// ─── Calendrier multi-chambres ──────────────────────────────────────
export type JourCalendrier = {
  date: Date
  iso: string
  jour: number
  estAujourdhui: boolean
}

export function joursSemaineFrom(refDate: Date, nbJours = 14): JourCalendrier[] {
  const today = format(new Date(), 'yyyy-MM-dd')
  const start = startOfWeek(refDate, { weekStartsOn: 1 })
  return Array.from({ length: nbJours }, (_, i) => {
    const d = addDays(start, i)
    return {
      date: d,
      iso: format(d, 'yyyy-MM-dd'),
      jour: d.getDate(),
      estAujourdhui: format(d, 'yyyy-MM-dd') === today,
    }
  })
}

export function chambreOccupeeLeJour(resas: ResaChambre[], chambre_id: string, iso: string): ResaChambre | null {
  for (const r of resas) {
    if (r.chambre_id !== chambre_id) continue
    if (r.statut === 'annulee') continue
    if (iso >= r.date_arrivee && iso < r.date_depart) return r
  }
  return null
}

// ─── Format ─────────────────────────────────────────────────────────
export const fmtPrix = (n: number) =>
  new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n)

export const fmtDate = (iso: string | null) => iso ? format(parseISO(iso), 'd MMM yyyy', { locale: fr }) : '—'

export const fmtDateLong = (iso: string | null) => iso ? format(parseISO(iso), 'EEEE d MMMM yyyy', { locale: fr }) : '—'
