// GET /api/public/chambres
// Liste des chambres actives avec photos pour la vitrine.

import { createClient } from '@/lib/supabase/server'
import { guardPublicRoute, corsHeaders, handleCorsOptions } from '@/lib/public-api/guard'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function OPTIONS(req: Request) { return handleCorsOptions(req) }

export async function GET(req: Request) {
  const guard = await guardPublicRoute(req, 'chambres', { windowMs: 60_000, max: 120 })
  if (!guard.ok) return guard.response

  const sb = await createClient()
  const { data, error } = await sb.from('chambres')
    .select('id, nom, numero, capacite, prix_nuit_ht, description, equipements, photos, video_360_url')
    .eq('actif', true)
    .order('numero')

  if (error) {
    return Response.json({ error: error.message }, { status: 500, headers: corsHeaders(req.headers.get('origin')) })
  }

  type Row = {
    id: string; nom: string; numero: string;
    capacite: number | string; prix_nuit_ht: number | string;
    description: string | null;
    equipements: string[] | null; photos: string[] | null;
    video_360_url: string | null;
  }
  const items = ((data ?? []) as Row[]).map(c => ({
    id: c.id,
    nom: c.nom,
    numero: c.numero,
    capacite: Number(c.capacite ?? 2),
    prix_nuit_ttc: Math.round(Number(c.prix_nuit_ht) * 1.10 * 100) / 100,
    description: c.description,
    equipements: c.equipements ?? [],
    photos: c.photos ?? [],
    video_360_url: c.video_360_url,
  }))

  return Response.json({ items, count: items.length }, {
    headers: {
      ...Object.fromEntries(corsHeaders(req.headers.get('origin'))),
      'Cache-Control': 'public, s-maxage=120',
    },
  })
}
