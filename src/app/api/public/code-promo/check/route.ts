// POST /api/public/code-promo/check
// Body : { code: string, montant_panier_ttc: number, niveau_fidelite_client?: string }
// Renvoie : { valide: boolean, raison?: string, reduction_eur?: number, type?: 'pourcentage'|'euros', valeur?: number }

import { createClient } from '@/lib/supabase/server'
import { guardPublicRoute, corsHeaders, handleCorsOptions } from '@/lib/public-api/guard'
import { z } from 'zod'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function OPTIONS(req: Request) { return handleCorsOptions(req) }

const ORDRE_NIVEAU: Record<string, number> = {
  standard: 0, bronze: 1, argent: 2, or: 3, platine: 4,
}

const schema = z.object({
  code:                       z.string().trim().min(1).max(40),
  montant_panier_ttc:         z.coerce.number().min(0),
  niveau_fidelite_client:     z.string().nullable().optional(),
})

export async function POST(req: Request) {
  const guard = await guardPublicRoute(req, 'code-promo-check', { windowMs: 60_000, max: 60 })
  if (!guard.ok) return guard.response

  let body: unknown
  try { body = await req.json() }
  catch { return Response.json({ error: 'JSON invalide' }, { status: 400, headers: corsHeaders(req.headers.get('origin')) }) }

  const parsed = schema.safeParse(body)
  if (!parsed.success) {
    return Response.json({ error: parsed.error.issues[0].message }, { status: 400, headers: corsHeaders(req.headers.get('origin')) })
  }
  const p = parsed.data
  const code = p.code.toUpperCase()

  const sb = await createClient()
  const { data: cp } = await sb.from('codes_promo')
    .select('*')
    .eq('code', code)
    .maybeSingle()

  if (!cp) {
    return Response.json({ valide: false, raison: 'Code inconnu' }, { headers: corsHeaders(req.headers.get('origin')) })
  }

  if (!cp.actif) {
    return Response.json({ valide: false, raison: 'Code désactivé' }, { headers: corsHeaders(req.headers.get('origin')) })
  }

  const today = new Date().toISOString().slice(0, 10)
  if ((cp.date_debut as string).slice(0, 10) > today) {
    return Response.json({ valide: false, raison: 'Code pas encore actif' }, { headers: corsHeaders(req.headers.get('origin')) })
  }
  if (cp.date_fin && (cp.date_fin as string).slice(0, 10) < today) {
    return Response.json({ valide: false, raison: 'Code expiré' }, { headers: corsHeaders(req.headers.get('origin')) })
  }

  if (cp.usage_max !== null && Number(cp.usage_actuel ?? 0) >= Number(cp.usage_max)) {
    return Response.json({ valide: false, raison: 'Code épuisé' }, { headers: corsHeaders(req.headers.get('origin')) })
  }

  const montantMin = Number(cp.montant_min ?? 0)
  if (montantMin > 0 && p.montant_panier_ttc < montantMin) {
    return Response.json({
      valide: false,
      raison: `Panier minimum ${montantMin.toFixed(2)} € (actuel : ${p.montant_panier_ttc.toFixed(2)} €)`,
    }, { headers: corsHeaders(req.headers.get('origin')) })
  }

  // Niveau fidélité requis ?
  if (cp.reserve_fidelite_niveau) {
    const niveauRequis = ORDRE_NIVEAU[cp.reserve_fidelite_niveau as string] ?? 0
    const niveauClient = ORDRE_NIVEAU[p.niveau_fidelite_client ?? 'standard'] ?? 0
    if (niveauClient < niveauRequis) {
      return Response.json({
        valide: false,
        raison: `Code réservé niveau ${cp.reserve_fidelite_niveau} et plus`,
      }, { headers: corsHeaders(req.headers.get('origin')) })
    }
  }

  // Calcul réduction
  const valeur = Number(cp.valeur)
  let reduction_eur: number
  if (cp.type === 'pourcentage') {
    reduction_eur = Math.round(p.montant_panier_ttc * (valeur / 100) * 100) / 100
  } else {
    reduction_eur = Math.min(valeur, p.montant_panier_ttc)
  }

  return Response.json({
    valide: true,
    code: cp.code,
    type: cp.type,
    valeur,
    reduction_eur,
    description: cp.description,
  }, { headers: corsHeaders(req.headers.get('origin')) })
}
