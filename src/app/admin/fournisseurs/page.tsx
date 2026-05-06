import FournisseursClient from './FournisseursClient'
import { listFournisseurs, listBonsCommande, listFactures, listEntreesPrix } from './actions'
import { listIngredients } from '../ingredients/actions'
import { listRecettesAvecIngredients } from '../recettes/actions'

export const metadata = { title: 'Fournisseurs — Admin' }
export const dynamic = 'force-dynamic'

export default async function FournisseursPage() {
  const [fournisseurs, bons, factures, ingredients, recettes, entrees] = await Promise.all([
    listFournisseurs(),
    listBonsCommande(),
    listFactures(),
    listIngredients(),
    listRecettesAvecIngredients(),
    listEntreesPrix(),
  ])
  return (
    <FournisseursClient
      fournisseurs={fournisseurs}
      bons={bons}
      factures={factures}
      ingredients={ingredients}
      recettes={recettes}
      entreesPrix={entrees}
    />
  )
}
