// POST /api/push/unsubscribe — supprime une souscription Web Push (par endpoint).

import { NextResponse, type NextRequest } from 'next/server'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'

const schema = z.object({ endpoint: z.string().url() })

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null)
  const parsed = schema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: 'Body invalide.' }, { status: 400 })
  const supabase = await createClient()
  await supabase.from('push_subscriptions').delete().eq('endpoint', parsed.data.endpoint)
  return NextResponse.json({ ok: true })
}
