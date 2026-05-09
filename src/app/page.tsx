// Routing racine :
//  - manager connecté    → /admin/pilotage
//  - employé connecté    → /mon-espace (tableau de bord personnel)
//  - non connecté        → /login

import { redirect } from 'next/navigation'
import { getProfile } from '@/lib/auth'

export const dynamic = 'force-dynamic'

export default async function Home() {
  const profil = await getProfile()
  if (!profil) redirect('/login')
  if (profil.role === 'manager') redirect('/admin/pilotage')
  redirect('/mon-espace')
}
