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
  // min-h-dvh (dynamic viewport height) = couvre tout l'écran SANS interférer
  // avec la barre URL mobile. Le scroll est natif du body si le contenu déborde.
  // (Avant : fixed inset-0 + overflow-hidden, qui bloquait le scroll natif et
  // pouvait rogner le contenu en bas sur mobile portrait.)
  return (
    <div className="min-h-dvh bg-[#0D0D0D] text-zinc-100 flex flex-col" data-ops-theme="dark">
      {children}
    </div>
  )
}
