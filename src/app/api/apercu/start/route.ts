// Active le mode « aperçu employé » : pose le cookie qui fait afficher la nav
// et les pages du salarié visé. RÉSERVÉ au gérant (vérifié via getProfile, dont
// le rôle reste manager). N'altère jamais les droits réels du gérant.

import { NextRequest, NextResponse } from 'next/server'
import { getProfile, APERCU_COOKIE } from '@/lib/auth'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const dest = new URL('/mon-espace', req.nextUrl.origin)
  const profil = await getProfile()
  const emp = req.nextUrl.searchParams.get('emp')
  const res = NextResponse.redirect(dest)
  // Seul un gérant peut prévisualiser, et seulement un id employé fourni.
  if (profil?.role === 'manager' && emp) {
    res.cookies.set(APERCU_COOKIE, emp, {
      httpOnly: true, sameSite: 'lax', path: '/', maxAge: 60 * 60 * 4, // 4 h
    })
  }
  return res
}
