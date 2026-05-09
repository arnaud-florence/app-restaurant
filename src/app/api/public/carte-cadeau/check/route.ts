// POST /api/public/carte-cadeau/check
// Body : { code }
// Renvoie : { valide, solde_eur?, raison? }

import { createClient } from '@/lib/supabase/server'
import { guardPublicRoute, corsHeaders, handleCorsOptions } from '@/lib/public-api/guard'
import { z } from 'zod'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function OPTIONS(req: Request) { return handleCorsOptions(req) }

const schema = z.object({
  code: z.string().trim().min(1).max(40),
})

export async function POST(req: Request) {
  const guard = await guardPublicRoute(req, 'carte-cadeau-check', { windowMs: 60_000, max: 30 })
  if (!guard.ok) return guard.response

  const cors = corsHeaders(req.headers.get('origin'))

  let body: unknown
  try { body = await req.json() }
  catch { return Response.json({ error: 'JSON invalide' }, { status: 400, headers: cors }) }

  const parsed = schema.safeParse(body)
  if (!parsed.success) {
    return Response.json({ error: parsed.error.issues[0].message }, { status: 400, headers: cors })
  }

  const sb = await createClient()
  const { data: cc } = await sb.from('cartes_cadeaux')
    .select('code, montant_restant, statut, date_validite_fin')
    .eq('code', parsed.data.code.toUpperCase())
    .maybeSingle()

  if (!cc) {
    return Response.json({ valide: false, raison: 'Code inconnu' }, { headers: cors })
  }
  if (cc.statut !== 'active') {
    return Response.json({ valide: false, raison: `Carte ${cc.statut}` }, { headers: cors })
  }
  if (cc.date_validite_fin && new Date(cc.date_validite_fin as string) < new Date()) {
    return Response.json({ valide: false, raison: 'Carte expirée' }, { headers: cors })
  }
  const solde = Number(cc.montant_restant)
  if (solde <= 0) {
    return Response.json({ valide: false, raison: 'Solde épuisé' }, { headers: cors })
  }

  return Response.json({
    valide: true,
    code: cc.code,
    solde_eur: solde,
  }, { headers: cors })
}
