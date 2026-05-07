// Module 28 v2 — Middleware avec contrôle d'accès par rôle.
//
// /admin/* :
//   - non connecté → /login?next=…
//   - connecté manager → toujours OK
//   - connecté employe → check matrice permissions (poste). Si pas le droit,
//     redirect vers la main route de son poste (ex cuisinier qui tape /admin/finances
//     est renvoyé sur /cuisine).
//
// Pages ops (/serveur, /cuisine, /bar, /caisse) restent accessibles sans login (mode kiosk).

import { type NextRequest, NextResponse } from 'next/server'
import { updateSession } from '@/lib/supabase/middleware'
import { canAccess, getMainRoute, type CustomPermissions } from '@/lib/permissions'

export async function middleware(request: NextRequest) {
  const { response, user, supabase } = await updateSession(request)
  const path = request.nextUrl.pathname

  if (path.startsWith('/admin')) {
    if (!user) {
      const url = request.nextUrl.clone()
      url.pathname = '/login'
      url.searchParams.set('next', path)
      return NextResponse.redirect(url)
    }

    // Lit le profil (role + poste + overrides)
    const { data: profil } = await supabase
      .from('profils')
      .select('role, poste, custom_permissions')
      .eq('id', user.id)
      .maybeSingle()

    // Manager = passe-droit
    if (profil?.role === 'manager') return response

    // Employé : check matrice
    const overrides = (profil?.custom_permissions ?? null) as CustomPermissions | null
    if (canAccess(profil?.poste, path, overrides)) {
      return response
    }

    // Pas le droit → redirect vers la main route du poste (ex: cuisinier sur /admin/finances → /cuisine)
    const url = request.nextUrl.clone()
    const main = getMainRoute(profil?.poste)
    // Évite la boucle de redirection si la main route elle-même n'existe pas (cas edge 'autre')
    if (main.startsWith(path) || path === main) {
      url.pathname = '/login'
      url.searchParams.set('error', 'role')
    } else {
      const [pathname, search] = main.split('?')
      url.pathname = pathname
      url.search = search ? '?' + search : ''
    }
    return NextResponse.redirect(url)
  }

  return response
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|icon.svg|icon-192.png|icon-512.png|manifest.webmanifest|sw.js|api/assistant/stream|.*\\.(?:png|jpg|jpeg|gif|webp|svg)).*)',
  ],
}
