// GET /api/public/menu
// Renvoie la carte vendable_online (snacking + pizza + bar) pour le site web.
// Filtres : actif=true + vendable_online=true. Joint les allergènes via ingrédients.

import { createClient } from '@/lib/supabase/server'
import { guardPublicRoute, corsHeaders, handleCorsOptions } from '@/lib/public-api/guard'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function OPTIONS(req: Request) { return handleCorsOptions(req) }

export async function GET(req: Request) {
  const guard = await guardPublicRoute(req, 'menu', { windowMs: 60_000, max: 120 })
  if (!guard.ok) return guard.response

  const sb = await createClient()
  const { data, error } = await sb.from('recettes')
    .select(`
      id, nom, categorie, tag_destination, description,
      prix_vente_ht, tva, contient_alcool, image_url,
      recette_ingredients(ingredient:ingredients(allergenes, nom))
    `)
    .eq('vendable_online', true)
    .eq('actif', true)
    .in('tag_destination', ['SNACKING', 'PIZZA', 'BAR'])    // pas CUISINE (resto sur place)
    .order('categorie')
    .order('nom')

  if (error) {
    return Response.json({ error: error.message }, { status: 500, headers: corsHeaders(req.headers.get('origin')) })
  }

  type Row = {
    id: string; nom: string; categorie: string;
    tag_destination: string; description: string | null;
    prix_vente_ht: number | string; tva: number | string;
    contient_alcool: boolean; image_url: string | null;
    recette_ingredients: Array<{ ingredient: { allergenes: string[] | null; nom: string } | null }> | null;
  }

  const items = ((data ?? []) as unknown as Row[]).map(r => {
    // Allergènes agrégés depuis ingrédients
    const allergenes = new Set<string>()
    for (const li of r.recette_ingredients ?? []) {
      for (const a of li.ingredient?.allergenes ?? []) allergenes.add(a)
    }
    return {
      id: r.id,
      nom: r.nom,
      categorie: r.categorie,
      tag: r.tag_destination,                        // SNACKING / PIZZA / BAR
      description: r.description ?? '',
      prix_ttc: Math.round(Number(r.prix_vente_ht) * (1 + Number(r.tva) / 100) * 100) / 100,
      contient_alcool: r.contient_alcool,
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
