// Module 28 — Page /login : email + password + 2FA TOTP optionnel.

import LoginClient from './LoginClient'
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'

export const metadata = { title: 'Connexion' }
export const dynamic = 'force-dynamic'

/** L'utilisateur vient d'arriver depuis une URL admin sans être connecté.
 *  On respecte son `next` SAUF s'il pointe vers une vieille home (/admin tout court
 *  ou /admin/pilotage) — dans ces cas on force /admin/cat (la nouvelle page d'accueil).
 *  Permet à un user qui ciblait /admin/stock par bookmark d'y retourner direct,
 *  tout en ignorant les anciens raccourcis vers la home pilotage.
 */
function normalizeNext(next: string | undefined): string {
  if (!next) return '/admin/cat'
  if (next === '/admin' || next === '/admin/pilotage' || next === '/admin/pilotage/') return '/admin/cat'
  return next
}

export default async function LoginPage({ searchParams }: { searchParams: { next?: string; error?: string } }) {
  const target = normalizeNext(searchParams.next)

  // Si déjà connecté avec rôle manager, on redirige
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (user) {
    const { data: profil } = await supabase.from('profils').select('role').eq('id', user.id).maybeSingle()
    if (profil?.role === 'manager') redirect(target)
  }

  // Compte le nombre de managers pour afficher le bandeau "1ère installation"
  const { count: nbManagers } = await supabase.from('profils').select('id', { count: 'exact', head: true }).eq('role', 'manager')

  return <LoginClient
    nextUrl={target}
    error={searchParams.error ?? null}
    nbManagers={nbManagers ?? 0}
  />
}
