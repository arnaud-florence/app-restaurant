import { createClient } from '@/lib/supabase/server'
import BorneClient from './BorneClient'

export const dynamic = 'force-dynamic'

export default async function BornePage() {
  const supabase = await createClient()

  // Catalogue borne : uniquement les recettes actives.
  // Les "boissons" sont stockées comme recettes avec tag_destination='BAR'
  // dans l'app actuelle (cf. ComptoirOrderModal). commande_articles n'a
  // qu'une FK recette_id, donc on ne peut pas vendre une ligne 'boissons'.
  const { data: recettesData } = await supabase
    .from('recettes')
    .select('id, nom, categorie, tag_destination, prix_vente_ht, image_url, photo_url, favori')
    .eq('actif', true)
    .order('categorie')
    .order('nom')

  const produits = (recettesData ?? []).map(r => ({
    type: 'recette' as const,
    id: r.id as string,
    nom: r.nom as string,
    categorie: (r.categorie as string) ?? 'Autre',
    tag_destination: r.tag_destination as 'CUISINE' | 'SNACKING' | 'PIZZA' | 'BAR',
    prix_vente_ht: Number(r.prix_vente_ht ?? 0),
    image_url: (r.image_url as string) ?? (r.photo_url as string) ?? null,
    favori: r.favori === true,
  }))

  return <BorneClient produits={produits} />
}
