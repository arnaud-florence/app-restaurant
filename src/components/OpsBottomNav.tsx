'use client'

// Barre de navigation tactile en bas d'écran pour l'espace OPÉRATIONNEL
// (/serveur, /cuisine, /bar, /caisse). 4 boutons fixes, identiques sur les
// 4 pages, accessible au pouce. Visible en mobile + tablette ; cachée
// uniquement sur desktop large où on a déjà la sidebar admin.
//
// Le contenu de la page doit inclure pb-mobile-nav pour ne pas être masqué.

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'

const NAV: Array<{ href: string; label: string; emoji: string }> = [
  { href: '/serveur', label: 'Serveur', emoji: '🍽️' },
  { href: '/cuisine', label: 'Cuisine', emoji: '👨‍🍳' },
  { href: '/bar',     label: 'Bar',     emoji: '🍺' },
  { href: '/caisse',  label: 'Caisse',  emoji: '💰' },
]

export default function OpsBottomNav() {
  const pathname = usePathname()
  return (
    <nav
      className="md:hidden fixed bottom-0 inset-x-0 z-30 bg-white border-t flex shadow-[0_-2px_10px_rgba(0,0,0,0.05)]"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      {NAV.map(it => {
        const active = pathname === it.href || pathname?.startsWith(it.href + '/')
        return (
          <Link
            key={it.href}
            href={it.href}
            className={cn(
              'flex-1 flex flex-col items-center justify-center min-h-[64px] py-1 gap-0.5 text-xs font-semibold',
              active ? 'text-emerald-700 bg-emerald-50' : 'text-zinc-700 hover:bg-zinc-50',
            )}
          >
            <span className="text-2xl leading-none">{it.emoji}</span>
            <span>{it.label}</span>
          </Link>
        )
      })}
    </nav>
  )
}
