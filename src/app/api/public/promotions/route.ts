// GET /api/public/promotions
// Renvoie les promotions actives + visibles + dans la période courante,
// LIMITÉES AUX ACTIVITÉS OUVERTES.
//
// Règle de rattachement (migration 0110) :
//   - toute la maison ouverte  → on diffuse tout, y compris les promos non
//     rattachées à un point de vente (`etablissement_id is null`) ;
//   - ouverture partielle      → on n'affiche QUE les promos rattachées à un
//     point de vente actif.
//
// Pourquoi : une promo « globale » est ambiguë. Sans cette règle, le site du
// Fournil affichait « Happy hour 20 % sur les cocktails » alors que le bar
// n'ouvre pas avant fin octobre. Une promo non rattachée décrit presque
// toujours l'activité principale, pas la boulangerie.
//
// ⚠️ Conséquence pour le gérant : pendant la période « Fournil d'abord », une
// promo doit être rattachée au point de vente Fournil pour être diffusée.

import { createClient } from '@/lib/supabase/server'
import { guardPublicRoute, corsHeaders, handleCorsOptions } from '@/lib/public-api/guard'
import { getActivation } from '@/lib/activation/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function OPTIONS(req: Request) { return handleCorsOptions(req) }

export async function GET(req: Request) {
  const guard = await guardPublicRoute(req, 'promotions', { windowMs: 60_000, max: 120 })
  if (!guard.ok) return guard.response

  const sb = await createClient()
  const now = new Date().toISOString()

  const etat = await getActivation()
  const maisonComplete = etat.restaurant_salle && etat.pizzeria && etat.bar

  let query = sb.from('promotions')
    .select('id, titre, description, image_url, cta_label, cta_url, date_debut, date_fin')
    .eq('actif', true)
    .eq('visible_site', true)
    .lte('date_debut', now)
    .or(`date_fin.is.null,date_fin.gte.${now}`)

  if (!maisonComplete) {
    const { data: etabs } = await sb
      .from('etablissements').select('id').eq('actif', true)
    const ids = (etabs ?? []).map(e => e.id as string)
    // Aucun point de vente actif → aucune promo. Le repli ferme, il n'ouvre pas.
    if (ids.length === 0) {
      return Response.json({ items: [], count: 0 }, {
        headers: {
          ...Object.fromEntries(corsHeaders(req.headers.get('origin'))),
          'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=120',
        },
      })
    }
    query = query.in('etablissement_id', ids)
  }

  const { data, error } = await query.order('date_debut', { ascending: false })

  if (error) {
    return Response.json({ error: error.message }, { status: 500, headers: corsHeaders(req.headers.get('origin')) })
  }

  return Response.json({ items: data ?? [], count: (data ?? []).length }, {
    headers: {
      ...Object.fromEntries(corsHeaders(req.headers.get('origin'))),
      'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=120',
    },
  })
}
