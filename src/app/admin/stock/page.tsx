import Link from 'next/link'
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
      <div className="max-w-7xl mx-auto px-4 pt-4 space-y-3">
        {/* Le stock du FOURNIL (produits finis, achat-revente) se compte sur
            /inventaire — cette page-ci est le stock INGRÉDIENTS du restaurant
            (Module 7, composition des recettes). Le gérant a cherché son
            comptage hebdo ici : ce pont est la réponse. */}
        <Link href="/inventaire"
          className="block rounded-xl border-2 border-emerald-600 bg-emerald-50 px-5 py-4 hover:bg-emerald-100 transition-colors">
          <p className="text-base font-black text-emerald-900">
            📦 Inventaire du Fournil — compter le stock de la semaine →
          </p>
          <p className="text-sm text-emerald-800 mt-0.5">
            Croissants, pains, boissons… produit par produit, avec la valeur du
            stock en euros. C&apos;est là que se fait le comptage hebdomadaire.
          </p>
          <p className="text-xs text-emerald-700/80 mt-1.5">
            La page ci-dessous est le stock <b>ingrédients</b> (farine, beurre…),
            utile au restaurant à partir d&apos;octobre.
          </p>
        </Link>
        <AlertesStockCard />
      </div>
      <StockClient ingredients={ingredients} mouvements={mouvements} />
    </>
  )
}
