import IngredientsClient from './IngredientsClient'
import { listIngredients } from './actions'

export const metadata = { title: 'Ingrédients — Admin' }
export const dynamic = 'force-dynamic'

export default async function IngredientsPage() {
  const ingredients = await listIngredients()
  return <IngredientsClient initial={ingredients} />
}
