// GET /api/public/etablissement
// Renvoie les infos vitrine de l'établissement (nom, adresse, tel, horaires)
// pour rendre la page Contact + footer du site web.

import { createClient } from '@/lib/supabase/server'
import { guardPublicRoute, corsHeaders, handleCorsOptions } from '@/lib/public-api/guard'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function OPTIONS(req: Request) { return handleCorsOptions(req) }

export async function GET(req: Request) {
  const guard = await guardPublicRoute(req, 'etablissement', { windowMs: 60_000, max: 120 })
  if (!guard.ok) return guard.response

  const sb = await createClient()
  const { data: params } = await sb.from('parametres')
    .select('cle, valeur')
    .in('cle', [
      'etablissement_nom',
      'etablissement_adresse',
      'etablissement_telephone',
      'etablissement_email',
      'etablissement_siret',
      'etablissement_tva_intra',
      'etablissement_horaires',
      'etablissement_facebook',
      'etablissement_instagram',
      'etablissement_lat',
      'etablissement_lng',
    ])

  const m = new Map<string, string>((params ?? []).map(p => [p.cle as string, (p.valeur as string) ?? '']))

  return Response.json({
    nom: m.get('etablissement_nom') ?? '',
    adresse: m.get('etablissement_adresse') ?? '',
    telephone: m.get('etablissement_telephone') ?? '',
    email: m.get('etablissement_email') ?? '',
    siret: m.get('etablissement_siret') ?? '',
    tva_intra: m.get('etablissement_tva_intra') ?? '',
    horaires: m.get('etablissement_horaires') ?? '',
    facebook: m.get('etablissement_facebook') ?? '',
    instagram: m.get('etablissement_instagram') ?? '',
    coords: {
      lat: Number(m.get('etablissement_lat') ?? 0) || null,
      lng: Number(m.get('etablissement_lng') ?? 0) || null,
    },
  }, {
    headers: {
      ...Object.fromEntries(corsHeaders(req.headers.get('origin'))),
      'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600',
    },
  })
}
