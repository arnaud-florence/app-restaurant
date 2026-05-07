'use client'

// Barre de navigation tactile en bas d'écran pour les postes opérationnels.
// Visible uniquement sur mobile (caché ≥ md). Le contenu de la page doit
// inclure pb-mobile-nav pour ne pas être masqué par la barre.

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'

type Role = 'serveur' | 'barman' | 'caisse'

const NAV_PAR_ROLE: Record<Role, Array<{ href: string; label: string; emoji: string }>> = {
  serveur: [
    { href: '/serveur', label: 'Serveur', emoji: '🍽️' },
    { href: '/caisse',  label: 'Caisse',  emoji: '💰' },
  ],
  barman: [
    { href: '/bar',    label: 'Bar',    emoji: '🍺' },
    { href: '/caisse', label: 'Caisse', emoji: '💰' },
  ],
  // /caisse est utilisé par les 2 postes — on affiche les 3 raccourcis.
  caisse: [
    { href: '/serveur', label: 'Serveur', emoji: '🍽️' },
    { href: '/bar',     label: 'Bar',     emoji: '🍺' },
    { href: '/caisse',  label: 'Caisse',  emoji: '💰' },
  ],
}

export default function OpsBottomNav({ role }: { role: Role }) {
  const pathname = usePathname()
  const items = NAV_PAR_ROLE[role]
  return (
    <nav
      className="md:hidden fixed bottom-0 inset-x-0 z-30 bg-white border-t flex shadow-[0_-2px_10px_rgba(0,0,0,0.05)]"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      {items.map(it => {
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
            <span className="text-2xl">{it.emoji}</span>
            <span>{it.label}</span>
          </Link>
        )
      })}
    </nav>
  )
}
