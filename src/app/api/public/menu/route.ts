// GET /api/public/menu
// Renvoie TOUTE la carte du restaurant (PIZZA, SNACKING, BAR, CUISINE).
// Inclut un flag `vendable_online` pour chaque item afin que le site distingue :
//   - Items commandables en ligne (vendable_online=true) → click & collect
//   - Items "sur place uniquement" (vendable_online=false) → affichés mais non commandables

import { createClient } from '@/lib/supabase/server'
import { guardPublicRoute, corsHeaders, handleCorsOptions } from '@/lib/public-api/guard'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function OPTIONS(req: Request) { return handleCorsOptions(req) }

export async function GET(req: Request) {
  const guard = await guardPublicRoute(req, 'menu', { windowMs: 60_000, max: 120 })
  if (!guard.ok) return guard.response

  const sb = await createClient()

  // Récupère l'établissement principal pour filtrer ses recettes uniquement
  const { data: etab } = await sb
    .from('etablissements')
    .select('id')
    .eq('is_principal', true)
    .eq('actif', true)
    .single()

  if (!etab?.id) {
    return Response.json({ error: 'Aucun établissement principal configuré' }, { status: 500 })
  }

  const { data, error } = await sb.from('recettes')
    .select(`
      id, nom, categorie, tag_destination, description,
      prix_vente_ht, tva, contient_alcool, vendable_online, image_url,
      recette_ingredients(ingredient:ingredients(allergenes, nom))
    `)
    .eq('actif', true)
    .eq('etablissement_id', etab.id)
    .in('tag_destination', ['SNACKING', 'PIZZA', 'BAR', 'CUISINE'])
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
      prix_ttc: Math.round(Number(r.prix_vente_ht) * (1 + Number(r.tva) / 100) * 100) / 100,
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
