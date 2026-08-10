import RecettesClient from './RecettesClient'
import { listRecettesAvecIngredients, listIngredientsForPicker } from './actions'
import { getProfile } from '@/lib/auth'
import { isReadOnly, getPosteFilter } from '@/lib/permissions'
import { createClient } from '@/lib/supabase/server'

export const metadata = { title: 'Recettes & food cost — Admin' }
export const dynamic = 'force-dynamic'

export default async function RecettesPage() {
  const profil = await getProfile()
  let readOnly = isReadOnly(profil?.poste, '/admin/recettes', profil?.custom_permissions)
  // Autonomie RH : un employé à qui le gérant a accordé "modifier les recettes"
  // passe outre le verrou lecture-seule de son poste.
  if (readOnly && profil?.role !== 'manager' && profil?.employe_id) {
    const sb = await createClient()
    const { data } = await sb.from('employes').select('autonomie_modif_recettes').eq('id', profil.employe_id).maybeSingle()
    if (data?.autonomie_modif_recettes) readOnly = false
  }
  const filter = getPosteFilter(profil?.poste)
  const tags = filter.recetteTags ?? undefined
  const [recettes, ingredients] = await Promise.all([
    listRecettesAvecIngredients(tags),
    listIngredientsForPicker(),
  ])
  return <RecettesClient initialRecettes={recettes} ingredients={ingredients} readOnly={readOnly} />
}
