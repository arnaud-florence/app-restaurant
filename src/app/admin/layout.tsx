// Module 28 — Layout admin commun : sidebar + zone contenu.
// Le contrôle d'accès fin (manager OU employé avec permission) est fait
// par le middleware. Ici on s'assure juste qu'il y a un profil connecté.

import { getProfile } from '@/lib/auth'
import { redirect } from 'next/navigation'
import AdminNav from './AdminNav'
import TopActionBar, { type TopActionBarProfil } from '@/components/TopActionBar'
import BackToCategoryButton from '@/components/BackToCategoryButton'
import StoriesNav from '@/components/StoriesNav'
import { createClient } from '@/lib/supabase/server'
import { CATEGORIES, filtrerCategories } from '@/lib/navigation'
import { getActivation } from '@/lib/activation/server'
import { canAccess } from '@/lib/permissions'

export const dynamic = 'force-dynamic'

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const profil = await getProfile()
  if (!profil) redirect('/login')
  const navProfil: TopActionBarProfil = {
    email: profil.email,
    role: profil.role,
    poste: profil.poste,
    custom_permissions: profil.custom_permissions,
        apercu: profil.apercu,
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

  // Catégories visibles pour la nav « stories » mobile (présente sur toutes les
  // pages admin) — filtrées par permissions / aperçu employé, comme la grille
  // d'accueil, pour qu'aucun employé ne voie une catégorie hors de son périmètre.
  const ap = profil.apercu ?? null
  const isManager = !ap && profil.role === 'manager'
  const posteNav = ap ? ap.ciblePoste : (profil.poste ?? null)
  const permsNav = ap ? ap.ciblePerms : (profil.custom_permissions ?? null)
  // Activités ouvertes d'abord (migration 0110), permissions ensuite.
  const etatActivation = await getActivation()
  const categoriesNav = filtrerCategories(etatActivation)
    // 'service' est déjà un onglet permanent de la barre du bas (MobileTabBar) →
    // on l'omet des stories pour éviter le doublon.
    .filter(c => c.slug !== 'service')
    .filter(c => isManager || c.items.some(it => canAccess(posteNav, it.href, permsNav)))
    .map(c => ({ slug: c.slug, label: c.label, tone: c.tone }))

  return (
    <div className="min-h-screen flex flex-col md:flex-row bg-stone-50">
      <AdminNav profil={profil} />
      <div className={`flex-1 min-w-0 flex flex-col ${profil.apercu ? 'pb-mobile-nav-apercu' : 'pb-mobile-nav'}`}>
        {/* Chrome de nav : masqué en impression (display:contents = aucun impact à l'écran). */}
        <div className="contents print:hidden">
          <TopActionBar theme="light" profil={navProfil} initialFindingsRouges={(findingsRouges ?? []) as any} />
          <BackToCategoryButton theme="light" />
          <StoriesNav categories={categoriesNav} nbAlertes={(findingsRouges ?? []).length} />
        </div>
        <div className="flex-1 min-w-0">{children}</div>
      </div>
    </div>
  )
}
