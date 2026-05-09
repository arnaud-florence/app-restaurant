// Vue /emporter — staff dédié aux commandes ONLINE en cours.
// Affiche les commandes source='ONLINE' avec créneau retrait + suivi statut.
// Statuts du flow ONLINE :
//   en_attente → en_preparation → pret_pour_retrait → retire_par_client

import { listCommandesActives } from '../actions'
import EmporterClient from './EmporterClient'
import { getProfile } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'

export const metadata = { title: 'Emporter — Service ONLINE' }
export const dynamic = 'force-dynamic'

export default async function EmporterPage() {
  const supabase = await createClient()
  const commandes = await listCommandesActives()

  const profil = await getProfile()
  const navProfil = profil ? {
    email: profil.email, role: profil.role, poste: profil.poste,
    custom_permissions: profil.custom_permissions,
  } : null

  const employeId = profil?.employe_id ?? null
  let initialDone: string[] = []
  if (employeId) {
    const { data } = await supabase.from('taches_completees')
      .select('tache_id')
      .eq('employe_id', employeId)
      .eq('date', new Date().toISOString().slice(0, 10))
    initialDone = (data ?? []).map(r => r.tache_id as string)
  }

  return (
    <EmporterClient
      initial={commandes}
      navProfil={navProfil}
      widgetEmployeId={employeId}
      widgetInitialDone={initialDone}
    />
  )
}
