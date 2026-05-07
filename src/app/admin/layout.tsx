// Module 28 — Layout admin commun : sidebar + zone contenu.
// requireManager() bloque l'accès si pas de session manager (double sécurité avec le middleware).

import { requireManager } from '@/lib/auth'
import AdminNav from './AdminNav'

export const dynamic = 'force-dynamic'

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const profil = await requireManager()
  return (
    <div className="min-h-screen flex flex-col md:flex-row bg-stone-50">
      <AdminNav profil={profil} />
      <div className="flex-1 min-w-0 pb-mobile-nav">{children}</div>
    </div>
  )
}
