// POST /api/public/avis
// Soumission d'un avis depuis le site (formulaire post-commande ou page contact).
// Statut initial : 'en_attente' → modération admin obligatoire avant publication.

import { createClient } from '@/lib/supabase/server'
import { guardPublicRoute, corsHeaders, handleCorsOptions } from '@/lib/public-api/guard'
import { isHoneypotFilled, verifyHcaptcha } from '@/lib/public-api/anti-spam'
import { getClientIp } from '@/lib/public-api/rate-limit'
import { getAuthUser, getOrLinkClient } from '@/lib/public-api/auth-client'
import { z } from 'zod'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function OPTIONS(req: Request) { return handleCorsOptions(req) }

const schema = z.object({
  client_id:     z.string().uuid().nullable().optional(),
  commande_id:   z.string().uuid().nullable().optional(),
  note:          z.coerce.number().int().min(1).max(5),
  titre:         z.string().max(200).nullable().optional(),
  contenu:       z.string().max(5000).nullable().optional(),
  langue:        z.string().max(5).default('fr'),
  honeypot:      z.string().nullable().optional(),
  captcha_token: z.string().nullable().optional(),
})

export async function POST(req: Request) {
  const guard = await guardPublicRoute(req, 'avis', { windowMs: 60_000, max: 10 })
  if (!guard.ok) return guard.response

  const cors = corsHeaders(req.headers.get('origin'))

  let body: unknown
  try { body = await req.json() }
  catch { return Response.json({ error: 'JSON invalide' }, { status: 400, headers: cors }) }

  const parsed = schema.safeParse(body)
  if (!parsed.success) {
    return Response.json({ error: parsed.error.issues[0].message }, { status: 400, headers: cors })
  }
  const p = parsed.data

  if (isHoneypotFilled(p as unknown as Record<string, unknown>)) {
    return Response.json({ ok: true, fake: true }, { headers: cors })
  }
  const captcha = await verifyHcaptcha(p.captcha_token, getClientIp(req))
  if (!captcha.ok) {
    return Response.json({ error: captcha.reason }, { status: 400, headers: cors })
  }

  const sb = await createClient()

  // M2 — l'attribution (client_id / commande_id) ne vient JAMAIS du body :
  // on la dérive du token client authentifié. Sinon avis anonyme (null).
  let clientId: string | null = null
  let commandeId: string | null = null
  const authRes = await getAuthUser(req)
  if (authRes.ok) {
    try {
      const { client_id } = await getOrLinkClient(authRes.user_id, authRes.email)
      clientId = client_id
      // commande_id accepté uniquement s'il appartient à ce client
      if (p.commande_id) {
        const { data: cmd } = await sb.from('commandes')
          .select('id').eq('id', p.commande_id).eq('client_id', client_id).maybeSingle()
        if (cmd) commandeId = p.commande_id
      }
    } catch { /* lien client impossible → avis anonyme */ }
  }

  const { data, error } = await sb.from('avis_publics').insert({
    source: 'site',
    note: p.note,
    titre: p.titre || null,
    contenu: p.contenu || null,
    langue: p.langue,
    client_id: clientId,
    commande_id: commandeId,
    statut: 'en_attente',
  }).select('id').single()

  if (error) {
    return Response.json({ error: error.message }, { status: 500, headers: cors })
  }

  return Response.json({ id: data.id, statut: 'en_attente', message: 'Merci, votre avis sera publié après modération.' }, { headers: cors })
}
