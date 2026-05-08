import BoissonsClient from './BoissonsClient'
import { listBoissons } from './actions'
import { createClient } from '@/lib/supabase/server'
import { getProfile } from '@/lib/auth'
import { isReadOnly } from '@/lib/permissions'

export const metadata = { title: 'Carte des vins & boissons — Admin' }
export const dynamic = 'force-dynamic'

export default async function BoissonsPage() {
  const supabase = await createClient()
  const profil = await getProfile()
  const readOnly = isReadOnly(profil?.poste, '/admin/boissons', profil?.custom_permissions)

  const [boissons, recettesRes, accordsRes] = await Promise.all([
    listBoissons(),
    supabase
      .from('recettes')
      .select('id, nom, categorie, tag_destination')
      .eq('actif', true)
      .order('nom'),
    supabase
      .from('accords_mets_boissons')
      .select('boisson_id, recette_id, note'),
  ])

  const recettes = (recettesRes.data ?? []).map(r => ({
    id: r.id as string,
    nom: r.nom as string,
    categorie: r.categorie as string,
    tag_destination: r.tag_destination as string,
  }))

  // Index accords par boisson_id pour passage rapide au client
  const accordsParBoisson: Record<string, { recette_id: string; note: string | null }[]> = {}
  for (const a of accordsRes.data ?? []) {
    const k = a.boisson_id as string
    if (!accordsParBoisson[k]) accordsParBoisson[k] = []
    accordsParBoisson[k].push({ recette_id: a.recette_id as string, note: (a.note as string) ?? null })
  }

  return (
    <BoissonsClient
      boissons={boissons}
      recettes={recettes}
      accordsParBoisson={accordsParBoisson}
      readOnly={readOnly}
    />
  )
}
