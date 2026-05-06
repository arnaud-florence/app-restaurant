import StockClient from './StockClient'
import { listMouvements } from './actions'
import { listIngredients } from '../ingredients/actions'

export const metadata = { title: 'Stocks — Admin' }
export const dynamic = 'force-dynamic'

export default async function StockPage() {
  const [ingredients, mouvements] = await Promise.all([
    listIngredients(),
    listMouvements(200),
  ])
  return <StockClient ingredients={ingredients} mouvements={mouvements} />
}
