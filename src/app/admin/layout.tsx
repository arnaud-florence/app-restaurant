// Module 28 — Layout admin commun : sidebar + zone contenu.
// Le contrôle d'accès fin (manager OU employé avec permission) est fait
// par le middleware. Ici on s'assure juste qu'il y a un profil connecté.

import { getProfile } from '@/lib/auth'
import { redirect } from 'next/navigation'
import AdminNav from './AdminNav'
import TopActionBar, { type TopActionBarProfil } from '@/components/TopActionBar'

export const dynamic = 'force-dynamic'

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const profil = await getProfile()
  if (!profil) redirect('/login')
  const navProfil: TopActionBarProfil = {
    email: profil.email,
    role: profil.role,
    poste: profil.poste,
    custom_permissions: profil.custom_permissions,
  }
  return (
    <div className="min-h-screen flex flex-col md:flex-row bg-stone-50">
      <AdminNav profil={profil} />
      <div className="flex-1 min-w-0 pb-mobile-nav flex flex-col">
        <TopActionBar theme="light" profil={navProfil} />
        <div className="flex-1 min-w-0">{children}</div>
      </div>
    </div>
  )
}
