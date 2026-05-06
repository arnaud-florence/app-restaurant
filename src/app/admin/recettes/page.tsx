import RecettesClient from './RecettesClient'
import { listRecettesAvecIngredients, listIngredientsForPicker } from './actions'

export const metadata = { title: 'Recettes & food cost — Admin' }
export const dynamic = 'force-dynamic'

export default async function RecettesPage() {
  const [recettes, ingredients] = await Promise.all([
    listRecettesAvecIngredients(),
    listIngredientsForPicker(),
  ])
  return <RecettesClient initialRecettes={recettes} ingredients={ingredients} />
}
