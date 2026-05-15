import type { Metadata, Viewport } from 'next'
import TopActionBar from '@/components/TopActionBar'

// Layout commun aux écrans de service (cuisine, bar, serveur).
// Force le fond sombre #0D0D0D + texte clair pour l'usage tablette
// en service. CLAUDE.md règle : "Boutons minimum 48px de hauteur pour
// usage tablette" — appliqué via la classe `min-h-[48px]` sur les
// composants Button (déjà fait via size="lg").

export const metadata: Metadata = { robots: { index: false, follow: false } }
export const viewport: Viewport = {
  themeColor: '#0D0D0D',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: 'cover',
}

export default function OpsLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-[#0D0D0D] text-zinc-100" data-ops-theme="dark">
      <TopActionBar theme="dark" variant="ops" />
      {children}
    </div>
  )
}
