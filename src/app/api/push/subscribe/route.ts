// POST /api/push/subscribe — enregistre une souscription Web Push pour
// l'employé connecté. Le body est l'objet PushSubscription du navigateur.

import { NextResponse, type NextRequest } from 'next/server'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { getProfile } from '@/lib/auth'

const subSchema = z.object({
  endpoint: z.string().url(),
  keys: z.object({
    p256dh: z.string().min(1),
    auth:   z.string().min(1),
  }),
})

export async function POST(req: NextRequest) {
  const profil = await getProfile()
  if (!profil?.employe_id) {
    return NextResponse.json({ error: 'Non connecté ou employé non rattaché.' }, { status: 401 })
  }
  const body = await req.json().catch(() => null)
  const parsed = subSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Body invalide.' }, { status: 400 })
  }
  const userAgent = req.headers.get('user-agent') ?? null
  const supabase = await createClient()
  const { error } = await supabase.from('push_subscriptions').upsert({
    employe_id: profil.employe_id,
    endpoint:   parsed.data.endpoint,
    p256dh:     parsed.data.keys.p256dh,
    auth:       parsed.data.keys.auth,
    user_agent: userAgent,
  }, { onConflict: 'endpoint' })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
