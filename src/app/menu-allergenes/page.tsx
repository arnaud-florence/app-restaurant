import { createClient } from '@/lib/supabase/server'
import MenuAllergenesClient from './MenuAllergenesClient'
import { allergenesRecette, type Allergene } from '@/lib/allergenes'

export const metadata = {
  title: 'Menu — Allergènes',
  robots: { index: false, follow: false },
}
export const dynamic = 'force-dynamic'

export type PlatPublic = {
  id: string
  nom: string
  categorie: string
  prix_vente_ht: number
  description: string | null
  allergenes: Allergene[]
}

export default async function MenuAllergenesPage() {
  const supabase = await createClient()
  const [recettesRes, paramsRes] = await Promise.all([
    supabase
      .from('recettes')
      .select(`id, nom, categorie, prix_vente_ht, description, allergenes_complementaires,
               recette_ingredients(ingredient:ingredients(allergenes))`)
      .eq('actif', true)
      .order('categorie')
      .order('nom'),
    supabase
      .from('parametres')
      .select('cle, valeur')
      .in('cle', ['etablissement_nom']),
  ])

  type RIRow = { ingredient?: { allergenes?: string[] | null } | null }
  type RecRow = { id: string; nom: string; categorie: string;
    prix_vente_ht: number | string; description: string | null;
    allergenes_complementaires: string[] | null;
    recette_ingredients: RIRow[] | null }

  const plats: PlatPublic[] = ((recettesRes.data ?? []) as RecRow[]).map(r => {
    const ingArrs = (r.recette_ingredients ?? []).map(li => li.ingredient?.allergenes ?? [])
    const compl = (r.allergenes_complementaires ?? []) as Allergene[]
    return {
      id: r.id,
      nom: r.nom,
      categorie: r.categorie,
      prix_vente_ht: Number(r.prix_vente_ht ?? 0),
      description: r.description,
      allergenes: allergenesRecette(ingArrs, compl),
    }
  })

  const nomEtab = paramsRes.data?.find(p => p.cle === 'etablissement_nom')?.valeur ?? 'Notre menu'

  return <MenuAllergenesClient plats={plats} nomEtablissement={nomEtab as string} />
}
