import StockClient from './StockClient'
import AlertesStockCard from './AlertesStockCard'
import { listMouvements } from './actions'
import { listIngredients } from '../ingredients/actions'

export const metadata = { title: 'Stocks — Admin' }
export const dynamic = 'force-dynamic'

export default async function StockPage() {
  const [ingredients, mouvements] = await Promise.all([
    listIngredients(),
    listMouvements(200),
  ])
  return (
    <>
      <div className="max-w-7xl mx-auto px-4 pt-4">
        <AlertesStockCard />
      </div>
      <StockClient ingredients={ingredients} mouvements={mouvements} />
    </>
  )
}
