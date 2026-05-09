// API GET /api/notifications — liste les notifs de l'utilisateur connecté.
// API POST /api/notifications/read — marque toutes les notifs comme lues.

import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getProfile } from '@/lib/auth'
import { listerMesNotifications, compterNonLues } from '@/lib/notifications'

export async function GET(req: NextRequest) {
  const profil = await getProfile()
  if (!profil?.employe_id) return NextResponse.json({ notifications: [], non_lues: 0 })

  const [notifs, nb] = await Promise.all([
    listerMesNotifications(profil.employe_id, profil.role, Number(req.nextUrl.searchParams.get('limit') ?? 20)),
    compterNonLues(profil.employe_id, profil.role),
  ])
  return NextResponse.json({ notifications: notifs, non_lues: nb })
}

export async function POST(_req: NextRequest) {
  const profil = await getProfile()
  if (!profil?.employe_id) return NextResponse.json({ ok: false }, { status: 401 })
  const sb = await createClient()

  // Marque toutes ses notifs comme lues
  if (profil.role === 'manager') {
    await sb.from('notifications')
      .update({ lu: true })
      .or(`destinataire_employe_id.eq.${profil.employe_id},destinataire_employe_id.is.null`)
      .eq('lu', false)
  } else {
    await sb.from('notifications')
      .update({ lu: true })
      .eq('destinataire_employe_id', profil.employe_id)
      .eq('lu', false)
  }
  return NextResponse.json({ ok: true })
}
