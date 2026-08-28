import type { Metadata, Viewport } from 'next'
import TopActionBar, { type TopActionBarProfil } from '@/components/TopActionBar'
import OperateurBar from '@/components/ops/OperateurBar'
import CoupDeMainArnaud from './CoupDeMainArnaud'
import VisiteGuidee from '@/components/VisiteGuidee'
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
        apercu: profil.apercu,
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
    <div className="min-h-screen bg-[#0D0D0D] text-zinc-100 pb-mobile-nav" data-ops-theme="dark">
      {/* TopActionBar : visible PARTOUT
          - Mobile : fixed bottom (CSS interne du composant)
          - Desktop : static au top, scroll horizontal */}
      <TopActionBar theme="dark" profil={navProfil} initialFindingsRouges={(findingsRouges ?? []) as any} />
      <OperateurBar />
      <CoupDeMainArnaud />
      {children}
      {/* Les écrans (ops) sont ceux du service : la visite s'y affiche parce
          que c'est là qu'on apprend les gestes, mais elle ne bloque rien et
          se réduit en pastille. Absente si aucun profil n'est connecté — le
          comptoir tourne souvent sans session ouverte. */}
      {profil && (
        <div className="print:hidden">
          <VisiteGuidee poste={profil.poste} role={profil.role}
            etapeInitiale={profil.visite_guidee_etape ?? null} />
        </div>
      )}
    </div>
  )
}
