// Pizza : poste séparé de la cuisine.
// Réutilise CuisineClient avec role='pizzaiolo' (filtre tag_destination='PIZZA').

import CuisineClient from '../cuisine/CuisineClient'
import { listCommandesActives } from '../actions'
import { getProfile } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'

export const metadata = { title: 'Pizza — Service' }
export const dynamic = 'force-dynamic'

export default async function PizzaPage() {
  const commandes = await listCommandesActives()
  const profil = await getProfile()

  const navProfil = profil ? {
    email: profil.email, role: profil.role, poste: profil.poste,
    custom_permissions: profil.custom_permissions,
  } : null

  const employeId = profil?.employe_id ?? null
  let initialDone: string[] = []
  if (employeId) {
    const supabase = await createClient()
    const { data } = await supabase.from('taches_completees')
      .select('tache_id')
      .eq('employe_id', employeId)
      .eq('date', new Date().toISOString().slice(0, 10))
    initialDone = (data ?? []).map(r => r.tache_id as string)
  }

  return (
    <CuisineClient
      initial={commandes}
      role="pizzaiolo"
      widgetPoste="pizzaiolo"
      navProfil={navProfil}
      widgetEmployeId={employeId}
      widgetInitialDone={initialDone}
    />
  )
}
