import { createClient } from '@/lib/supabase/server'
import BorneClient from './BorneClient'

export const dynamic = 'force-dynamic'

export default async function BornePage() {
  const supabase = await createClient()

  // Catalogue borne : self-service rapide.
  // Inclus :
  //   - SNACKING (sandwichs, salades, frites, tacos, burgers, menus)
  //   - PIZZA (toutes)
  //   - BAR mais UNIQUEMENT categorie='Boissons' (soft, eau, bière, jus, café)
  // Exclus : Vins / Cocktails / Spiritueux / Apéritifs / Digestifs (vente
  // au comptoir avec conseil seulement, pas en self-service).
  // Cuisine traditionnelle (CUISINE) exclue (commandes table uniquement).
  const { data: recettesData } = await supabase
    .from('recettes')
    .select('id, nom, categorie, tag_destination, description, prix_vente_ht, tva, contient_alcool, image_url, photo_url, favori')
    .eq('actif', true)
    .or('tag_destination.in.(SNACKING,PIZZA),and(tag_destination.eq.BAR,categorie.eq.Boissons)')
    .order('categorie')
    .order('nom')

  const produits = (recettesData ?? []).map(r => ({
    type: 'recette' as const,
    id: r.id as string,
    nom: r.nom as string,
    categorie: (r.categorie as string) ?? 'Autre',
    tag_destination: r.tag_destination as 'CUISINE' | 'SNACKING' | 'PIZZA' | 'BAR',
    description: (r.description as string) ?? null,
    prix_vente_ht: Number(r.prix_vente_ht ?? 0),
    tva: Number(r.tva ?? 10),
    contient_alcool: r.contient_alcool === true,
    image_url: (r.image_url as string) ?? (r.photo_url as string) ?? null,
    favori: r.favori === true,
  }))

  return <BorneClient produits={produits} />
}
