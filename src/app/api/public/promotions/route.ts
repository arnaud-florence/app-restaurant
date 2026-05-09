// GET /api/public/promotions
// Renvoie les promotions actives + visibles + dans la période courante.

import { createClient } from '@/lib/supabase/server'
import { guardPublicRoute, corsHeaders, handleCorsOptions } from '@/lib/public-api/guard'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function OPTIONS(req: Request) { return handleCorsOptions(req) }

export async function GET(req: Request) {
  const guard = await guardPublicRoute(req, 'promotions', { windowMs: 60_000, max: 120 })
  if (!guard.ok) return guard.response

  const sb = await createClient()
  const now = new Date().toISOString()

  const { data, error } = await sb.from('promotions')
    .select('id, titre, description, image_url, cta_label, cta_url, date_debut, date_fin')
    .eq('actif', true)
    .eq('visible_site', true)
    .lte('date_debut', now)
    .or(`date_fin.is.null,date_fin.gte.${now}`)
    .order('date_debut', { ascending: false })

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
