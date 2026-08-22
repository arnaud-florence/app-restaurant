// GET /api/public/menu
// Renvoie la carte publique, LIMITÉE AUX ACTIVITÉS OUVERTES.
// Inclut un flag `vendable_online` pour chaque item afin que le site distingue :
//   - Items commandables en ligne (vendable_online=true) → click & collect
//   - Items "sur place uniquement" (vendable_online=false) → affichés mais non commandables
//
// Filtrage d'activité (migration 0110) : le filtre porte sur `tag_destination`,
// PAS uniquement sur le point de vente. C'est indispensable — les recettes
// historiques du restaurant ont `etablissement_id = NULL` et passeraient donc
// à travers un filtre par point de vente. Tant que le module 'pizzeria' est
// éteint, aucune recette PIZZA ne sort d'ici, rattachée ou non.

import { createClient } from '@/lib/supabase/server'
import { guardPublicRoute, corsHeaders, handleCorsOptions } from '@/lib/public-api/guard'
import { tauxTvaVente } from '@/lib/tva'
import { getActivation } from '@/lib/activation/server'
import { tagsActifs } from '@/lib/activation/config'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function OPTIONS(req: Request) { return handleCorsOptions(req) }

export async function GET(req: Request) {
  const guard = await guardPublicRoute(req, 'menu', { windowMs: 60_000, max: 120 })
  if (!guard.ok) return guard.response

  const sb = await createClient()

  // Tags autorisés = ceux des modules allumés. Si tout est éteint, on renvoie
  // une carte vide plutôt que la carte complète — le repli doit fermer, pas ouvrir.
  const etat = await getActivation()
  const tags = tagsActifs(etat)
  if (tags.length === 0) {
    return Response.json({ items: [], count: 0 }, {
      headers: {
        ...Object.fromEntries(corsHeaders(req.headers.get('origin'))),
        'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=120',
      },
    })
  }

  // Carte en ligne = produits des points de vente du CA principal (Restauration,
  // Bar, Snack, Fournil). FDJ/tabac/colis sont exclus (hors CA, pas de recettes).
  // On inclut aussi les recettes legacy non rattachées (etablissement_id NULL) —
  // elles restent bornées par le filtre de tags ci-dessus.
  const { data: etabs } = await sb
    .from('etablissements')
    .select('id')
    .eq('inclus_ca_principal', true)
    .eq('actif', true)
  const etabIds = (etabs ?? []).map(e => e.id as string)

  let query = sb.from('recettes')
    .select(`
      id, nom, categorie, tag_destination, description,
      prix_vente_ht, tva, contient_alcool, vendable_online, image_url,
      recette_ingredients(ingredient:ingredients(allergenes, nom))
    `)
    .eq('actif', true)
    .in('tag_destination', tags)
    // ─── Barrière de présentabilité ────────────────────────────────
    // Le miroir caisse (0122) crée des produits bruts (« Mario »,
    // « Pago 20cl », « Formule — boisson »…) en catégorie « À classer »,
    // sans visuel. Ils servaient le rapprochement des tickets — et
    // fuyaient sur la carte publique : 22 produits sans image sous un
    // intitulé « À classer » visible des clients.
    // Règle simple et définitive : RIEN ne paraît au public sans
    // catégorie réelle ET sans visuel. Classer un produit dans l'admin et
    // lui donner une image suffit à le publier — rien d'autre à faire.
    .not('image_url', 'is', null)
    .neq('categorie', 'À classer')

  if (etabIds.length > 0) {
    query = query.or(`etablissement_id.in.(${etabIds.join(',')}),etablissement_id.is.null`)
  }

  const { data, error } = await query
    .order('tag_destination')
    .order('categorie')
    .order('nom')

  if (error) {
    return Response.json({ error: error.message }, { status: 500, headers: corsHeaders(req.headers.get('origin')) })
  }

  type Row = {
    id: string; nom: string; categorie: string;
    tag_destination: string; description: string | null;
    prix_vente_ht: number | string; tva: number | string;
    contient_alcool: boolean; vendable_online: boolean; image_url: string | null;
    recette_ingredients: Array<{ ingredient: { allergenes: string[] | null; nom: string } | null }> | null;
  }

  const items = ((data ?? []) as unknown as Row[]).map(r => {
    const allergenes = new Set<string>()
    for (const li of r.recette_ingredients ?? []) {
      for (const a of li.ingredient?.allergenes ?? []) allergenes.add(a)
    }
    return {
      id: r.id,
      nom: r.nom,
      categorie: r.categorie,
      tag: r.tag_destination,
      description: r.description ?? '',
      // TTC au taux porté par le produit (cf. tauxTvaVente) : c'est le prix du
      // panneau en boutique. La route de commande applique le même taux, donc
      // prix affiché = prix payé, et le site est aligné sur le comptoir.
      prix_ttc: Math.round(Number(r.prix_vente_ht) * (1 + tauxTvaVente(r, 'emporter') / 100) * 100) / 100,
      contient_alcool: r.contient_alcool,
      vendable_online: r.vendable_online,
      image_url: r.image_url,
      allergenes: Array.from(allergenes).sort(),
    }
  })

  return Response.json(
    { items, count: items.length },
    {
      headers: {
        ...Object.fromEntries(corsHeaders(req.headers.get('origin'))),
        'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=120',
      },
    },
  )
}
