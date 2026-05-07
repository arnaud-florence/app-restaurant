// Module 28 — Middleware : protège /admin/* et rafraîchit la session Supabase.

import { type NextRequest, NextResponse } from 'next/server'
import { updateSession } from '@/lib/supabase/middleware'

export async function middleware(request: NextRequest) {
  const { response, user, supabase } = await updateSession(request)
  const path = request.nextUrl.pathname

  // Protection /admin/* : exige session + rôle manager.
  if (path.startsWith('/admin')) {
    if (!user) {
      const url = request.nextUrl.clone()
      url.pathname = '/login'
      url.searchParams.set('next', path)
      return NextResponse.redirect(url)
    }
    // Vérifie le rôle (lecture profil)
    const { data: profil } = await supabase
      .from('profils')
      .select('role')
      .eq('id', user.id)
      .maybeSingle()
    if (!profil || profil.role !== 'manager') {
      const url = request.nextUrl.clone()
      url.pathname = '/login'
      url.searchParams.set('error', 'role')
      return NextResponse.redirect(url)
    }
  }

  return response
}

// Skip assets statiques et routes API publiques
export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|icon.svg|icon-192.png|icon-512.png|manifest.webmanifest|sw.js|api/assistant/stream|.*\\.(?:png|jpg|jpeg|gif|webp|svg)).*)',
  ],
}
