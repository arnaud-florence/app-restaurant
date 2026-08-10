// Module 13 — Helpers RH partagés (calcul coût, masse salariale,
// heures sup, productivité, format).

import { format, parseISO, startOfWeek, addDays, endOfMonth, startOfMonth } from 'date-fns'
import { fr } from 'date-fns/locale'

// ─── Types ──────────────────────────────────────────────────────────
export type TypeContrat = 'CDI' | 'CDD' | 'extra' | 'apprentissage' | 'stage' | 'autre'
export type Poste       = 'cuisine' | 'pizzaiolo' | 'bar' | 'salle' | 'serveur' | 'manager' | 'plonge' | 'autre'

export const POSTE_LABEL: Record<Poste, { label: string; emoji: string; cls: string }> = {
  cuisine:       { label: 'Cuisine',       emoji: '👨‍🍳', cls: 'bg-amber-100  text-amber-900  border-amber-300' },
  pizzaiolo:     { label: 'Pizzaiolo',     emoji: '🍕', cls: 'bg-red-100    text-red-900    border-red-300' },
  bar:           { label: 'Bar',           emoji: '🍷', cls: 'bg-violet-100 text-violet-900 border-violet-300' },
  salle:         { label: 'Salle',         emoji: '🪑', cls: 'bg-blue-100   text-blue-900   border-blue-300' },
  serveur:       { label: 'Serveur',       emoji: '🛎️', cls: 'bg-blue-100   text-blue-900   border-blue-300' },
  manager:       { label: 'Manager',       emoji: '🧑‍💼', cls: 'bg-emerald-100 text-emerald-900 border-emerald-300' },
  plonge:        { label: 'Plonge',        emoji: '🧽', cls: 'bg-cyan-100   text-cyan-900   border-cyan-300' },
  autre:         { label: 'Autre',         emoji: '•',  cls: 'bg-zinc-100   text-zinc-700   border-zinc-300' },
}

export const CONTRAT_LABEL: Record<TypeContrat, { label: string; cls: string }> = {
  CDI:            { label: 'CDI',            cls: 'bg-emerald-100 text-emerald-900 border-emerald-300' },
  CDD:            { label: 'CDD',            cls: 'bg-blue-100   text-blue-900   border-blue-300' },
  extra:          { label: 'Extra',          cls: 'bg-amber-100  text-amber-900  border-amber-300' },
  apprentissage:  { label: 'Apprentissage',  cls: 'bg-violet-100 text-violet-900 border-violet-300' },
  stage:          { label: 'Stage',          cls: 'bg-cyan-100   text-cyan-900   border-cyan-300' },
  autre:          { label: 'Autre',          cls: 'bg-zinc-100   text-zinc-700   border-zinc-300' },
}

export type Employe = {
  id: string
  prenom: string
  nom: string
  poste: string
  type_contrat: string
  email: string | null
  telephone: string | null
  salaire_horaire: number
  heures_contrat: number
  date_embauche: string | null
  date_sortie: string | null
  solde_conges_jours: number
  notes_internes: string | null
  actif: boolean
  created_at: string
  // Interrupteurs d'autonomie (pilotés par le gérant dans /admin/rh)
  autonomie_reception?: boolean
  autonomie_commande?: boolean
  autonomie_modif_recettes?: boolean
  autonomie_voir_prix?: boolean
}

export type TypeDocument = 'contrat' | 'cni' | 'passeport' | 'permis_travail' | 'casier' | 'visite_medicale' | 'rib' | 'attestation' | 'autre'

export const TYPE_DOC_LABEL: Record<TypeDocument, { label: string; emoji: string }> = {
  contrat:         { label: 'Contrat de travail', emoji: '📝' },
  cni:             { label: 'CNI / Passeport',    emoji: '🪪' },
  passeport:       { label: 'Passeport',          emoji: '📔' },
  permis_travail:  { label: 'Permis de travail',  emoji: '🛂' },
  casier:          { label: 'Casier judiciaire',  emoji: '⚖️' },
  visite_medicale: { label: 'Visite médicale',    emoji: '🩺' },
  rib:             { label: 'RIB',                emoji: '🏦' },
  attestation:     { label: 'Attestation',        emoji: '📜' },
  autre:           { label: 'Autre',              emoji: '•' },
}

export type Document = {
  id: string
  employe_id: string
  type: TypeDocument
  nom: string
  url: string
  date_emission: string | null
  date_expiration: string | null
  notes: string | null
  created_at: string
}

export type TypeFormation = 'haccp' | 'permis_exploitation' | 'sst' | 'incendie' | 'allergenes' | 'hygiene' | 'autre'

export const TYPE_FORMATION_LABEL: Record<TypeFormation, { label: string; emoji: string; obligatoire: boolean }> = {
  haccp:               { label: 'HACCP',                emoji: '🛡️', obligatoire: true  },
  permis_exploitation: { label: 'Permis exploitation', emoji: '📜', obligatoire: true  },
  sst:                 { label: 'SST (secourisme)',    emoji: '🩹', obligatoire: false },
  incendie:            { label: 'Incendie',            emoji: '🔥', obligatoire: false },
  allergenes:          { label: 'Allergènes',          emoji: '⚠️', obligatoire: false },
  hygiene:             { label: 'Hygiène alimentaire', emoji: '🧼', obligatoire: false },
  autre:               { label: 'Autre',               emoji: '•',  obligatoire: false },
}

export type Formation = {
  id: string
  employe_id: string
  formation: TypeFormation
  titre: string
  organisme: string | null
  date_obtention: string
  date_expiration: string | null
  document_url: string | null
  notes: string | null
  created_at: string
}

export type Shift = {
  id: string
  employe_id: string
  employe_nom: string
  date_travail: string
  heure_debut: string
  heure_fin: string
  poste_jour: string | null
  notes: string | null
  cout: number          // calculé : heures * salaire_horaire
  heures: number        // calculé
}

export type Pointage = {
  id: string
  employe_id: string
  employe_nom: string
  date_pointage: string
  heure_arrivee: string | null
  heure_depart: string | null
  heures_travaillees: number | null
  notes: string | null
}

export type Conge = {
  id: string
  employe_id: string
  employe_nom: string
  date_debut: string
  date_fin: string
  type: 'conge' | 'absence' | 'maladie' | 'formation'
  statut: 'demande' | 'valide' | 'refuse'
  notes: string | null
  jours: number  // calculé
}

export const TYPE_CONGE_LABEL: Record<Conge['type'], { label: string; emoji: string }> = {
  conge:     { label: 'Congé payé',    emoji: '🏖️' },
  absence:   { label: 'Absence',        emoji: '✖️' },
  maladie:   { label: 'Maladie',        emoji: '🤒' },
  formation: { label: 'Formation',      emoji: '🎓' },
}

export const STATUT_CONGE_LABEL: Record<Conge['statut'], { label: string; cls: string }> = {
  demande: { label: 'En attente', cls: 'bg-amber-100  text-amber-900  border-amber-300' },
  valide:  { label: 'Validé',     cls: 'bg-emerald-100 text-emerald-900 border-emerald-300' },
  refuse:  { label: 'Refusé',     cls: 'bg-red-100    text-red-900    border-red-300' },
}

// ─── Calculs ────────────────────────────────────────────────────────

/** Heures entre deux HH:MM:SS, gère le passage minuit (fin < début → +24h). */
export function heuresEntre(debut: string, fin: string): number {
  const [hd, md] = debut.split(':').map(Number)
  const [hf, mf] = fin.split(':').map(Number)
  let mins = (hf * 60 + mf) - (hd * 60 + md)
  if (mins < 0) mins += 24 * 60   // service de nuit qui dépasse minuit
  return Math.round((mins / 60) * 100) / 100
}

/** Coût d'un shift = heures * salaire_horaire. */
export function coutShift(debut: string, fin: string, salaire_horaire: number): number {
  const h = heuresEntre(debut, fin)
  return Math.round(h * salaire_horaire * 100) / 100
}

/** Date (YYYY-MM-DD) du lundi de la semaine d'une date — pour grouper les heures
 *  par semaine (les heures sup se calculent à la semaine). */
export function lundiDeLaSemaine(dateStr: string): string {
  const d = new Date(dateStr + 'T12:00:00Z')
  const jour = (d.getUTCDay() + 6) % 7   // 0 = lundi
  d.setUTCDate(d.getUTCDate() - jour)
  return d.toISOString().slice(0, 10)
}

/** Coût d'une semaine de travail avec majoration heures supplémentaires (France) :
 *  - 35 premières heures : taux normal
 *  - de la 36ᵉ à la 43ᵉ (8 h) : +25 %
 *  - au-delà de 43 h : +50 %  */
export function coutSemaineAvecHeuresSup(heuresSemaine: number, salaire_horaire: number): number {
  const h = Math.max(0, heuresSemaine)
  const normales = Math.min(h, 35)
  const sup25 = Math.min(Math.max(h - 35, 0), 8)   // 36 → 43
  const sup50 = Math.max(h - 43, 0)                // > 43
  return normales * salaire_horaire
       + sup25 * salaire_horaire * 1.25
       + sup50 * salaire_horaire * 1.5
}

/** Jours d'un congé (inclusif). */
export function joursConge(debut: string, fin: string): number {
  const d = new Date(debut).getTime()
  const f = new Date(fin).getTime()
  return Math.max(1, Math.round((f - d) / 86400000) + 1)
}

/** Heures supplémentaires détectées sur la semaine = total - (heures_contrat). */
export function heuresSup(totalHeuresSemaine: number, heuresContratHebdo: number): number {
  return Math.max(0, Math.round((totalHeuresSemaine - heuresContratHebdo) * 100) / 100)
}

/** Ratio masse salariale / CA TTC. Renvoie un pct (0-100+). */
export function ratioMasseSalariale(masseSalariale: number, caTTC: number): number {
  if (caTTC <= 0) return 0
  return Math.round((masseSalariale / caTTC) * 1000) / 10  // 1 décimale
}

export function statutMasseSalariale(ratio: number): 'vert' | 'orange' | 'rouge' {
  if (ratio < 30) return 'vert'
  if (ratio <= 35) return 'orange'
  return 'rouge'
}

// ─── Format ─────────────────────────────────────────────────────────
export const fmtPrix = (n: number) =>
  new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n)

export const fmtHeures = (n: number) => {
  const h = Math.floor(n)
  const m = Math.round((n - h) * 60)
  return m === 0 ? `${h}h` : `${h}h${String(m).padStart(2, '0')}`
}

export const fmtDate = (iso: string) => format(parseISO(iso), 'd MMM yyyy', { locale: fr })
export const fmtJour = (iso: string) => format(parseISO(iso), 'EEE d MMM', { locale: fr })

// ─── Semaine planning ───────────────────────────────────────────────
export type JourSemaine = { date: Date; iso: string; label: string }

export function joursDeLaSemaine(refDate: Date): JourSemaine[] {
  const monday = startOfWeek(refDate, { weekStartsOn: 1 })  // lundi
  return Array.from({ length: 7 }, (_, i) => {
    const d = addDays(monday, i)
    return {
      date: d,
      iso: format(d, 'yyyy-MM-dd'),
      label: format(d, 'EEE d MMM', { locale: fr }),
    }
  })
}

export function intervalleMois(refDate: Date): { debut: string; fin: string } {
  return {
    debut: format(startOfMonth(refDate), 'yyyy-MM-dd'),
    fin:   format(endOfMonth(refDate), 'yyyy-MM-dd'),
  }
}
