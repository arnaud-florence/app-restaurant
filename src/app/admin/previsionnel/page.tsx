import { createClient } from '@/lib/supabase/server'
import PrevisionnelClient from './PrevisionnelClient'
import {
  type ReleveMeteo, type ConditionMeteo,
  previsionSemaine, regressionLineaire, genererSuggestions, joursSemaine,
  CONDITION_INFO,
} from '@/lib/previsionnel'

export const metadata = { title: 'Prévisionnel — Admin' }
export const dynamic = 'force-dynamic'

export type DataPrevisionnel = {
  releves: ReleveMeteo[]
  prevision: ReturnType<typeof previsionSemaine>
  regression: ReturnType<typeof regressionLineaire>
  suggestions: ReturnType<typeof genererSuggestions>
  historique: { date: string; ca: number; nb_commandes: number }[]
  hasOWMKey: boolean
  ville: string | null
}

export default async function PrevisionnelPage() {
  const supabase = await createClient()
  const today = new Date()

  // 1. Charge relevés des 90 derniers jours + 7 jours futurs
  const debut = new Date(today.getTime() - 90 * 86400000).toISOString().slice(0, 10)
  const fin = new Date(today.getTime() + 14 * 86400000).toISOString().slice(0, 10)

  const [relevesRes, paiementsRes, paramRes] = await Promise.all([
    supabase.from('releves_meteo')
      .select('*')
      .gte('date_meteo', debut)
      .lte('date_meteo', fin)
      .order('date_meteo'),
    supabase.from('paiements_caisse')
      .select('montant, encaisse_at, commande_id')
      .gte('encaisse_at', debut + 'T00:00:00')
      .lte('encaisse_at', new Date().toISOString()),
    supabase.from('parametres').select('cle, valeur').in('cle', ['openweathermap_api_key','meteo_ville']),
  ])

  type ReleveRow = { id: string; date_meteo: string; temperature_min: number | string | null;
    temperature_max: number | string | null; conditions: string;
    precipitations_mm: number | string | null; vent_kmh: number | string | null;
    humidite_pct: number | null; source: string; est_prevision: boolean; notes: string | null }
  const releves: ReleveMeteo[] = ((relevesRes.data ?? []) as ReleveRow[]).map(r => ({
    id: r.id, date_meteo: r.date_meteo,
    temperature_min: r.temperature_min != null ? Number(r.temperature_min) : null,
    temperature_max: r.temperature_max != null ? Number(r.temperature_max) : null,
    conditions: r.conditions as ConditionMeteo,
    precipitations_mm: Number(r.precipitations_mm ?? 0),
    vent_kmh: Number(r.vent_kmh ?? 0),
    humidite_pct: r.humidite_pct,
    source: r.source as 'manuel' | 'openweathermap' | 'autre',
    est_prevision: r.est_prevision,
    notes: r.notes,
  }))

  // 2. Construit l'historique CA par jour (pour la régression)
  type PaieRow = { montant: number | string; encaisse_at: string; commande_id: string }
  const paiements = (paiementsRes.data ?? []) as PaieRow[]
  const historiqueMap = new Map<string, { ca: number; commandes: Set<string> }>()
  for (const p of paiements) {
    const date = p.encaisse_at.slice(0, 10)
    const cur = historiqueMap.get(date) ?? { ca: 0, commandes: new Set<string>() }
    cur.ca += Number(p.montant ?? 0)
    cur.commandes.add(p.commande_id)
    historiqueMap.set(date, cur)
  }
  const historique = Array.from(historiqueMap.entries())
    .map(([date, v]) => ({ date, ca: Math.round(v.ca * 100) / 100, nb_commandes: v.commandes.size }))
    .sort((a, b) => a.date.localeCompare(b.date))

  // 3. Régression : impact_ca (X) vs CA constaté (Y) sur jours passés avec relevé
  const points: { x: number; y: number }[] = []
  const releveByDate = new Map(releves.filter(r => !r.est_prevision).map(r => [r.date_meteo, r]))
  for (const h of historique) {
    const m = releveByDate.get(h.date)
    if (m) {
      points.push({ x: CONDITION_INFO[m.conditions].impact_ca, y: h.ca })
    }
  }
  const regression = regressionLineaire(points)

  // 4. Génère prévision 7j en utilisant les forecasts (est_prevision=true)
  const semaineIso = joursSemaine(today)
  const meteoFuture = releves
    .filter(r => r.est_prevision && semaineIso.includes(r.date_meteo))
    .map(r => ({ date: r.date_meteo, conditions: r.conditions }))
  const prevision = previsionSemaine(historique, meteoFuture, today)

  // 5. Suggestions
  const suggestions = genererSuggestions(prevision)

  const params = Object.fromEntries((paramRes.data ?? []).map(p => [p.cle as string, p.valeur as string]))
  const hasOWMKey = !!params.openweathermap_api_key
  const ville = params.meteo_ville ?? null

  return (
    <PrevisionnelClient
      data={{ releves, prevision, regression, suggestions, historique, hasOWMKey, ville }}
    />
  )
}
