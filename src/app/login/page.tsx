// Module 28 — Page /login : email + password + 2FA TOTP optionnel.

import LoginClient from './LoginClient'
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'

export const metadata = { title: 'Connexion' }
export const dynamic = 'force-dynamic'

export default async function LoginPage({ searchParams }: { searchParams: { next?: string; error?: string } }) {
  // Si déjà connecté avec rôle manager, on redirige
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (user) {
    const { data: profil } = await supabase.from('profils').select('role').eq('id', user.id).maybeSingle()
    if (profil?.role === 'manager') redirect(searchParams.next || '/admin/cat')
  }

  // Compte le nombre de managers pour afficher le bandeau "1ère installation"
  const { count: nbManagers } = await supabase.from('profils').select('id', { count: 'exact', head: true }).eq('role', 'manager')

  return <LoginClient
    nextUrl={searchParams.next || '/admin/cat'}
    error={searchParams.error ?? null}
    nbManagers={nbManagers ?? 0}
  />
}
