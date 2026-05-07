// Module 26 — Page admin /admin/affichage : pilotage TV + QR appel serveur.

import { createClient } from '@/lib/supabase/server'
import AffichageClient from './AffichageClient'
import type { MenuItem, Promo, AppelServeur } from '@/lib/affichage'
import { format } from 'date-fns'

export const metadata = { title: 'Affichage salle — Admin' }
export const dynamic = 'force-dynamic'

export default async function AffichageAdminPage() {
  const supabase = await createClient()
  const today = format(new Date(), 'yyyy-MM-dd')
  const il_y_a_24h = new Date(Date.now() - 86_400_000).toISOString()

  const [menuRes, promosRes, appelsRes, tablesRes] = await Promise.all([
    supabase.from('menu_du_jour').select('*').gte('jour', today).order('jour').order('section').order('ordre'),
    supabase.from('affichage_promos').select('*').order('actif', { ascending: false }).order('ordre'),
    supabase.from('appels_serveur')
      .select('*, pris_par:employes!pris_par_id(prenom, nom)')
      .gte('created_at', il_y_a_24h)
      .order('created_at', { ascending: false }),
    supabase.from('tables_restaurant').select('id, numero, capacite, zone').order('numero'),
  ])

  return (
    <AffichageClient
      menu={(menuRes.data ?? []) as MenuItem[]}
      promos={(promosRes.data ?? []) as Promo[]}
      appels={(appelsRes.data ?? []) as unknown as Array<AppelServeur & { pris_par?: { prenom?: string; nom?: string } | null }>}
      tables={(tablesRes.data ?? []) as Array<{ id: string; numero: string; capacite: number; zone: string }>}
      today={today}
    />
  )
}
