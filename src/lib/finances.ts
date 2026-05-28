// Module 14 — Helpers finances : P&L, ratios, projection trésorerie,
// simulateurs, export CSV.

import { format, parseISO, addDays, startOfMonth, endOfMonth, addMonths } from 'date-fns'
import { fr } from 'date-fns/locale'

// ─── Types ──────────────────────────────────────────────────────────
export type CategorieCharge =
  | 'loyer' | 'energie' | 'eau' | 'telecom' | 'internet' | 'assurance'
  | 'salaire' | 'comptable' | 'banque' | 'urssaf' | 'impots' | 'abonnement' | 'autre'

export const CATEGORIE_CHARGE_INFO: Record<CategorieCharge, { label: string; emoji: string; cls: string }> = {
  loyer:       { label: 'Loyer',          emoji: '🏠', cls: 'bg-amber-100  text-amber-900  border-amber-300' },
  energie:     { label: 'Électricité/Gaz', emoji: '⚡', cls: 'bg-yellow-100 text-yellow-900 border-yellow-300' },
  eau:         { label: 'Eau',            emoji: '💧', cls: 'bg-cyan-100   text-cyan-900   border-cyan-300' },
  telecom:     { label: 'Téléphone',      emoji: '📞', cls: 'bg-blue-100   text-blue-900   border-blue-300' },
  internet:    { label: 'Internet',       emoji: '🌐', cls: 'bg-blue-100   text-blue-900   border-blue-300' },
  assurance:   { label: 'Assurance',      emoji: '🛡️', cls: 'bg-violet-100 text-violet-900 border-violet-300' },
  salaire:     { label: 'Salaires',       emoji: '💰', cls: 'bg-emerald-100 text-emerald-900 border-emerald-300' },
  comptable:   { label: 'Comptable',      emoji: '📊', cls: 'bg-stone-100  text-stone-800  border-stone-300' },
  banque:      { label: 'Banque',         emoji: '🏦', cls: 'bg-zinc-100   text-zinc-800   border-zinc-300' },
  urssaf:      { label: 'URSSAF',         emoji: '🇫🇷', cls: 'bg-red-100    text-red-900    border-red-300' },
  impots:      { label: 'Impôts',         emoji: '📑', cls: 'bg-red-100    text-red-900    border-red-300' },
  abonnement:  { label: 'Abonnement',     emoji: '🔄', cls: 'bg-pink-100   text-pink-900   border-pink-300' },
  autre:       { label: 'Autre',          emoji: '•',  cls: 'bg-zinc-100   text-zinc-700   border-zinc-300' },
}

export type FrequenceCharge = 'mensuel' | 'bimestriel' | 'trimestriel' | 'semestriel' | 'annuel'

export const FREQUENCE_MULTIPLIER: Record<FrequenceCharge, number> = {
  mensuel: 1, bimestriel: 0.5, trimestriel: 1/3, semestriel: 1/6, annuel: 1/12,
}

export type ChargeFixe = {
  id: string
  libelle: string
  categorie: CategorieCharge
  montant_ht: number
  montant_ttc: number
  frequence: FrequenceCharge
  jour_prelevement: number | null
  prochaine_echeance: string | null
  fournisseur_nom: string | null
  iban: string | null
  notes: string | null
  actif: boolean
}

export type StatutNDF = 'en_attente' | 'remboursee' | 'refusee'

export const STATUT_NDF_LABEL: Record<StatutNDF, { label: string; cls: string }> = {
  en_attente:  { label: 'En attente', cls: 'bg-amber-100  text-amber-900  border-amber-300' },
  remboursee:  { label: 'Remboursée', cls: 'bg-emerald-100 text-emerald-900 border-emerald-300' },
  refusee:     { label: 'Refusée',    cls: 'bg-red-100    text-red-900    border-red-300' },
}

export type NoteDeFrais = {
  id: string
  employe_id: string
  employe_nom: string
  date_depense: string
  libelle: string
  motif: string | null
  montant: number
  justificatif_url: string | null
  statut: StatutNDF
  remboursee_at: string | null
  remboursee_par_nom: string | null
  notes_admin: string | null
  created_at: string
}

// ─── Compte de résultat ─────────────────────────────────────────────
export type CompteResultat = {
  ca_ttc: number
  ca_ht: number             // approximé via TVA 10%
  food_cost: number         // sum entrées stock du mois
  masse_salariale: number   // sum coûts shifts du mois
  charges_fixes_mensuelles: number  // ramené au mois (multiplier par fréquence)
  notes_de_frais_mois: number       // sum notes remboursées du mois
  total_charges: number
  resultat_net: number
  food_cost_pct: number
  masse_salariale_pct: number
  charges_fixes_pct: number
  marge_nette_pct: number
}

export function calculerCR(input: {
  ca_ttc: number
  food_cost: number
  masse_salariale: number
  charges_fixes_mensuelles: number
  notes_de_frais_mois: number
  ca_ht?: number   // HT réel agrégé depuis les commandes (ventilation multi-taux). Si absent → flat 10% (legacy).
}): CompteResultat {
  const ca_ttc = input.ca_ttc
  // Préfère le HT réel (somme des montant_total_ht des commandes encaissées), sinon flat 10%.
  const ca_ht = (input.ca_ht != null && input.ca_ht > 0) ? input.ca_ht : ca_ttc / 1.10
  const total_charges = input.food_cost + input.masse_salariale + input.charges_fixes_mensuelles + input.notes_de_frais_mois
  const resultat_net = ca_ht - total_charges  // résultat = HT - charges HT
  return {
    ca_ttc,
    ca_ht: round2(ca_ht),
    food_cost: input.food_cost,
    masse_salariale: input.masse_salariale,
    charges_fixes_mensuelles: input.charges_fixes_mensuelles,
    notes_de_frais_mois: input.notes_de_frais_mois,
    total_charges: round2(total_charges),
    resultat_net: round2(resultat_net),
    food_cost_pct:        ca_ht > 0 ? round1((input.food_cost / ca_ht) * 100) : 0,
    masse_salariale_pct:  ca_ttc > 0 ? round1((input.masse_salariale / ca_ttc) * 100) : 0,
    charges_fixes_pct:    ca_ht > 0 ? round1((input.charges_fixes_mensuelles / ca_ht) * 100) : 0,
    marge_nette_pct:      ca_ht > 0 ? round1((resultat_net / ca_ht) * 100) : 0,
  }
}

/** Charges fixes mensualisées : applique la fréquence pour ramener à un mois. */
export function chargesFixesMensuelles(charges: { montant_ttc: number; frequence: FrequenceCharge; actif: boolean }[]): number {
  return round2(charges
    .filter(c => c.actif)
    .reduce((s, c) => s + c.montant_ttc * FREQUENCE_MULTIPLIER[c.frequence], 0))
}

/** Seuil de rentabilité quotidien = (charges fixes mensuelles + masse sal mensuelle) / nb jours du mois. */
export function seuilRentabiliteJour(charges_fixes_mensuelles: number, masse_salariale: number, nbJoursOuverts = 26): number {
  if (nbJoursOuverts <= 0) return 0
  return round2((charges_fixes_mensuelles + masse_salariale) / nbJoursOuverts)
}

// ─── TVA ────────────────────────────────────────────────────────────
export type TvaSummary = {
  tva_collectee: number      // sur paiements_caisse (vente)
  tva_deductible: number     // sur factures fournisseurs (achat)
  tva_a_reverser: number     // collectée - déductible
}

export function calculerTVA(
  caTTCMois: number,
  factures: { montant_ht: number; montant_ttc: number }[],
  taux = 0.10,
  tvaCollecteeReelle?: number,   // TVA réelle agrégée (somme tva_total des commandes, multi-taux). Si absent → flat (legacy).
): TvaSummary {
  const tva_collectee = (tvaCollecteeReelle != null && tvaCollecteeReelle > 0)
    ? round2(tvaCollecteeReelle)
    : round2(caTTCMois - caTTCMois / (1 + taux))
  const tva_deductible = round2(factures.reduce((s, f) => s + (f.montant_ttc - f.montant_ht), 0))
  return {
    tva_collectee,
    tva_deductible,
    tva_a_reverser: round2(tva_collectee - tva_deductible),
  }
}

// ─── Trésorerie ─────────────────────────────────────────────────────
export type ProjectionPoint = {
  jour: number      // 0, 30, 60, 90
  date: string
  solde: number
  detail: string
}

export function projeterTresorerie(input: {
  solde_initial: number
  date_solde: string  // ISO
  ca_jour_moyen: number
  charges_a_venir: { date: string; montant: number; libelle: string }[]
}): ProjectionPoint[] {
  const dateRef = parseISO(input.date_solde)
  const out: ProjectionPoint[] = [{
    jour: 0, date: input.date_solde, solde: round2(input.solde_initial), detail: 'Solde de référence',
  }]
  for (const horizon of [30, 60, 90]) {
    const dateHorizon = addDays(dateRef, horizon)
    const dateHorizonIso = format(dateHorizon, 'yyyy-MM-dd')

    const recettes = input.ca_jour_moyen * horizon
    const charges = input.charges_a_venir
      .filter(c => parseISO(c.date) > dateRef && parseISO(c.date) <= dateHorizon)
      .reduce((s, c) => s + c.montant, 0)

    const solde = input.solde_initial + recettes - charges
    out.push({
      jour: horizon,
      date: dateHorizonIso,
      solde: round2(solde),
      detail: `+${round2(recettes)}€ recettes − ${round2(charges)}€ charges`,
    })
  }
  return out
}

// ─── Simulateurs ────────────────────────────────────────────────────
export type SimulationCA = {
  ca_cible: number
  food_cost_estime: number
  masse_salariale_estimee: number
  charges_fixes: number
  resultat_net_estime: number
  marge_nette_pct: number
}

export function simulerCA(
  ca_cible: number,
  food_cost_pct: number,    // % du CA HT
  masse_salariale_pct: number, // % du CA TTC
  charges_fixes_mensuelles: number,
): SimulationCA {
  const ca_ht = ca_cible / 1.10
  const food_cost = ca_ht * (food_cost_pct / 100)
  const masse_salariale = ca_cible * (masse_salariale_pct / 100)
  const total_charges = food_cost + masse_salariale + charges_fixes_mensuelles
  const resultat = ca_ht - total_charges
  return {
    ca_cible, food_cost_estime: round2(food_cost),
    masse_salariale_estimee: round2(masse_salariale),
    charges_fixes: round2(charges_fixes_mensuelles),
    resultat_net_estime: round2(resultat),
    marge_nette_pct: ca_ht > 0 ? round1((resultat / ca_ht) * 100) : 0,
  }
}

// ─── Export CSV ─────────────────────────────────────────────────────
export type EcritureComptable = {
  date: string          // YYYY-MM-DD
  numero: string        // n° pièce
  libelle: string
  compte: string        // 707, 401, 60611, etc.
  debit: number
  credit: number
  journal: string       // VTE, ACH, OD
}

export function ecrituresVersCSV(ecritures: EcritureComptable[]): string {
  const head = ['Date','N° Pièce','Libellé','Compte','Débit','Crédit','Journal']
  const lines = [head.join(';')]
  for (const e of ecritures) {
    lines.push([
      e.date,
      escapeCSV(e.numero),
      escapeCSV(e.libelle),
      e.compte,
      e.debit > 0 ? e.debit.toFixed(2).replace('.', ',') : '',
      e.credit > 0 ? e.credit.toFixed(2).replace('.', ',') : '',
      e.journal,
    ].join(';'))
  }
  return '﻿' + lines.join('\r\n')   // BOM pour Excel UTF-8
}

function escapeCSV(s: string): string {
  if (s.includes(';') || s.includes('"') || s.includes('\n')) {
    return '"' + s.replace(/"/g, '""') + '"'
  }
  return s
}

// ─── Helpers dates ──────────────────────────────────────────────────
export function intervalleMoisIso(refDate: Date): { debut: string; fin: string; libelle: string } {
  return {
    debut: format(startOfMonth(refDate), 'yyyy-MM-dd'),
    fin:   format(endOfMonth(refDate), 'yyyy-MM-dd'),
    libelle: format(refDate, 'MMMM yyyy', { locale: fr }),
  }
}

export function moisPrecedent(refDate: Date): Date {
  return addMonths(refDate, -1)
}

// ─── Format ─────────────────────────────────────────────────────────
const round1 = (n: number) => Math.round(n * 10) / 10
const round2 = (n: number) => Math.round(n * 100) / 100

export const fmtPrix = (n: number) =>
  new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n)

export const fmtPct = (n: number) => `${round1(n).toLocaleString('fr-FR')} %`

export const fmtDate = (iso: string) => format(parseISO(iso), 'd MMM yyyy', { locale: fr })
