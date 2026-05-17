import { createClient } from '@/lib/supabase/server'
import BorneClient from './BorneClient'

export const dynamic = 'force-dynamic'

export default async function BornePage() {
  const supabase = await createClient()

  // Catalogue affiché à la borne : recettes actives, regroupées par catégorie.
  // On filtre sur tag_destination compatible borne (tout sauf BAR par défaut,
  // ajustable selon les besoins).
  const [recettesRes, boissonsRes] = await Promise.all([
    supabase
      .from('recettes')
      .select('id, nom, categorie, tag_destination, prix_vente_ht, image_url, photo_url, favori')
      .eq('actif', true)
      .order('categorie')
      .order('nom'),
    supabase
      .from('boissons')
      .select('id, nom, categorie, prix_vente_ht, image_url, photo_url, favori, tva')
      .eq('actif', true)
      .order('categorie')
      .order('nom'),
  ])

  const recettes = (recettesRes.data ?? []).map(r => ({
    type: 'recette' as const,
    id: r.id as string,
    nom: r.nom as string,
    categorie: (r.categorie as string) ?? 'Autre',
    tag_destination: r.tag_destination as 'CUISINE' | 'SNACKING' | 'PIZZA' | 'BAR',
    prix_vente_ht: Number(r.prix_vente_ht ?? 0),
    image_url: (r.image_url as string) ?? (r.photo_url as string) ?? null,
    favori: r.favori === true,
  }))
  const boissons = (boissonsRes.data ?? []).map(b => ({
    type: 'boisson' as const,
    id: b.id as string,
    nom: b.nom as string,
    categorie: (b.categorie as string) ?? 'Boisson',
    tag_destination: 'BAR' as const,
    prix_vente_ht: Number(b.prix_vente_ht ?? 0),
    image_url: (b.image_url as string) ?? (b.photo_url as string) ?? null,
    favori: b.favori === true,
  }))

  return <BorneClient produits={[...recettes, ...boissons]} />
}
