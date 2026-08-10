import FournisseursClient from './FournisseursClient'
import { listFournisseurs, listBonsCommande, listFactures, listEntreesPrix } from './actions'
import { listIngredients } from '../ingredients/actions'
import { listRecettesAvecIngredients } from '../recettes/actions'
import { getProfile } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'

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

  const profil = await getProfile()
  const isManager = profil?.role === 'manager'

  // Prix d'achat visibles par le manager OU un employé avec l'autonomie "voir les prix".
  let peutVoirPrix = isManager
  if (!isManager && profil?.employe_id) {
    const sb = await createClient()
    const { data } = await sb.from('employes').select('autonomie_voir_prix').eq('id', profil.employe_id).maybeSingle()
    peutVoirPrix = Boolean(data?.autonomie_voir_prix)
  }

  return (
    <FournisseursClient
      fournisseurs={fournisseurs}
      bons={bons}
      factures={factures}
      ingredients={ingredients}
      recettes={recettes}
      entreesPrix={entrees}
      isManager={isManager}
      peutVoirPrix={peutVoirPrix}
    />
  )
}
