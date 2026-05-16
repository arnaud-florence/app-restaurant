import type { Metadata, Viewport } from 'next'
import TopActionBar, { type TopActionBarProfil } from '@/components/TopActionBar'
import { getProfile } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'

// Layout commun aux écrans de service (cuisine, bar, serveur).
// Force le fond sombre #0D0D0D + texte clair pour l'usage tablette en service.
// La TopActionBar est rendue ici : fixed bottom sur mobile (zone du pouce),
// static en haut sur desktop.

export const metadata: Metadata = { robots: { index: false, follow: false } }
export const viewport: Viewport = {
  themeColor: '#0D0D0D',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: 'cover',
}

export const dynamic = 'force-dynamic'

export default async function OpsLayout({ children }: { children: React.ReactNode }) {
  // Profil peut être null en mode kiosk (login non requis sur /serveur, /cuisine, etc.)
  const profil = await getProfile()
  const navProfil: TopActionBarProfil = profil
    ? {
        email: profil.email,
        role: profil.role,
        poste: profil.poste,
        custom_permissions: profil.custom_permissions,
      }
    : null

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
    <div
      className="h-[100dvh] flex flex-col bg-[#0D0D0D] text-zinc-100 overflow-hidden"
      data-ops-theme="dark"
      style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 0px))' }}
    >
      {/* Sur mobile la TopActionBar est fixed-bottom (hors flow).
          Sur desktop elle est static au top — on la met en shrink-0 dans le flex.
          BackToCategoryButton CACHÉ en mode ops (service intense = fullscreen). */}
      <div className="hidden md:block shrink-0">
        <TopActionBar theme="dark" profil={navProfil} initialFindingsRouges={(findingsRouges ?? []) as any} />
      </div>
      <div className="md:hidden">
        <TopActionBar theme="dark" profil={navProfil} initialFindingsRouges={(findingsRouges ?? []) as any} />
      </div>
      {/* Children prend tout l'espace restant — sur mobile on réserve 6.5rem
          en bas pour la TopActionBar fixed bottom (hors flow). */}
      <main className="flex-1 min-h-0 overflow-hidden pb-[6.5rem] md:pb-0">
        {children}
      </main>
    </div>
  )
}
