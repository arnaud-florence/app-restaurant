import { createClient } from '@/lib/supabase/server'
import AllergenesClient from './AllergenesClient'
import { allergenesRecette, type Allergene, type ProcedureUrgence, type TypeProcedureUrgence } from '@/lib/allergenes'
import { getProfile } from '@/lib/auth'
import { isReadOnly, getPosteFilter } from '@/lib/permissions'

export const metadata = { title: 'Allergènes & traçabilité — Admin' }
export const dynamic = 'force-dynamic'

export type RecetteAllergenes = {
  id: string
  nom: string
  categorie: string
  tag_destination: 'CUISINE' | 'SNACKING' | 'PIZZA' | 'BAR'
  allergenes_calcules: Allergene[]      // depuis ingrédients
  allergenes_complementaires: Allergene[]  // override manuel
  allergenes_finaux: Allergene[]        // union des deux
  ingredients_avec_allergenes: Array<{ nom: string; allergenes: string[] }>
}

export default async function AllergenesPage() {
  const supabase = await createClient()
  const profil = await getProfile()
  const readOnly = isReadOnly(profil?.poste, '/admin/allergenes', profil?.custom_permissions)

  const filter = getPosteFilter(profil?.poste)

  let recettesQuery = supabase
    .from('recettes')
    .select(`id, nom, categorie, tag_destination, allergenes_complementaires,
             recette_ingredients(ingredient:ingredients(nom, allergenes))`)
    .eq('actif', true)
  if (filter.recetteTags && filter.recetteTags.length > 0) {
    recettesQuery = recettesQuery.in('tag_destination', filter.recetteTags)
  }

  const [recettesRes, procRes] = await Promise.all([
    recettesQuery.order('categorie').order('nom'),
    supabase
      .from('procedures_urgence')
      .select('id, titre, type, etapes, contacts, ordre, actif')
      .eq('actif', true)
      .order('type')
      .order('ordre'),
  ])

  type RIRow = { ingredient?: { nom?: string; allergenes?: string[] | null } | null }
  type RecRow = { id: string; nom: string; categorie: string; tag_destination: string;
    allergenes_complementaires: string[] | null;
    recette_ingredients: RIRow[] | null }

  const recettes: RecetteAllergenes[] = ((recettesRes.data ?? []) as RecRow[]).map(r => {
    const ingArrs = (r.recette_ingredients ?? [])
      .map(li => li.ingredient?.allergenes ?? [])
    const ingDetails = (r.recette_ingredients ?? [])
      .map(li => ({ nom: li.ingredient?.nom ?? '— inconnu —', allergenes: li.ingredient?.allergenes ?? [] }))
      .filter(x => x.nom !== '— inconnu —')
    const compl = (r.allergenes_complementaires ?? []) as Allergene[]
    const calc = allergenesRecette(ingArrs, [])         // sans complementaires
    const fin  = allergenesRecette(ingArrs, compl)      // avec complementaires
    return {
      id: r.id,
      nom: r.nom,
      categorie: r.categorie,
      tag_destination: r.tag_destination as 'CUISINE' | 'SNACKING' | 'PIZZA' | 'BAR',
      allergenes_calcules: calc,
      allergenes_complementaires: compl.filter(a => !calc.includes(a)),
      allergenes_finaux: fin,
      ingredients_avec_allergenes: ingDetails,
    }
  })

  type ProcRow = { id: string; titre: string; type: string; etapes: string[] | null;
    contacts: string | null; ordre: number; actif: boolean }
  const procedures: ProcedureUrgence[] = ((procRes.data ?? []) as ProcRow[]).map(p => ({
    id: p.id, titre: p.titre,
    type: p.type as TypeProcedureUrgence,
    etapes: p.etapes ?? [],
    contacts: p.contacts,
    ordre: Number(p.ordre ?? 0),
    actif: Boolean(p.actif),
  }))

  return <AllergenesClient recettes={recettes} procedures={procedures} readOnly={readOnly} />
}
