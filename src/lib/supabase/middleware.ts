// Module 28 — Helper Supabase Auth pour le middleware Next.js.
// Gère la rotation du cookie session (refresh token).

import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return request.cookies.getAll() },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          response = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options))
        },
      },
    },
  )

  // IMPORTANT : appel obligatoire pour rafraîchir la session avant tout RSC.
  // try/catch : si le refresh token est invalide/expiré (cookies "stale"),
  // getUser() throw une AuthApiError. On traite alors l'user comme non
  // connecté pour ne pas faire crasher le middleware.
  let user = null
  try {
    const { data } = await supabase.auth.getUser()
    user = data.user
  } catch {
    user = null
  }
  return { response, user, supabase }
}
