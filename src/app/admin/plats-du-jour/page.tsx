// Module Plats du jour — sélection admin des plats mis en avant sur le site (outil 2).
// Lecture des recettes vendable_online uniquement (ces plats apparaitront en hero du site).

import { createClient } from '@/lib/supabase/server'
import PlatsDuJourClient from './PlatsDuJourClient'

export const metadata = { title: 'Plats du jour — Admin' }
export const dynamic = 'force-dynamic'

export type RecetteOnline = {
  id: string
  nom: string
  categorie: string
  prix_vente_ht: number
  image_url: string | null
  vendable_online: boolean   // info pour distinguer dans le sélecteur (commandable ou juste info)
}

export type PlatDuJour = {
  id: string
  recette_id: string
  recette_nom: string
  recette_image_url: string | null
  recette_prix_ht: number
  recette_vendable_online: boolean
  date_debut: string
  date_fin: string | null
  prix_special: number | null
  description_speciale: string | null
  ordre: number
  actif: boolean
  created_at: string
}

export default async function PlatsDuJourPage() {
  const sb = await createClient()

  const [platsRes, recettesRes] = await Promise.all([
    sb.from('plats_du_jour')
      .select('*, recette:recettes!recette_id(nom, image_url, prix_vente_ht, vendable_online)')
      .order('ordre')
      .order('date_debut', { ascending: false }),
    // Toutes les recettes actives — le plat du jour peut être 'sur place uniquement'
    // (info sur le site sans bouton Commander) OU vendable_online (= bouton Commander).
    sb.from('recettes')
      .select('id, nom, categorie, prix_vente_ht, image_url, vendable_online')
      .eq('actif', true)
      .order('vendable_online', { ascending: false })   // online en haut
      .order('categorie')
      .order('nom'),
  ])

  type PlatRow = {
    id: string; recette_id: string;
    recette: { nom?: string; image_url?: string | null; prix_vente_ht?: number | string; vendable_online?: boolean } | null;
    date_debut: string; date_fin: string | null;
    prix_special: number | string | null;
    description_speciale: string | null;
    ordre: number | string; actif: boolean;
    created_at: string;
  }
  const plats: PlatDuJour[] = ((platsRes.data ?? []) as PlatRow[]).map(p => ({
    id: p.id,
    recette_id: p.recette_id,
    recette_nom: p.recette?.nom ?? '— recette supprimée —',
    recette_image_url: p.recette?.image_url ?? null,
    recette_prix_ht: Number(p.recette?.prix_vente_ht ?? 0),
    recette_vendable_online: !!p.recette?.vendable_online,
    date_debut: p.date_debut,
    date_fin: p.date_fin ?? null,
    prix_special: p.prix_special !== null ? Number(p.prix_special) : null,
    description_speciale: p.description_speciale,
    ordre: Number(p.ordre ?? 0),
    actif: p.actif,
    created_at: p.created_at,
  }))

  const recettes: RecetteOnline[] = (recettesRes.data ?? []).map(r => ({
    id: r.id as string,
    nom: r.nom as string,
    categorie: r.categorie as string,
    prix_vente_ht: Number(r.prix_vente_ht ?? 0),
    image_url: (r.image_url as string) ?? null,
    vendable_online: !!r.vendable_online,
  }))

  return <PlatsDuJourClient plats={plats} recettes={recettes} />
}
