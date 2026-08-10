// Module 25 — Pilotage stratégique : 10 KPIs + analyse saisonnière 12 mois.

import type { SupabaseClient } from '@supabase/supabase-js'
import { startOfMonth, endOfMonth, format, subMonths, subYears } from 'date-fns'
import { fr } from 'date-fns/locale'
import { foodCostMoyenEtAlertes } from './foodCostAgg'
import { lundiDeLaSemaine, coutSemaineAvecHeuresSup } from './rh'

// ─── Types ────────────────────────────────────────────────────────
export type KpiCode =
  | 'ca' | 'marge_brute' | 'food_cost_pct' | 'ratio_masse_sal'
  | 'ticket_moyen' | 'taux_remplissage' | 'nc_ouvertes'
  | 'energie_par_couvert' | 'factures_a_payer' | 'score_satisfaction'

export type KpiUnite = 'eur' | 'pct' | 'nombre' | 'kwh'

export type Statut = 'vert' | 'orange' | 'rouge' | 'neutre'

export type Kpi = {
  code: KpiCode
  label: string
  emoji: string
  valeur: number
  valeur_n1: number | null              // valeur du même mois N-1, null si non disponible
  variation_pct: number | null          // (valeur - n1) / n1 × 100
  unite: KpiUnite
  cible: number | null                  // depuis table objectifs
  statut: Statut                        // vert/orange/rouge selon cible et seuils métier
  cible_atteinte_pct: number | null     // valeur / cible × 100, null si pas de cible
  sens_positif: 'haut' | 'bas'          // 'haut' = plus c'est haut mieux c'est, 'bas' = inverse
}

export type Periode = { mois: string; annee: number; debut: string; fin: string }

export type AnalyseMois = {
  mois: string                          // yyyy-MM
  libelle: string                       // "janv. 2026"
  ca: number
  nb_couverts: number
  ticket_moyen: number
}

const KPI_META: Record<KpiCode, { label: string; emoji: string; unite: KpiUnite; sens: 'haut' | 'bas' }> = {
  ca:                  { label: 'CA mois',                emoji: '💰', unite: 'eur',    sens: 'haut' },
  marge_brute:         { label: 'Marge brute',            emoji: '📈', unite: 'pct',    sens: 'haut' },
  food_cost_pct:       { label: 'Food cost moyen',        emoji: '🍳', unite: 'pct',    sens: 'bas'  },
  ratio_masse_sal:     { label: 'Masse salariale / CA',   emoji: '👥', unite: 'pct',    sens: 'bas'  },
  ticket_moyen:        { label: 'Ticket moyen',           emoji: '🧾', unite: 'eur',    sens: 'haut' },
  taux_remplissage:    { label: 'Taux remplissage',       emoji: '🪑', unite: 'pct',    sens: 'haut' },
  nc_ouvertes:         { label: 'NC ouvertes',            emoji: '⚠️', unite: 'nombre', sens: 'bas'  },
  energie_par_couvert: { label: 'Énergie / couvert',      emoji: '⚡', unite: 'kwh',    sens: 'bas'  },
  factures_a_payer:    { label: 'Factures à payer',       emoji: '📑', unite: 'eur',    sens: 'bas'  },
  score_satisfaction:  { label: 'Score satisfaction',     emoji: '⭐', unite: 'pct',    sens: 'haut' },
}

export const KPI_LABELS: Record<KpiCode, string> = Object.fromEntries(
  (Object.keys(KPI_META) as KpiCode[]).map(k => [k, KPI_META[k].label])
) as Record<KpiCode, string>

// ─── Format ──────────────────────────────────────────────────────
export function formatValeur(valeur: number, unite: KpiUnite): string {
  if (!Number.isFinite(valeur)) return '—'
  switch (unite) {
    case 'eur':    return valeur.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 })
    case 'pct':    return `${valeur.toFixed(1)} %`
    case 'kwh':    return `${valeur.toFixed(2)} kWh`
    case 'nombre': return valeur.toString()
  }
}

// ─── Statut ──────────────────────────────────────────────────────
export function calculerStatut(kpi: Omit<Kpi, 'statut' | 'cible_atteinte_pct'>): Statut {
  if (kpi.cible == null || kpi.cible === 0) {
    // Pas de cible : seuils métier par défaut
    return seuilsParDefaut(kpi.code, kpi.valeur)
  }
  const ratio = kpi.valeur / kpi.cible
  if (kpi.sens_positif === 'haut') {
    if (ratio >= 1)    return 'vert'
    if (ratio >= 0.85) return 'orange'
    return 'rouge'
  } else {
    if (ratio <= 1)    return 'vert'
    if (ratio <= 1.15) return 'orange'
    return 'rouge'
  }
}

function seuilsParDefaut(code: KpiCode, val: number): Statut {
  switch (code) {
    case 'food_cost_pct':       return val < 28 ? 'vert' : val <= 32 ? 'orange' : 'rouge'
    case 'ratio_masse_sal':     return val < 32 ? 'vert' : val <= 35 ? 'orange' : 'rouge'
    case 'marge_brute':         return val > 65 ? 'vert' : val >= 60 ? 'orange' : 'rouge'
    case 'taux_remplissage':    return val > 70 ? 'vert' : val >= 50 ? 'orange' : 'rouge'
    case 'nc_ouvertes':         return val === 0 ? 'vert' : val <= 3 ? 'orange' : 'rouge'
    case 'score_satisfaction':  return val > 90 ? 'vert' : val >= 75 ? 'orange' : 'rouge'
    default: return 'neutre'
  }
}

// ─── Période courante ─────────────────────────────────────────────
export function periodeMoisCourant(refDate = new Date()): Periode {
  return {
    mois: format(refDate, 'yyyy-MM'),
    annee: refDate.getFullYear(),
    debut: format(startOfMonth(refDate), 'yyyy-MM-dd'),
    fin:   format(endOfMonth(refDate), 'yyyy-MM-dd'),
  }
}

// ─── Calcul des 10 KPIs ──────────────────────────────────────────
type Objectif = { kpi: KpiCode; valeur_cible: number }

export async function calculerKPIs(supabase: SupabaseClient, refDate = new Date()): Promise<Kpi[]> {
  const p   = periodeMoisCourant(refDate)
  const pN1 = periodeMoisCourant(subYears(refDate, 1))

  const debut30j = format(subMonths(refDate, 1), 'yyyy-MM-dd')
  const fin30j   = format(refDate, 'yyyy-MM-dd')

  const [
    paiementsRes, paiementsN1Res, commandesRes, commandesN1Res,
    employesRes, pointageRes, recettesRes, ncRes,
    energieRes, facturesRes, reclamationsRes, retoursRes,
    capaciteRes, objectifsRes,
  ] = await Promise.all([
    supabase.from('paiements_caisse').select('montant, encaisse_at').neq('methode', 'fidelite')
      .gte('encaisse_at', p.debut + 'T00:00:00').lte('encaisse_at', p.fin + 'T23:59:59'),
    supabase.from('paiements_caisse').select('montant').neq('methode', 'fidelite')
      .gte('encaisse_at', pN1.debut + 'T00:00:00').lte('encaisse_at', pN1.fin + 'T23:59:59'),
    supabase.from('commandes').select('id', { count: 'exact', head: true })
      .eq('statut', 'encaisse').gte('created_at', p.debut).lte('created_at', p.fin + 'T23:59:59'),
    supabase.from('commandes').select('id', { count: 'exact', head: true })
      .eq('statut', 'encaisse').gte('created_at', pN1.debut).lte('created_at', pN1.fin + 'T23:59:59'),
    supabase.from('employes').select('id, salaire_horaire').eq('actif', true),
    supabase.from('pointage').select('employe_id, date_pointage, heures_travaillees')
      .gte('date_pointage', p.debut).lte('date_pointage', p.fin).not('heures_travaillees', 'is', null),
    foodCostMoyenEtAlertes(supabase),  // food cost calculé au runtime (recettes.food_cost_pct n'existe pas)
    supabase.from('non_conformites').select('id', { count: 'exact', head: true }).eq('statut', 'ouverte'),
    supabase.from('releves_energie').select('consommation, unite, date_releve').gte('date_releve', debut30j).lte('date_releve', fin30j),
    supabase.from('factures_fournisseurs').select('montant_ttc').eq('statut', 'a_payer'),
    supabase.from('reclamations').select('id', { count: 'exact', head: true })
      .gte('date_reclamation', debut30j).lte('date_reclamation', fin30j),
    supabase.from('retours_plats').select('id', { count: 'exact', head: true })
      .gte('date_retour', debut30j).lte('date_retour', fin30j),
    supabase.from('tables_restaurant').select('capacite'),
    supabase.from('objectifs').select('kpi, valeur_cible')
      .eq('periode', 'mensuel').eq('mois', p.mois).eq('annee', p.annee),
  ])

  // ─── Données dérivées ─────────────────────────────────────────
  const ca   = (paiementsRes.data ?? []).reduce((s, x) => s + Number(x.montant ?? 0), 0)
  const caN1 = (paiementsN1Res.data ?? []).reduce((s, x) => s + Number(x.montant ?? 0), 0)
  const nbC   = commandesRes.count ?? 0
  const nbCN1 = commandesN1Res.count ?? 0

  // Masse salariale = heures pointées × salaire_horaire, AVEC majoration heures sup
  // (35h normal · 36-43h +25% · >43h +50%), calculée par semaine et par employé.
  const tauxParId = new Map((employesRes.data ?? []).map(e => [e.id as string, Number(e.salaire_horaire ?? 0)]))
  const heuresParEmpSem = new Map<string, Map<string, number>>()  // empId → lundiSemaine → heures
  for (const pt of (pointageRes.data ?? [])) {
    const empId = pt.employe_id as string
    const h = Number(pt.heures_travaillees ?? 0)
    if (h <= 0) continue
    const sem = lundiDeLaSemaine(pt.date_pointage as string)
    let m = heuresParEmpSem.get(empId)
    if (!m) { m = new Map(); heuresParEmpSem.set(empId, m) }
    m.set(sem, (m.get(sem) ?? 0) + h)
  }
  let masseSalariale = 0
  for (const [empId, parSem] of heuresParEmpSem) {
    const rate = tauxParId.get(empId) ?? 0
    for (const hSem of parSem.values()) masseSalariale += coutSemaineAvecHeuresSup(hSem, rate)
  }

  // recettesRes = résultat de foodCostMoyenEtAlertes (food cost calculé runtime)
  const foodCostMoyen = recettesRes.moyen
  const margeBrute = foodCostMoyen > 0 ? 100 - foodCostMoyen : 0

  // Somme uniquement des relevés en kWh (élec/gaz). m3/litre exclus du KPI "énergie/couvert".
  const conso = (energieRes.data ?? [])
    .filter(r => r.unite === 'kWh')
    .reduce((s, r) => s + Number(r.consommation ?? 0), 0)
  const energieParCouvert = nbC > 0 ? conso / nbC : 0

  const facturesAPayer = (facturesRes.data ?? []).reduce((s, f) => s + Number(f.montant_ttc ?? 0), 0)

  // Capacité max approchée : capacité totale × ~26 jours × 2 services
  const capaciteUnit = (capaciteRes.data ?? []).reduce((s, t) => s + Number(t.capacite ?? 0), 0)
  const capaciteMois = capaciteUnit * 26 * 2
  const tauxRemplissage = capaciteMois > 0 ? (nbC / capaciteMois) * 100 : 0

  // Score satisfaction = 100 − (5 × nb_reclamations) − (2 × nb_retours), borné [0,100]
  const nbRec = reclamationsRes.count ?? 0
  const nbRet = retoursRes.count ?? 0
  const score = Math.max(0, Math.min(100, 100 - 5 * nbRec - 2 * nbRet))

  const objectifsMap = new Map((objectifsRes.data ?? []).map(o => [o.kpi as KpiCode, Number(o.valeur_cible)]))

  // ─── Construction des 10 KPIs ─────────────────────────────────
  const ticketMoyen   = nbC   > 0 ? ca   / nbC   : 0
  const ticketMoyenN1 = nbCN1 > 0 ? caN1 / nbCN1 : 0
  const ratioMasse    = ca    > 0 ? (masseSalariale / ca) * 100 : 0

  const raw: Array<Omit<Kpi, 'statut' | 'cible_atteinte_pct' | 'label' | 'emoji' | 'unite' | 'sens_positif'>> = [
    { code: 'ca',                  valeur: round2(ca),               valeur_n1: round2(caN1),         variation_pct: variation(ca, caN1),                 cible: objectifsMap.get('ca') ?? null },
    { code: 'marge_brute',         valeur: round1(margeBrute),       valeur_n1: null,                  variation_pct: null,                                cible: objectifsMap.get('marge_brute') ?? null },
    { code: 'food_cost_pct',       valeur: round1(foodCostMoyen),    valeur_n1: null,                  variation_pct: null,                                cible: objectifsMap.get('food_cost_pct') ?? null },
    { code: 'ratio_masse_sal',     valeur: round1(ratioMasse),       valeur_n1: null,                  variation_pct: null,                                cible: objectifsMap.get('ratio_masse_sal') ?? null },
    { code: 'ticket_moyen',        valeur: round2(ticketMoyen),      valeur_n1: round2(ticketMoyenN1), variation_pct: variation(ticketMoyen, ticketMoyenN1), cible: objectifsMap.get('ticket_moyen') ?? null },
    { code: 'taux_remplissage',    valeur: round1(tauxRemplissage),  valeur_n1: null,                  variation_pct: null,                                cible: objectifsMap.get('taux_remplissage') ?? null },
    { code: 'nc_ouvertes',         valeur: ncRes.count ?? 0,         valeur_n1: null,                  variation_pct: null,                                cible: objectifsMap.get('nc_ouvertes') ?? null },
    { code: 'energie_par_couvert', valeur: round2(energieParCouvert),valeur_n1: null,                  variation_pct: null,                                cible: objectifsMap.get('energie_par_couvert') ?? null },
    { code: 'factures_a_payer',    valeur: round2(facturesAPayer),   valeur_n1: null,                  variation_pct: null,                                cible: objectifsMap.get('factures_a_payer') ?? null },
    { code: 'score_satisfaction',  valeur: score,                    valeur_n1: null,                  variation_pct: null,                                cible: objectifsMap.get('score_satisfaction') ?? null },
  ]

  return raw.map(r => {
    const meta = KPI_META[r.code]
    const partial = {
      ...r,
      label: meta.label, emoji: meta.emoji, unite: meta.unite, sens_positif: meta.sens,
    }
    const statut = calculerStatut(partial)
    const cible_atteinte_pct = r.cible != null && r.cible !== 0 ? round1((r.valeur / r.cible) * 100) : null
    return { ...partial, statut, cible_atteinte_pct }
  })
}

// ─── Analyse saisonnière 12 mois ──────────────────────────────────
export async function calculerSaisonnier(supabase: SupabaseClient, refDate = new Date()): Promise<AnalyseMois[]> {
  const debut = format(startOfMonth(subMonths(refDate, 11)), 'yyyy-MM-dd')
  const fin   = format(endOfMonth(refDate), 'yyyy-MM-dd')

  const [paiRes, cmdRes] = await Promise.all([
    supabase.from('paiements_caisse').select('montant, encaisse_at').neq('methode', 'fidelite')
      .gte('encaisse_at', debut + 'T00:00:00').lte('encaisse_at', fin + 'T23:59:59'),
    supabase.from('commandes').select('id, created_at').eq('statut', 'encaisse')
      .gte('created_at', debut).lte('created_at', fin + 'T23:59:59'),
  ])

  const buckets = new Map<string, { ca: number; nb: number }>()
  for (let i = 11; i >= 0; i--) {
    const d = subMonths(refDate, i)
    buckets.set(format(d, 'yyyy-MM'), { ca: 0, nb: 0 })
  }
  for (const p of (paiRes.data ?? [])) {
    const k = String(p.encaisse_at).slice(0, 7)
    const b = buckets.get(k); if (b) b.ca += Number(p.montant ?? 0)
  }
  for (const c of (cmdRes.data ?? [])) {
    const k = String(c.created_at).slice(0, 7)
    const b = buckets.get(k); if (b) b.nb += 1
  }

  return [...buckets.entries()].map(([mois, b]) => ({
    mois,
    libelle: format(new Date(mois + '-01'), 'MMM yyyy', { locale: fr }),
    ca: round2(b.ca),
    nb_couverts: b.nb,
    ticket_moyen: b.nb > 0 ? round2(b.ca / b.nb) : 0,
  }))
}

// ─── Helpers ──────────────────────────────────────────────────────
const round1 = (n: number) => Math.round(n * 10) / 10
const round2 = (n: number) => Math.round(n * 100) / 100
function variation(courant: number, n1: number): number | null {
  if (!n1) return null
  return round1(((courant - n1) / n1) * 100)
}
