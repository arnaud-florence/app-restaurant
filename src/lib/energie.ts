// Module 15 — Helpers énergie : agrégation N vs N-1, alerte +20%,
// coût/plat, suggestions déterministes.

import { format, parseISO, startOfMonth, endOfMonth, subMonths } from 'date-fns'
import { fr } from 'date-fns/locale'

// ─── Types ──────────────────────────────────────────────────────────
export type TypeEnergie = 'electricite' | 'gaz' | 'eau' | 'autre'
export type UniteEnergie = 'kWh' | 'm3' | 'litre' | 'autre'

export const TYPE_ENERGIE_INFO: Record<TypeEnergie, { label: string; emoji: string; uniteDefaut: UniteEnergie; cls: string; cls_solid: string }> = {
  electricite: { label: 'Électricité', emoji: '⚡', uniteDefaut: 'kWh',   cls: 'bg-yellow-100 text-yellow-900 border-yellow-300', cls_solid: '#eab308' },
  gaz:         { label: 'Gaz',         emoji: '🔥', uniteDefaut: 'kWh',   cls: 'bg-orange-100 text-orange-900 border-orange-300', cls_solid: '#f97316' },
  eau:         { label: 'Eau',         emoji: '💧', uniteDefaut: 'm3',    cls: 'bg-cyan-100   text-cyan-900   border-cyan-300',   cls_solid: '#06b6d4' },
  autre:       { label: 'Autre',       emoji: '•',  uniteDefaut: 'autre', cls: 'bg-zinc-100   text-zinc-700   border-zinc-300',   cls_solid: '#71717a' },
}

export const UNITE_LABEL: Record<UniteEnergie, string> = {
  kWh: 'kWh', m3: 'm³', litre: 'L', autre: 'unité',
}

export type ReleveEnergie = {
  id: string
  type: TypeEnergie
  date_releve: string
  periode_debut: string
  periode_fin: string
  consommation: number
  unite: UniteEnergie
  prix_unitaire_ht: number | null
  montant_ht: number
  montant_ttc: number
  fournisseur: string | null
  num_facture: string | null
  notes: string | null
  created_at: string
}

// ─── Agrégation par mois et type ────────────────────────────────────

export type MoisAgrege = {
  mois: string         // YYYY-MM
  libelle: string      // 'mai 2026'
  conso: number
  montant_ttc: number
}

/** Agrège par mois (basé sur periode_debut) pour un type donné. */
export function agregerParMois(releves: ReleveEnergie[], type: TypeEnergie): MoisAgrege[] {
  const m = new Map<string, MoisAgrege>()
  for (const r of releves) {
    if (r.type !== type) continue
    const mois = r.periode_debut.slice(0, 7)
    const cur = m.get(mois) ?? {
      mois, libelle: format(parseISO(r.periode_debut), 'MMM yyyy', { locale: fr }),
      conso: 0, montant_ttc: 0,
    }
    cur.conso += r.consommation
    cur.montant_ttc += r.montant_ttc
    m.set(mois, cur)
  }
  return Array.from(m.values()).sort((a, b) => a.mois.localeCompare(b.mois))
}

// ─── Comparaison N vs N-1 ───────────────────────────────────────────

export type ComparaisonMois = {
  mois_iso: string         // YYYY-MM (mois N)
  libelle: string          // 'mai 2026'
  conso_n: number
  conso_n1: number
  variation_pct: number    // ((N - N-1) / N-1) * 100
  alerte: 'normale' | 'haute' | 'critique'
  montant_n: number
  montant_n1: number
}

/** Pour chaque mois entre debut et fin, compare avec le même mois N-1. */
export function comparerNN1(
  releves: ReleveEnergie[],
  type: TypeEnergie,
  debutN: Date,
  finN: Date,
): ComparaisonMois[] {
  const aggN = agregerParMois(releves, type)
  const m = new Map(aggN.map(x => [x.mois, x]))
  const out: ComparaisonMois[] = []
  let cursor = startOfMonth(debutN)
  const stop = startOfMonth(finN)
  while (cursor <= stop) {
    const moisN = format(cursor, 'yyyy-MM')
    const moisN1 = format(subMonths(cursor, 12), 'yyyy-MM')
    const valN = m.get(moisN)
    const valN1 = m.get(moisN1)
    const consoN  = valN?.conso ?? 0
    const consoN1 = valN1?.conso ?? 0
    const variation = consoN1 > 0 ? Math.round(((consoN - consoN1) / consoN1) * 1000) / 10 : 0
    out.push({
      mois_iso: moisN,
      libelle: format(cursor, 'MMM yyyy', { locale: fr }),
      conso_n: consoN,
      conso_n1: consoN1,
      variation_pct: variation,
      alerte: alerteVariation(variation, consoN1),
      montant_n: valN?.montant_ttc ?? 0,
      montant_n1: valN1?.montant_ttc ?? 0,
    })
    cursor = startOfMonth(subMonths(cursor, -1))  // mois suivant
  }
  return out
}

/** +20% rouge, +10% orange, sinon vert. Si pas de N-1 dispo, vert (pas de comparaison). */
export function alerteVariation(variationPct: number, consoN1: number): 'normale' | 'haute' | 'critique' {
  if (consoN1 <= 0) return 'normale'
  if (variationPct >= 20) return 'critique'
  if (variationPct >= 10) return 'haute'
  return 'normale'
}

export const ALERTE_STYLE: Record<'normale' | 'haute' | 'critique', { cls: string; label: string }> = {
  normale:  { cls: 'bg-emerald-100 text-emerald-900 border-emerald-300', label: 'Normale' },
  haute:    { cls: 'bg-amber-100  text-amber-900  border-amber-300',     label: 'Hausse' },
  critique: { cls: 'bg-red-100    text-red-900    border-red-300',       label: 'Critique' },
}

// ─── Coût énergétique par plat ──────────────────────────────────────

/** sum montant_ttc de tous les relevés du mois / nb plats servis. */
export function coutEnergetiqueParPlat(releves: ReleveEnergie[], moisIso: string, nbPlatsServis: number): number {
  if (nbPlatsServis <= 0) return 0
  const totalEnergie = releves
    .filter(r => r.periode_debut.slice(0, 7) === moisIso)
    .reduce((s, r) => s + r.montant_ttc, 0)
  return Math.round((totalEnergie / nbPlatsServis) * 100) / 100
}

// ─── Suggestions déterministes ──────────────────────────────────────

export type Suggestion = {
  niveau: 'info' | 'warn' | 'urgent'
  titre: string
  detail: string
}

/** Génère des suggestions selon les données du mois courant et l'historique. */
export function genererSuggestions(comparaisons: { type: TypeEnergie; mois: ComparaisonMois | null }[], coutParPlat: number): Suggestion[] {
  const out: Suggestion[] = []

  for (const { type, mois } of comparaisons) {
    const info = TYPE_ENERGIE_INFO[type]
    if (!mois) continue
    if (mois.alerte === 'critique') {
      out.push({
        niveau: 'urgent',
        titre: `${info.emoji} ${info.label} en hausse critique (+${mois.variation_pct.toFixed(1)}%)`,
        detail: `Consommation ${info.label.toLowerCase()} de ${mois.libelle} (${mois.conso_n.toFixed(0)} ${UNITE_LABEL[type === 'eau' ? 'm3' : 'kWh']}) bien au-dessus de N-1 (${mois.conso_n1.toFixed(0)}). Vérifier les équipements (joints, fuites, mise en veille des fours et frigos hors service).`,
      })
    } else if (mois.alerte === 'haute') {
      out.push({
        niveau: 'warn',
        titre: `${info.emoji} ${info.label} en hausse (+${mois.variation_pct.toFixed(1)}%)`,
        detail: `Conso ${info.label.toLowerCase()} légèrement plus élevée que ${mois.libelle} N-1. Surveiller les semaines à venir.`,
      })
    } else if (mois.variation_pct < -10 && mois.conso_n1 > 0) {
      out.push({
        niveau: 'info',
        titre: `${info.emoji} ${info.label} en baisse (${mois.variation_pct.toFixed(1)}%)`,
        detail: `Très bien. Les efforts de sobriété payent — documenter les actions efficaces pour les répliquer.`,
      })
    }
  }

  // Suggestion si coût énergie par plat > 1.50 €
  if (coutParPlat > 1.5) {
    out.push({
      niveau: 'urgent',
      titre: '💸 Coût énergétique par plat élevé',
      detail: `${coutParPlat.toFixed(2)} € par plat servi. Cible secteur < 1.20 €. Audit énergétique à envisager (CCI ou ADEME finance souvent une partie).`,
    })
  } else if (coutParPlat > 1.0) {
    out.push({
      niveau: 'warn',
      titre: '⚠ Coût énergétique par plat à surveiller',
      detail: `${coutParPlat.toFixed(2)} € par plat. Cible < 1.20 €. Vérifier programmation des chambres froides et extinction four entre les services.`,
    })
  }

  // Conseils génériques si pas d'alerte forte
  if (out.length === 0) {
    out.push({
      niveau: 'info',
      titre: '✓ Consommations sous contrôle',
      detail: 'Continuer la saisie mensuelle pour bénéficier de la comparaison annuelle dès que vous aurez 12 mois d\'historique.',
    })
  }

  return out
}

// ─── Format ─────────────────────────────────────────────────────────
export const fmtPrix = (n: number) =>
  new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n)

export const fmtConso = (n: number, unite: UniteEnergie) =>
  `${n.toLocaleString('fr-FR', { maximumFractionDigits: 0 })} ${UNITE_LABEL[unite]}`

export const fmtPct = (n: number) => `${n > 0 ? '+' : ''}${n.toFixed(1)} %`

export const fmtDate = (iso: string) => format(parseISO(iso), 'd MMM yyyy', { locale: fr })

export function intervalleAnneeIso(refDate: Date): { debut: string; fin: string } {
  return {
    debut: format(startOfMonth(subMonths(refDate, 11)), 'yyyy-MM-dd'),
    fin:   format(endOfMonth(refDate), 'yyyy-MM-dd'),
  }
}
