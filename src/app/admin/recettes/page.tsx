import RecettesClient from './RecettesClient'
import { listRecettesAvecIngredients, listIngredientsForPicker } from './actions'
import { getProfile } from '@/lib/auth'
import { isReadOnly } from '@/lib/permissions'

export const metadata = { title: 'Recettes & food cost — Admin' }
export const dynamic = 'force-dynamic'

export default async function RecettesPage() {
  const profil = await getProfile()
  const readOnly = isReadOnly(profil?.poste, '/admin/recettes', profil?.custom_permissions)
  const [recettes, ingredients] = await Promise.all([
    listRecettesAvecIngredients(),
    listIngredientsForPicker(),
  ])
  return <RecettesClient initialRecettes={recettes} ingredients={ingredients} readOnly={readOnly} />
}
