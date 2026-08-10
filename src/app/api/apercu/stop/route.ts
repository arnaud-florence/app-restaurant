// Quitte le mode « aperçu employé » : supprime le cookie. Toujours autorisé
// (on ne fait que retirer un cookie de prévisualisation), redirige vers l'admin.

import { NextRequest, NextResponse } from 'next/server'
import { APERCU_COOKIE } from '@/lib/auth'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const dest = new URL('/mon-espace', req.nextUrl.origin)
  const res = NextResponse.redirect(dest)
  res.cookies.delete(APERCU_COOKIE)
  return res
}
