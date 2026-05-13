// GET /api/public/chambres/dispo?chambre_id=xxx
// Renvoie la liste des plages de dates indisponibles (déjà réservées) sur 12 mois.
// Utilisé par le picker calendrier côté site-restaurant pour bloquer les dates prises.

import { createClient } from '@/lib/supabase/server'
import { guardPublicRoute, corsHeaders, handleCorsOptions } from '@/lib/public-api/guard'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function OPTIONS(req: Request) { return handleCorsOptions(req) }

export async function GET(req: Request) {
  const guard = await guardPublicRoute(req, 'chambres-dispo', { windowMs: 60_000, max: 120 })
  if (!guard.ok) return guard.response

  const cors = corsHeaders(req.headers.get('origin'))
  const url = new URL(req.url)
  const chambreId = url.searchParams.get('chambre_id')
  if (!chambreId) {
    return Response.json({ error: 'chambre_id requis' }, { status: 400, headers: cors })
  }

  const sb = await createClient()
  const today = new Date().toISOString().slice(0, 10)

  const { data, error } = await sb.from('reservations_chambres')
    .select('date_arrivee, date_depart')
    .eq('chambre_id', chambreId)
    .in('statut', ['demande', 'confirmee'])
    .gte('date_depart', today)
    .order('date_arrivee')

  if (error) {
    return Response.json({ error: error.message }, { status: 500, headers: cors })
  }

  const indisponibles = (data ?? []).map(r => ({
    arrivee: r.date_arrivee,
    depart: r.date_depart,
  }))

  return Response.json({
    chambre_id: chambreId,
    indisponibles,
    count: indisponibles.length,
  }, {
    headers: {
      ...Object.fromEntries(cors),
      'Cache-Control': 'public, s-maxage=60',
    },
  })
}
