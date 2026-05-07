'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import type { ConditionMeteo } from '@/lib/previsionnel'

// ─── Relevés / prévisions météo ────────────────────────────────────

const releveSchema = z.object({
  date_meteo:        z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  temperature_min:   z.number().nullable(),
  temperature_max:   z.number().nullable(),
  conditions:        z.enum(['ensoleille','peu_nuageux','nuageux','pluie_legere','pluie_forte','orage','neige','brouillard','autre']),
  precipitations_mm: z.number().min(0).default(0),
  vent_kmh:          z.number().min(0).default(0),
  humidite_pct:      z.number().int().min(0).max(100).nullable(),
  source:            z.enum(['manuel','openweathermap','autre']).default('manuel'),
  est_prevision:     z.boolean().default(false),
  notes:             z.string().max(500).nullable(),
})

export async function creerReleveMeteo(input: unknown): Promise<{ id: string }> {
  const p = releveSchema.parse(input)
  const supabase = await createClient()

  // Upsert : si même (date, source, est_prevision) existe → update
  const { data: existant } = await supabase
    .from('releves_meteo')
    .select('id')
    .eq('date_meteo', p.date_meteo)
    .eq('source', p.source)
    .eq('est_prevision', p.est_prevision)
    .maybeSingle()

  if (existant) {
    const { error } = await supabase.from('releves_meteo').update(p).eq('id', existant.id)
    if (error) throw new Error(error.message)
    revalidatePath('/admin/previsionnel')
    return { id: existant.id as string }
  }

  const { data, error } = await supabase.from('releves_meteo').insert(p).select('id').single()
  if (error || !data) throw new Error(error?.message ?? 'Erreur')
  revalidatePath('/admin/previsionnel')
  return { id: data.id as string }
}

export async function supprimerReleveMeteo(id: string) {
  if (!id) throw new Error('id manquant')
  const supabase = await createClient()
  const { error } = await supabase.from('releves_meteo').delete().eq('id', id)
  if (error) throw new Error(error.message)
  revalidatePath('/admin/previsionnel')
  return { ok: true as const }
}

// ─── Fetch OpenWeatherMap (server-side) ────────────────────────────

type OWMForecast = {
  list: Array<{
    dt: number
    main: { temp_min: number; temp_max: number; humidity: number }
    weather: Array<{ id: number; main: string; description: string }>
    wind: { speed: number }
    rain?: { '3h'?: number }
    snow?: { '3h'?: number }
    dt_txt: string
  }>
}

function mapOWMCondition(weatherId: number): ConditionMeteo {
  // Codes OpenWeatherMap : https://openweathermap.org/weather-conditions
  if (weatherId >= 200 && weatherId < 300) return 'orage'
  if (weatherId >= 300 && weatherId < 500) return 'pluie_legere'  // bruine
  if (weatherId >= 500 && weatherId < 600) {
    if (weatherId >= 502) return 'pluie_forte'
    return 'pluie_legere'
  }
  if (weatherId >= 600 && weatherId < 700) return 'neige'
  if (weatherId >= 700 && weatherId < 800) return 'brouillard'
  if (weatherId === 800) return 'ensoleille'
  if (weatherId === 801) return 'peu_nuageux'
  if (weatherId >= 802) return 'nuageux'
  return 'autre'
}

export async function importerPrevisionsOWM(): Promise<{ ok: true; nb_jours: number } | { ok: false; raison: string }> {
  const supabase = await createClient()

  // Récupère clé + ville depuis parametres
  const { data: params } = await supabase
    .from('parametres')
    .select('cle, valeur')
    .in('cle', ['openweathermap_api_key', 'meteo_ville'])
  const map = Object.fromEntries((params ?? []).map(p => [p.cle as string, p.valeur as string]))
  const apiKey = map.openweathermap_api_key
  const ville = map.meteo_ville

  if (!apiKey) return { ok: false, raison: 'Clé OpenWeatherMap non configurée. Renseigne `openweathermap_api_key` dans /admin/setup.' }
  if (!ville)  return { ok: false, raison: 'Ville météo non configurée. Renseigne `meteo_ville` dans /admin/setup (ex: "Paris,FR").' }

  const url = `https://api.openweathermap.org/data/2.5/forecast?q=${encodeURIComponent(ville)}&appid=${apiKey}&units=metric&lang=fr`
  let r: Response
  try {
    r = await fetch(url, { signal: AbortSignal.timeout(10000) })
  } catch (e) {
    return { ok: false, raison: `Connexion OpenWeatherMap échouée : ${e instanceof Error ? e.message : 'inconnu'}` }
  }
  if (!r.ok) {
    return { ok: false, raison: `OpenWeatherMap HTTP ${r.status}. Vérifie la clé API et la ville.` }
  }
  const json = await r.json() as OWMForecast

  // Agrège par jour (OWM renvoie 5 jours en 3h-step)
  const parJour = new Map<string, { tempMin: number; tempMax: number; conds: number[]; precip: number; vent: number; humidite: number; cnt: number }>()
  for (const item of json.list) {
    const date = item.dt_txt.slice(0, 10)
    const cur = parJour.get(date) ?? { tempMin: 999, tempMax: -999, conds: [], precip: 0, vent: 0, humidite: 0, cnt: 0 }
    cur.tempMin = Math.min(cur.tempMin, item.main.temp_min)
    cur.tempMax = Math.max(cur.tempMax, item.main.temp_max)
    cur.conds.push(item.weather[0]?.id ?? 800)
    cur.precip += (item.rain?.['3h'] ?? 0) + (item.snow?.['3h'] ?? 0)
    cur.vent = Math.max(cur.vent, (item.wind?.speed ?? 0) * 3.6)  // m/s → km/h
    cur.humidite += item.main.humidity
    cur.cnt += 1
    parJour.set(date, cur)
  }

  // Pour chaque jour, prend la condition modale (la plus fréquente)
  let nb = 0
  for (const [date, agg] of parJour) {
    const condIdMode = agg.conds.sort((a, b) =>
      agg.conds.filter(x => x === a).length - agg.conds.filter(x => x === b).length
    ).pop()!
    const cond = mapOWMCondition(condIdMode)

    // Upsert
    const { data: existant } = await supabase
      .from('releves_meteo')
      .select('id')
      .eq('date_meteo', date)
      .eq('source', 'openweathermap')
      .eq('est_prevision', true)
      .maybeSingle()

    const payload = {
      date_meteo: date,
      temperature_min: Math.round(agg.tempMin * 10) / 10,
      temperature_max: Math.round(agg.tempMax * 10) / 10,
      conditions: cond,
      precipitations_mm: Math.round(agg.precip * 10) / 10,
      vent_kmh: Math.round(agg.vent * 10) / 10,
      humidite_pct: Math.round(agg.humidite / agg.cnt),
      source: 'openweathermap' as const,
      est_prevision: true,
    }

    if (existant) {
      await supabase.from('releves_meteo').update(payload).eq('id', existant.id)
    } else {
      await supabase.from('releves_meteo').insert(payload)
    }
    nb++
  }

  revalidatePath('/admin/previsionnel')
  return { ok: true as const, nb_jours: nb }
}
