// Routing racine : redirige vers /admin si connecté en tant que manager, sinon /login.

import { redirect } from 'next/navigation'
import { getProfile } from '@/lib/auth'

export const dynamic = 'force-dynamic'

export default async function Home() {
  const profil = await getProfile()
  if (profil?.role === 'manager') redirect('/admin/pilotage')
  redirect('/login')
}
