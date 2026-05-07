// Module 19 — Helpers groupes : types, totaux, statuts, format.

import { format, parseISO, startOfMonth, endOfMonth, addDays, startOfWeek } from 'date-fns'
import { fr } from 'date-fns/locale'

export type TypeGroupe = 'tourisme' | 'entreprise' | 'famille' | 'scolaire' | 'associatif' | 'autre'

export const TYPE_GROUPE_INFO: Record<TypeGroupe, { label: string; emoji: string; cls: string }> = {
  tourisme:   { label: 'Tourisme',   emoji: '🚌', cls: 'bg-blue-100   text-blue-900   border-blue-300' },
  entreprise: { label: 'Entreprise', emoji: '🏢', cls: 'bg-violet-100 text-violet-900 border-violet-300' },
  famille:    { label: 'Famille',    emoji: '👨‍👩‍👧‍👦', cls: 'bg-amber-100  text-amber-900  border-amber-300' },
  scolaire:   { label: 'Scolaire',   emoji: '🎒', cls: 'bg-emerald-100 text-emerald-900 border-emerald-300' },
  associatif: { label: 'Associatif', emoji: '🤝', cls: 'bg-pink-100   text-pink-900   border-pink-300' },
  autre:      { label: 'Autre',      emoji: '•',  cls: 'bg-zinc-100   text-zinc-700   border-zinc-300' },
}

export type StatutGroupe = 'demande' | 'confirme' | 'realise' | 'annule'

export const STATUT_GROUPE_INFO: Record<StatutGroupe, { label: string; cls: string }> = {
  demande:  { label: 'Demande',  cls: 'bg-amber-100  text-amber-900  border-amber-300' },
  confirme: { label: 'Confirmé', cls: 'bg-blue-100   text-blue-900   border-blue-300' },
  realise:  { label: 'Réalisé',  cls: 'bg-emerald-100 text-emerald-900 border-emerald-300' },
  annule:   { label: 'Annulé',   cls: 'bg-red-100    text-red-900    border-red-300' },
}

export type TypePaiement = 'arrhes' | 'acompte' | 'solde' | 'remboursement'

export const TYPE_PAIEMENT_LABEL: Record<TypePaiement, { label: string; emoji: string }> = {
  arrhes:        { label: 'Arrhes',        emoji: '🤝' },
  acompte:       { label: 'Acompte',       emoji: '💵' },
  solde:         { label: 'Solde',         emoji: '✅' },
  remboursement: { label: 'Remboursement', emoji: '↩️' },
}

export type MethodePaiement = 'especes' | 'carte' | 'virement' | 'cheque' | 'autre'

export type Groupe = {
  id: string
  nom: string
  type: TypeGroupe
  tour_operateur: string | null
  contact_nom: string | null
  contact_telephone: string | null
  contact_email: string | null
  date_visite: string
  heure_arrivee: string | null
  heure_depart: string | null
  nb_personnes: number
  prix_par_personne_ht: number
  taux_tva: number
  facturation_via_to: boolean
  statut: StatutGroupe
  notes: string | null
  zone_assignee: string | null
  responsable_employe_id: string | null
  responsable_nom: string | null
}

export type MenuGroupe = {
  id: string
  groupe_id: string
  recette_id: string | null
  recette_nom: string                 // soit recette_nom_libre soit jointure
  categorie: string | null
  quantite_par_personne: number
  prix_negocie_ht: number | null
  ordre: number
  notes: string | null
}

export type Paiement = {
  id: string
  groupe_id: string
  type: TypePaiement
  date_paiement: string
  montant: number
  methode: MethodePaiement
  reference: string | null
  notes: string | null
}

// ─── Calculs ────────────────────────────────────────────────────────

export function totalGroupeHT(g: Groupe): number {
  return Math.round(g.nb_personnes * g.prix_par_personne_ht * 100) / 100
}

export function totalGroupeTTC(g: Groupe): number {
  return Math.round(totalGroupeHT(g) * (1 + g.taux_tva / 100) * 100) / 100
}

export function totalPaye(paiements: Paiement[]): number {
  return Math.round(paiements
    .filter(p => p.type !== 'remboursement')
    .reduce((s, p) => s + p.montant, 0) * 100) / 100
}

export function totalRembourse(paiements: Paiement[]): number {
  return Math.round(paiements
    .filter(p => p.type === 'remboursement')
    .reduce((s, p) => s + p.montant, 0) * 100) / 100
}

export function resteAPayer(g: Groupe, paiements: Paiement[]): number {
  return Math.round((totalGroupeTTC(g) - totalPaye(paiements) + totalRembourse(paiements)) * 100) / 100
}

// ─── Calendrier mensuel ─────────────────────────────────────────────
export type JourCalendrier = {
  date: Date
  iso: string
  jour: number
  estCeMois: boolean
  estAujourdhui: boolean
  groupes: Groupe[]
}

export function joursCalendrier(refDate: Date, groupes: Groupe[]): JourCalendrier[] {
  const debutMois = startOfMonth(refDate)
  const finMois = endOfMonth(refDate)
  const debutGrille = startOfWeek(debutMois, { weekStartsOn: 1 })
  const today = format(new Date(), 'yyyy-MM-dd')

  const out: JourCalendrier[] = []
  let cursor = debutGrille
  // Toujours 6 semaines pour cohérence visuelle
  for (let i = 0; i < 42; i++) {
    const iso = format(cursor, 'yyyy-MM-dd')
    out.push({
      date: cursor,
      iso,
      jour: cursor.getDate(),
      estCeMois: cursor >= debutMois && cursor <= finMois,
      estAujourdhui: iso === today,
      groupes: groupes.filter(g => g.date_visite === iso),
    })
    cursor = addDays(cursor, 1)
  }
  return out
}

// ─── Format ─────────────────────────────────────────────────────────
export const fmtPrix = (n: number) =>
  new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n)

export const fmtDate = (iso: string) => format(parseISO(iso), 'd MMM yyyy', { locale: fr })

export const fmtMois = (date: Date) => format(date, 'MMMM yyyy', { locale: fr })
