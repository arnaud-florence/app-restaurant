import IngredientsClient from './IngredientsClient'
import { listIngredients } from './actions'
import { getProfile } from '@/lib/auth'
import { isReadOnly } from '@/lib/permissions'

export const metadata = { title: 'Ingrédients — Admin' }
export const dynamic = 'force-dynamic'

export default async function IngredientsPage() {
  const profil = await getProfile()
  const readOnly = isReadOnly(profil?.poste, '/admin/ingredients', profil?.custom_permissions)
  const ingredients = await listIngredients()
  return <IngredientsClient initial={ingredients} readOnly={readOnly} />
}
