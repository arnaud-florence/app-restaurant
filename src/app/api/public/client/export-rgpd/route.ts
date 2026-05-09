// GET /api/public/client/export-rgpd
// Renvoie un JSON avec TOUTES les données personnelles du client (RGPD article 20).
// Header : Authorization: Bearer <session.access_token>

import { createAdminClient } from '@/lib/supabase/admin'
import { guardPublicRoute, corsHeaders, handleCorsOptions } from '@/lib/public-api/guard'
import { getAuthUser } from '@/lib/public-api/auth-client'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function OPTIONS(req: Request) { return handleCorsOptions(req) }

export async function GET(req: Request) {
  const guard = await guardPublicRoute(req, 'client-export', { windowMs: 60_000, max: 3 })
  if (!guard.ok) return guard.response

  const cors = corsHeaders(req.headers.get('origin'))

  const auth = await getAuthUser(req)
  if (!auth.ok) return Response.json({ error: auth.reason }, { status: auth.status, headers: cors })

  const sb = createAdminClient()
  const { data: cli } = await sb.from('clients').select('*').eq('auth_user_id', auth.user_id).maybeSingle()
  if (!cli) return Response.json({ error: 'Client introuvable' }, { status: 404, headers: cors })

  const cid = cli.id as string
  const [cmds, mvts, avis, cartes] = await Promise.all([
    sb.from('commandes')
      .select('*, articles:commande_articles(*, recette:recettes(nom))')
      .eq('client_id', cid).order('created_at', { ascending: false }),
    sb.from('mouvements_points').select('*').eq('client_id', cid).order('created_at', { ascending: false }),
    sb.from('avis_publics').select('*').eq('client_id', cid).order('created_at', { ascending: false }),
    sb.from('cartes_cadeaux').select('*').eq('acheteur_client_id', cid).order('created_at', { ascending: false }),
  ])

  const exportData = {
    export_date: new Date().toISOString(),
    rgpd_article: '20 (droit à la portabilité)',
    profile: cli,
    commandes: cmds.data ?? [],
    mouvements_points: mvts.data ?? [],
    avis: avis.data ?? [],
    cartes_cadeaux_achetees: cartes.data ?? [],
  }

  // Format JSON downloadable
  return new Response(JSON.stringify(exportData, null, 2), {
    headers: {
      ...Object.fromEntries(cors),
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Disposition': `attachment; filename="mes-donnees-${new Date().toISOString().slice(0, 10)}.json"`,
    },
  })
}
