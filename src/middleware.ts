// Module 28 v2 — Middleware avec contrôle d'accès par rôle + onboarding.
//
// Règles :
// 1. /admin/* :
//    - non connecté → /login?next=…
//    - connecté manager → OK
//    - connecté employé NON onboardé → /formation/onboarding
//    - connecté employé onboardé → check matrice permissions
// 2. Pages ops (/serveur, /cuisine, /bar, /caisse) + /equipes :
//    - kiosk (non connecté) → OK (mode tablette partagée)
//    - connecté manager → OK
//    - connecté employé NON onboardé → /formation/onboarding
//    - connecté employé onboardé → OK
// 3. /formation/* + /login + / + public kiosk : toujours OK

import { type NextRequest, NextResponse } from 'next/server'
import { updateSession } from '@/lib/supabase/middleware'
import { canAccess, getMainRoute, type CustomPermissions } from '@/lib/permissions'

const OPS_PATHS = ['/serveur', '/cuisine', '/bar', '/caisse', '/equipes']
function isOpsPath(path: string) {
  return OPS_PATHS.some(p => path === p || path.startsWith(p + '/'))
}

export async function middleware(request: NextRequest) {
  const { response, user, supabase } = await updateSession(request)
  const path = request.nextUrl.pathname

  const isAdmin = path.startsWith('/admin')
  const isOps   = isOpsPath(path)

  // Rien à check sur les autres paths (login, formation, public…)
  if (!isAdmin && !isOps) return response

  // Admin + non connecté → login
  if (isAdmin && !user) {
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    url.searchParams.set('next', path)
    return NextResponse.redirect(url)
  }

  // Ops sans session : kiosk, pass-through
  if (isOps && !user) return response

  // À ce point : user connecté, sur admin OR ops.
  // Lit le profil (role + poste + overrides + onboarding).
  const { data: profil } = await supabase
    .from('profils')
    .select('role, poste, custom_permissions, onboarding_completed_at')
    .eq('id', user!.id)
    .maybeSingle()

  // Manager = toujours OK
  if (profil?.role === 'manager') return response

  // Employé NON onboardé → /formation/onboarding (sauf si déjà sur le wizard)
  if (profil && !profil.onboarding_completed_at) {
    const url = request.nextUrl.clone()
    url.pathname = '/formation/onboarding'
    url.search = ''
    return NextResponse.redirect(url)
  }

  // Sur ops : pas de check matrice (un cuisinier peut aller sur /caisse en mode kiosk)
  if (isOps) return response

  // Sur admin : check matrice
  const overrides = (profil?.custom_permissions ?? null) as CustomPermissions | null
  if (canAccess(profil?.poste, path, overrides)) return response

  // Pas le droit → redirect vers la main route du poste
  const url = request.nextUrl.clone()
  const main = getMainRoute(profil?.poste)
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

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|icon.svg|icon-192.png|icon-512.png|manifest.webmanifest|sw.js|api/assistant/stream|.*\\.(?:png|jpg|jpeg|gif|webp|svg)).*)',
  ],
}
