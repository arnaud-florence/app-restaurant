// POST /api/push/test  (mode diagnostic)
//   Auth : Authorization: Bearer ${CRON_SECRET}
//
// Pour chaque abonnement de l'employé visé, envoie un push directement et renvoie
// le statut HTTP retourné par le service push (Apple / Google) → permet de savoir
// si la notif est ACCEPTÉE (201/200) ou refusée (404/410) sans masquer l'erreur.

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import webpush from 'web-push'

export const dynamic = 'force-dynamic'

export async function POST(req: Request) {
  const auth = req.headers.get('authorization') ?? ''
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const pub  = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
  const priv = process.env.VAPID_PRIVATE_KEY
  const subj = process.env.VAPID_SUBJECT
  if (!pub || !priv || !subj) {
    return NextResponse.json({ error: 'VAPID env manquantes', pub: !!pub, priv: !!priv, subj: !!subj }, { status: 500 })
  }
  webpush.setVapidDetails(subj, pub, priv)

  const body = await req.json().catch(() => ({})) as {
    employe_id?: string; titre?: string; body?: string; url?: string
  }

  const supabase = await createClient()
  let employe_id = body.employe_id ?? null
  if (!employe_id) {
    const { data: sub } = await supabase.from('push_subscriptions')
      .select('employe_id').limit(1).maybeSingle()
    employe_id = sub?.employe_id ?? null
  }
  if (!employe_id) return NextResponse.json({ error: 'aucune subscription en base' }, { status: 404 })

  const { data: subs } = await supabase.from('push_subscriptions')
    .select('endpoint, p256dh, auth, user_agent, created_at')
    .eq('employe_id', employe_id)
  if (!subs?.length) return NextResponse.json({ error: 'aucune sub pour cet employé' }, { status: 404 })

  const payload = JSON.stringify({
    title: body.titre ?? '🧪 Test push CASATASIA',
    body:  body.body  ?? 'Si tu lis ça, les notifications fonctionnent ✅',
    url:   body.url   ?? '/',
    tag:   'test-' + Date.now(),
  })

  const results = await Promise.all(subs.map(async (s) => {
    const sub = { endpoint: s.endpoint as string, keys: { p256dh: s.p256dh as string, auth: s.auth as string } }
    try {
      const r = await webpush.sendNotification(sub, payload)
      return {
        endpoint: (s.endpoint as string).slice(0, 50) + '…',
        ua: ((s.user_agent ?? '') as string).slice(0, 40),
        created: (s.created_at as string)?.slice(0, 10),
        statusCode: r.statusCode,
        headers: r.headers,
        ok: r.statusCode >= 200 && r.statusCode < 300,
      }
    } catch (e: unknown) {
      const err = e as { statusCode?: number; body?: string; message?: string }
      return {
        endpoint: (s.endpoint as string).slice(0, 50) + '…',
        ua: ((s.user_agent ?? '') as string).slice(0, 40),
        created: (s.created_at as string)?.slice(0, 10),
        statusCode: err.statusCode ?? null,
        error: err.body ?? err.message ?? 'unknown',
        ok: false,
      }
    }
  }))

  return NextResponse.json({ employe_id, count: results.length, results })
}
