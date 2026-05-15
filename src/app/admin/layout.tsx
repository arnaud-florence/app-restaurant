// Module 28 — Layout admin commun : sidebar + zone contenu.
// Le contrôle d'accès fin (manager OU employé avec permission) est fait
// par le middleware. Ici on s'assure juste qu'il y a un profil connecté.

import { getProfile } from '@/lib/auth'
import { redirect } from 'next/navigation'
import AdminNav from './AdminNav'
import TopActionBar, { type TopActionBarProfil } from '@/components/TopActionBar'
import BackToCategoryButton from '@/components/BackToCategoryButton'
import { createClient } from '@/lib/supabase/server'

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

  // Findings urgence='rouge' non résolus pour le badge live dans TopActionBar.
  const supabase = await createClient()
  const { data: findingsRouges } = await supabase
    .from('agent_findings')
    .select('id, agent_id, urgence, titre, message, action_label, action_url, created_at')
    .eq('resolu', false)
    .eq('urgence', 'rouge')
    .order('created_at', { ascending: false })
    .limit(50)

  return (
    <div className="min-h-screen flex flex-col md:flex-row bg-stone-50">
      <AdminNav profil={profil} />
      <div className="flex-1 min-w-0 pb-mobile-nav flex flex-col">
        <TopActionBar theme="light" profil={navProfil} initialFindingsRouges={(findingsRouges ?? []) as any} />
        <BackToCategoryButton theme="light" />
        <div className="flex-1 min-w-0">{children}</div>
      </div>
    </div>
  )
}
