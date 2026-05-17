import type { Metadata, Viewport } from 'next'

// Layout dédié à la borne kiosk : fullscreen, pas de scroll global,
// thème sombre, viewport verrouillé. Aucune chrome (pas de TopActionBar).

export const metadata: Metadata = {
  title: 'Borne — commande sans contact',
  robots: { index: false, follow: false },
}

export const viewport: Viewport = {
  themeColor: '#0D0D0D',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: 'cover',
}

export const dynamic = 'force-dynamic'

export default function BorneLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 bg-[#0D0D0D] text-zinc-100 overflow-hidden flex flex-col" data-ops-theme="dark">
      {children}
    </div>
  )
}
