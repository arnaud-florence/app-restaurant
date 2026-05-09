// GET /api/public/plat-du-jour
// Renvoie les plats du jour ACTIFS aujourd'hui pour le hero du site.

import { createClient } from '@/lib/supabase/server'
import { guardPublicRoute, corsHeaders, handleCorsOptions } from '@/lib/public-api/guard'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function OPTIONS(req: Request) { return handleCorsOptions(req) }

export async function GET(req: Request) {
  const guard = await guardPublicRoute(req, 'plat-du-jour', { windowMs: 60_000, max: 120 })
  if (!guard.ok) return guard.response

  const sb = await createClient()
  const today = new Date().toISOString().slice(0, 10)

  const { data, error } = await sb.from('plats_du_jour')
    .select('*, recette:recettes!recette_id(nom, image_url, prix_vente_ht, tva, vendable_online, description)')
    .eq('actif', true)
    .lte('date_debut', today)
    .or(`date_fin.is.null,date_fin.gte.${today}`)
    .order('ordre')

  if (error) {
    return Response.json({ error: error.message }, { status: 500, headers: corsHeaders(req.headers.get('origin')) })
  }

  type Row = {
    id: string; recette_id: string;
    recette: { nom?: string; image_url?: string | null; prix_vente_ht?: number | string; tva?: number | string;
               vendable_online?: boolean; description?: string | null } | null;
    prix_special: number | string | null;
    description_speciale: string | null;
    ordre: number | string;
  }
  const items = ((data ?? []) as Row[]).map(r => {
    const prix_ht = r.prix_special !== null ? Number(r.prix_special) : Number(r.recette?.prix_vente_ht ?? 0)
    const tva = Number(r.recette?.tva ?? 10)
    return {
      id: r.id,
      recette_id: r.recette_id,
      nom: r.recette?.nom ?? '',
      description: r.description_speciale ?? r.recette?.description ?? '',
      image_url: r.recette?.image_url ?? null,
      prix_ttc: Math.round(prix_ht * (1 + tva / 100) * 100) / 100,
      commandable_online: !!r.recette?.vendable_online,
      ordre: Number(r.ordre ?? 0),
    }
  })

  return Response.json({ items, count: items.length }, {
    headers: {
      ...Object.fromEntries(corsHeaders(req.headers.get('origin'))),
      'Cache-Control': 'public, s-maxage=120, stale-while-revalidate=300',
    },
  })
}
