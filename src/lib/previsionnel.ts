// Module 22 — Météo & prévisionnel : régression linéaire,
// suggestions par règles, calcul prévision CA pondérée météo.

import { format, parseISO, addDays, differenceInDays } from 'date-fns'
import { fr } from 'date-fns/locale'

// ─── Types ──────────────────────────────────────────────────────────
export type ConditionMeteo = 'ensoleille' | 'peu_nuageux' | 'nuageux' | 'pluie_legere' | 'pluie_forte' | 'orage' | 'neige' | 'brouillard' | 'autre'

export const CONDITION_INFO: Record<ConditionMeteo, { label: string; emoji: string; impact_ca: number }> = {
  ensoleille:    { label: 'Ensoleillé',    emoji: '☀️', impact_ca: +0.10 },  // +10% CA
  peu_nuageux:   { label: 'Peu nuageux',   emoji: '🌤️', impact_ca: +0.05 },
  nuageux:       { label: 'Nuageux',       emoji: '☁️', impact_ca:  0.00 },
  pluie_legere:  { label: 'Pluie légère',  emoji: '🌦️', impact_ca: -0.05 },
  pluie_forte:   { label: 'Pluie forte',   emoji: '🌧️', impact_ca: -0.20 },
  orage:         { label: 'Orage',         emoji: '⛈️', impact_ca: -0.25 },
  neige:         { label: 'Neige',         emoji: '🌨️', impact_ca: -0.30 },
  brouillard:    { label: 'Brouillard',    emoji: '🌫️', impact_ca: -0.10 },
  autre:         { label: 'Autre',         emoji: '•',  impact_ca:  0.00 },
}

export type ReleveMeteo = {
  id: string
  date_meteo: string
  temperature_min: number | null
  temperature_max: number | null
  conditions: ConditionMeteo
  precipitations_mm: number
  vent_kmh: number
  humidite_pct: number | null
  source: 'manuel' | 'openweathermap' | 'autre'
  est_prevision: boolean
  notes: string | null
}

// ─── Régression linéaire simple (méthode des moindres carrés) ──────
export type Regression = {
  slope: number          // coefficient directeur
  intercept: number      // ordonnée à l'origine
  r2: number             // coefficient de détermination (0 = aucune corrélation, 1 = parfaite)
  n: number              // nb points
}

export function regressionLineaire(points: { x: number; y: number }[]): Regression {
  const n = points.length
  if (n < 3) return { slope: 0, intercept: 0, r2: 0, n }
  const sumX = points.reduce((s, p) => s + p.x, 0)
  const sumY = points.reduce((s, p) => s + p.y, 0)
  const meanX = sumX / n
  const meanY = sumY / n

  let num = 0, den = 0, ssTot = 0, ssRes = 0
  for (const p of points) {
    num += (p.x - meanX) * (p.y - meanY)
    den += (p.x - meanX) ** 2
    ssTot += (p.y - meanY) ** 2
  }
  const slope = den === 0 ? 0 : num / den
  const intercept = meanY - slope * meanX
  for (const p of points) {
    const yPredit = slope * p.x + intercept
    ssRes += (p.y - yPredit) ** 2
  }
  const r2 = ssTot === 0 ? 0 : 1 - ssRes / ssTot
  return { slope, intercept, r2, n }
}

/** Prédit une valeur Y à partir d'un X et d'une régression. */
export function predire(reg: Regression, x: number): number {
  return reg.slope * x + reg.intercept
}

// ─── Prévision CA ──────────────────────────────────────────────────
export type PrevisionJour = {
  date: string
  jour_semaine: number   // 0=dim, 1=lun, ..., 6=sam
  meteo: ConditionMeteo | null
  ca_base: number        // CA moyen pour ce jour de la semaine
  ca_prevision: number   // CA base × (1 + impact_meteo)
  nb_couverts_prevu: number
  panier_moyen: number
  alerte: 'critique' | 'faible' | 'normale' | 'forte' | null
  raison: string
}

/** Calcule le CA moyen par jour de la semaine sur les N dernières semaines. */
export function caMoyenParJourSemaine(historique: { date: string; ca: number }[]): number[] {
  const sums = [0, 0, 0, 0, 0, 0, 0]
  const counts = [0, 0, 0, 0, 0, 0, 0]
  for (const h of historique) {
    const j = parseISO(h.date).getDay()
    sums[j] += h.ca
    counts[j] += 1
  }
  return sums.map((s, i) => counts[i] > 0 ? s / counts[i] : 0)
}

/** Calcule le panier moyen historique. */
export function panierMoyen(historique: { ca: number; nb_commandes: number }[]): number {
  const totalCA = historique.reduce((s, h) => s + h.ca, 0)
  const totalCmd = historique.reduce((s, h) => s + h.nb_commandes, 0)
  return totalCmd > 0 ? totalCA / totalCmd : 0
}

/** Génère une prévision pour les 7 prochains jours. */
export function previsionSemaine(
  historique: { date: string; ca: number; nb_commandes: number }[],
  meteoFuture: { date: string; conditions: ConditionMeteo }[],
  refDate: Date = new Date(),
): PrevisionJour[] {
  const caMoyens = caMoyenParJourSemaine(historique)
  const panier = panierMoyen(historique)

  const out: PrevisionJour[] = []
  for (let i = 0; i < 7; i++) {
    const date = addDays(refDate, i)
    const iso = format(date, 'yyyy-MM-dd')
    const j = date.getDay()
    const ca_base = caMoyens[j]
    const meteo = meteoFuture.find(m => m.date === iso)?.conditions ?? null
    const impact = meteo ? CONDITION_INFO[meteo].impact_ca : 0
    const ca_prevision = Math.round(ca_base * (1 + impact) * 100) / 100
    const nb_couverts = panier > 0 ? Math.round(ca_prevision / panier) : 0

    let alerte: PrevisionJour['alerte'] = null
    let raison = ''
    if (impact <= -0.20) { alerte = 'critique'; raison = `${CONDITION_INFO[meteo!].emoji} ${CONDITION_INFO[meteo!].label} prévu — ${Math.round(impact * 100)}% sur le CA` }
    else if (impact <= -0.10) { alerte = 'faible'; raison = `${CONDITION_INFO[meteo!].emoji} météo défavorable` }
    else if (impact >= +0.10) { alerte = 'forte'; raison = `${CONDITION_INFO[meteo!].emoji} beau temps — opportunité terrasse` }

    out.push({
      date: iso,
      jour_semaine: j,
      meteo, ca_base: Math.round(ca_base * 100) / 100,
      ca_prevision, nb_couverts_prevu: nb_couverts,
      panier_moyen: Math.round(panier * 100) / 100,
      alerte, raison,
    })
  }
  return out
}

// ─── Suggestions par règles ────────────────────────────────────────
export type Suggestion = {
  niveau: 'info' | 'warn' | 'urgent'
  titre: string
  detail: string
}

export function genererSuggestions(prevision: PrevisionJour[]): Suggestion[] {
  const out: Suggestion[] = []

  const joursRouges = prevision.filter(p => p.alerte === 'critique')
  if (joursRouges.length > 0) {
    out.push({
      niveau: 'urgent',
      titre: `🚨 ${joursRouges.length} jour(s) à risque cette semaine`,
      detail: `Réduire les commandes fournisseurs pour ${joursRouges.map(j => format(parseISO(j.date), 'EEE d', { locale: fr })).join(', ')}. Prévoir moins de personnel sur ces shifts.`,
    })
  }

  const joursForts = prevision.filter(p => p.alerte === 'forte')
  if (joursForts.length > 0) {
    out.push({
      niveau: 'info',
      titre: `🌞 ${joursForts.length} jour(s) à fort potentiel`,
      detail: `Préparer la terrasse, prévoir +20% de stock frais, renforcer l'équipe sur ${joursForts.map(j => format(parseISO(j.date), 'EEE d', { locale: fr })).join(', ')}.`,
    })
  }

  const totalCA = prevision.reduce((s, p) => s + p.ca_prevision, 0)
  const totalCAbase = prevision.reduce((s, p) => s + p.ca_base, 0)
  if (totalCAbase > 0) {
    const ecart = ((totalCA - totalCAbase) / totalCAbase) * 100
    if (Math.abs(ecart) > 5) {
      out.push({
        niveau: ecart < -10 ? 'urgent' : 'warn',
        titre: ecart < 0 ? `📉 Semaine prévue ${ecart.toFixed(1)}% sous la moyenne` : `📈 Semaine prévue +${ecart.toFixed(1)}% au-dessus`,
        detail: ecart < 0
          ? `CA prévu ${Math.round(totalCA)}€ vs ${Math.round(totalCAbase)}€ habituellement. Réduire achats périssables.`
          : `CA prévu ${Math.round(totalCA)}€ vs ${Math.round(totalCAbase)}€ habituellement. Bien stocker et anticiper.`,
      })
    }
  }

  const sansMeteo = prevision.filter(p => p.meteo === null).length
  if (sansMeteo > 3) {
    out.push({
      niveau: 'info',
      titre: `🌐 ${sansMeteo} jour(s) sans prévision météo`,
      detail: 'Saisis la météo manuellement ou configure la clé OpenWeatherMap dans /admin/setup pour des prévisions plus fiables.',
    })
  }

  if (out.length === 0) {
    out.push({
      niveau: 'info',
      titre: '✓ Semaine prévisible',
      detail: 'Pas d\'alerte météo majeure. Continuer la saisie quotidienne pour affiner les prévisions.',
    })
  }

  return out
}

// ─── Format ─────────────────────────────────────────────────────────
export const fmtPrix = (n: number) =>
  new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(n)

export const fmtDate = (iso: string) => format(parseISO(iso), 'EEE d MMM', { locale: fr })

export function joursSemaine(refDate: Date = new Date()): string[] {
  return Array.from({ length: 7 }, (_, i) => format(addDays(refDate, i), 'yyyy-MM-dd'))
}
