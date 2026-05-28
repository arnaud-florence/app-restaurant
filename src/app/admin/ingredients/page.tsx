import IngredientsClient from './IngredientsClient'
import { listIngredients } from './actions'
import { getProfile } from '@/lib/auth'
import { isReadOnly, getPosteFilter } from '@/lib/permissions'
import { createClient } from '@/lib/supabase/server'

export const metadata = { title: 'Ingrédients — Admin' }
export const dynamic = 'force-dynamic'

export default async function IngredientsPage() {
  const profil = await getProfile()
  const readOnly = isReadOnly(profil?.poste, '/admin/ingredients', profil?.custom_permissions)
  const filter = getPosteFilter(profil?.poste)
  const ingredients = await listIngredients(filter.recetteTags ?? undefined)

  // Prix d'achat visibles uniquement par le manager OU un employé à qui le gérant
  // a accordé l'autonomie "voir les prix" (interrupteur RH).
  const isManager = profil?.role === 'manager'
  let peutVoirPrix = isManager
  if (!isManager && profil?.employe_id) {
    const sb = await createClient()
    const { data } = await sb.from('employes').select('autonomie_voir_prix').eq('id', profil.employe_id).maybeSingle()
    peutVoirPrix = Boolean(data?.autonomie_voir_prix)
  }

  return <IngredientsClient initial={ingredients} readOnly={readOnly} peutVoirPrix={peutVoirPrix} />
}
