// Module 26 — Page publique TV rotative /affichage/tv

import { createClient } from '@/lib/supabase/server'
import TvClient from './TvClient'
import type { MenuItem, Promo } from '@/lib/affichage'
import { format } from 'date-fns'

export const metadata = { title: 'Affichage TV — Salle' }
export const dynamic = 'force-dynamic'

export default async function TvPage() {
  const supabase = await createClient()
  const today = format(new Date(), 'yyyy-MM-dd')

  const [menuRes, promosRes, meteoRes, evenementsRes, paramsRes] = await Promise.all([
    supabase.from('menu_du_jour').select('*').eq('jour', today).eq('actif', true)
      .order('section').order('ordre'),
    supabase.from('affichage_promos').select('*').eq('actif', true)
      .or(`periode_debut.is.null,periode_debut.lte.${today}`)
      .or(`periode_fin.is.null,periode_fin.gte.${today}`)
      .order('ordre'),
    supabase.from('releves_meteo')
      .select('date_meteo, conditions, temperature_min, temperature_max, est_prevision')
      .gte('date_meteo', today)
      .order('date_meteo')
      .limit(3),
    supabase.from('evenements').select('id, titre, type, date_debut, description')
      .gte('date_debut', today + 'T00:00:00')
      .order('date_debut')
      .limit(3),
    supabase.from('parametres').select('cle, valeur').in('cle', ['nom_restaurant']),
  ])

  const menu     = (menuRes.data ?? []) as MenuItem[]
  const promos   = (promosRes.data ?? []) as Promo[]
  const meteo    = (meteoRes.data ?? []) as Array<{ date_meteo: string; conditions: string; temperature_min: number | null; temperature_max: number | null; est_prevision: boolean }>
  const evenements = (evenementsRes.data ?? []) as Array<{ id: string; titre: string; type: string | null; date_debut: string; description: string | null }>
  const nomResto = (paramsRes.data ?? []).find(p => p.cle === 'nom_restaurant')?.valeur ?? 'Notre Restaurant'

  return <TvClient menu={menu} promos={promos} meteo={meteo} evenements={evenements} nomResto={nomResto} />
}
