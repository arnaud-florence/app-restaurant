// Module 10 — Marketing dashboard
// Génération posts IA pour Instagram/Facebook/GMB + calendrier éditorial.

import { createClient } from '@/lib/supabase/server'
import MarketingClient from './MarketingClient'

export const metadata = { title: 'Marketing — Admin' }
export const dynamic = 'force-dynamic'

export type PostMarketing = {
  id: string
  type: 'post' | 'story' | 'reel' | 'annonce_gmb'
  canal: 'instagram' | 'facebook' | 'google_my_business' | 'linkedin' | 'tiktok' | 'autre'
  titre: string | null
  contenu: string
  hashtags: string[]
  image_url: string | null
  call_to_action: string | null
  cta_url: string | null
  recette_id: string | null
  evenement_id: string | null
  promotion_id: string | null
  statut: 'brouillon' | 'prevu' | 'publie' | 'rejete' | 'archive'
  date_programmee: string | null
  date_publication: string | null
  genere_par_ia: boolean
  url_publication: string | null
  nb_likes: number
  created_at: string
}

export default async function MarketingPage() {
  const sb = await createClient()
  const [postsRes, recettesRes, evtsRes] = await Promise.all([
    sb.from('posts_marketing')
      .select('*')
      .order('statut')
      .order('date_programmee', { ascending: false, nullsFirst: false })
      .limit(100),
    sb.from('recettes')
      .select('id, nom, image_url, prix_vente_ht, tag_destination')
      .eq('actif', true)
      .eq('vendable_online', true)
      .order('nom'),
    sb.from('evenements')
      .select('id, nom, type, date_evenement')
      .gte('date_evenement', new Date().toISOString().slice(0, 10))
      .order('date_evenement')
      .limit(20),
  ])

  type Row = {
    id: string;
    type: PostMarketing['type']; canal: PostMarketing['canal'];
    titre: string | null; contenu: string;
    hashtags: string[] | null; image_url: string | null;
    call_to_action: string | null; cta_url: string | null;
    recette_id: string | null; evenement_id: string | null; promotion_id: string | null;
    statut: PostMarketing['statut'];
    date_programmee: string | null; date_publication: string | null;
    genere_par_ia: boolean; url_publication: string | null;
    nb_likes: number | string;
    created_at: string;
  }
  const posts: PostMarketing[] = ((postsRes.data ?? []) as Row[]).map(r => ({
    id: r.id,
    type: r.type, canal: r.canal,
    titre: r.titre, contenu: r.contenu,
    hashtags: r.hashtags ?? [], image_url: r.image_url,
    call_to_action: r.call_to_action, cta_url: r.cta_url,
    recette_id: r.recette_id, evenement_id: r.evenement_id, promotion_id: r.promotion_id,
    statut: r.statut,
    date_programmee: r.date_programmee, date_publication: r.date_publication,
    genere_par_ia: r.genere_par_ia, url_publication: r.url_publication,
    nb_likes: Number(r.nb_likes ?? 0),
    created_at: r.created_at,
  }))

  const recettes = (recettesRes.data ?? []).map(r => ({
    id: r.id as string, nom: r.nom as string,
    image_url: (r.image_url as string) ?? null,
    prix_vente_ht: Number(r.prix_vente_ht ?? 0),
    tag_destination: r.tag_destination as string,
  }))

  const evenements = (evtsRes.data ?? []).map(e => ({
    id: e.id as string, nom: e.nom as string,
    type: (e.type as string) ?? '',
    date_evenement: e.date_evenement as string,
  }))

  return <MarketingClient posts={posts} recettes={recettes} evenements={evenements} />
}
