'use client'

// Barre de raccourcis universelle — affichée en haut de toutes les pages.
// Permet de passer d'une page importante à une autre en 1 clic.
// 2 thèmes : 'light' (admin/public) et 'dark' (ops).
// Détecte la page active via usePathname() et la met en évidence.

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'

export type TopActionBarTheme = 'light' | 'dark'

type Raccourci = {
  href: string
  emoji: string
  label: string
  tone: 'emerald' | 'amber' | 'violet' | 'blue' | 'red' | 'zinc'
}

// Raccourcis ops : pages de service tactiles
const RACCOURCIS_OPS: Raccourci[] = [
  { href: '/serveur',    emoji: '🍽',  label: 'Salle',     tone: 'blue' },
  { href: '/caisse',     emoji: '💰',  label: 'Caisse',    tone: 'amber' },
  { href: '/cuisine',    emoji: '👨‍🍳', label: 'Cuisine',   tone: 'amber' },
  { href: '/bar',        emoji: '🍷',  label: 'Bar',       tone: 'violet' },
  { href: '/emporter',   emoji: '🛒',  label: 'Snack',     tone: 'emerald' },
  { href: '/livreur',    emoji: '🛵',  label: 'Livreur',   tone: 'emerald' },
  { href: '/reception',  emoji: '🛎',  label: 'Réception', tone: 'blue' },
  { href: '/admin',      emoji: '📊',  label: 'Admin',     tone: 'zinc' },
]

// Raccourcis admin : pilotage + accès rapide ops
const RACCOURCIS_ADMIN: Raccourci[] = [
  { href: '/admin',              emoji: '🏠', label: 'Accueil',  tone: 'emerald' },
  { href: '/admin/pilotage',     emoji: '📊', label: 'Pilotage', tone: 'emerald' },
  { href: '/admin/assistant',    emoji: '🤖', label: 'IA',       tone: 'violet' },
  { href: '/admin/stock',        emoji: '📦', label: 'Stock',    tone: 'blue' },
  { href: '/admin/reservations', emoji: '📅', label: 'Résa',     tone: 'blue' },
  { href: '/admin/rh',           emoji: '👥', label: 'Équipe',   tone: 'zinc' },
  { href: '/serveur',            emoji: '🍽', label: 'Service',  tone: 'amber' },
  { href: '/caisse',             emoji: '💰', label: 'Caisse',   tone: 'amber' },
  { href: '/mon-espace',         emoji: '👤', label: 'Espace',   tone: 'emerald' },
]

const TONES_LIGHT: Record<Raccourci['tone'], { base: string; active: string }> = {
  emerald: { base: 'border-zinc-200 text-zinc-700 hover:bg-emerald-50 hover:border-emerald-300 hover:text-emerald-900',
             active: 'bg-emerald-600 border-emerald-600 text-white' },
  amber:   { base: 'border-zinc-200 text-zinc-700 hover:bg-amber-50 hover:border-amber-300 hover:text-amber-900',
             active: 'bg-amber-500 border-amber-500 text-white' },
  violet:  { base: 'border-zinc-200 text-zinc-700 hover:bg-violet-50 hover:border-violet-300 hover:text-violet-900',
             active: 'bg-violet-600 border-violet-600 text-white' },
  blue:    { base: 'border-zinc-200 text-zinc-700 hover:bg-blue-50 hover:border-blue-300 hover:text-blue-900',
             active: 'bg-blue-600 border-blue-600 text-white' },
  red:     { base: 'border-zinc-200 text-zinc-700 hover:bg-red-50 hover:border-red-300 hover:text-red-900',
             active: 'bg-red-600 border-red-600 text-white' },
  zinc:    { base: 'border-zinc-200 text-zinc-700 hover:bg-zinc-100 hover:border-zinc-300 hover:text-zinc-900',
             active: 'bg-zinc-900 border-zinc-900 text-white' },
}

const TONES_DARK: Record<Raccourci['tone'], { base: string; active: string }> = {
  emerald: { base: 'border-zinc-700 bg-zinc-900 text-zinc-300 hover:border-emerald-500/60 hover:text-emerald-300',
             active: 'bg-emerald-600 border-emerald-500 text-white' },
  amber:   { base: 'border-zinc-700 bg-zinc-900 text-zinc-300 hover:border-amber-500/60 hover:text-amber-300',
             active: 'bg-amber-500 border-amber-400 text-zinc-900' },
  violet:  { base: 'border-zinc-700 bg-zinc-900 text-zinc-300 hover:border-violet-500/60 hover:text-violet-300',
             active: 'bg-violet-600 border-violet-500 text-white' },
  blue:    { base: 'border-zinc-700 bg-zinc-900 text-zinc-300 hover:border-blue-500/60 hover:text-blue-300',
             active: 'bg-blue-600 border-blue-500 text-white' },
  red:     { base: 'border-zinc-700 bg-zinc-900 text-zinc-300 hover:border-red-500/60 hover:text-red-300',
             active: 'bg-red-600 border-red-500 text-white' },
  zinc:    { base: 'border-zinc-700 bg-zinc-900 text-zinc-300 hover:border-zinc-500 hover:text-white',
             active: 'bg-white border-white text-zinc-900' },
}

export default function TopActionBar({
  theme = 'light',
  variant = 'auto',
}: {
  theme?: TopActionBarTheme
  /** 'auto' choisit selon le path : /admin → admin, sinon ops. 'admin' ou 'ops' force. */
  variant?: 'auto' | 'admin' | 'ops'
}) {
  const pathname = usePathname() ?? '/'

  const resolvedVariant: 'admin' | 'ops' =
    variant === 'auto'
      ? (pathname.startsWith('/admin') || pathname === '/mon-espace' || pathname.startsWith('/formation') || pathname.startsWith('/equipes'))
        ? 'admin'
        : 'ops'
      : variant

  const items = resolvedVariant === 'admin' ? RACCOURCIS_ADMIN : RACCOURCIS_OPS
  const tones = theme === 'dark' ? TONES_DARK : TONES_LIGHT

  const wrapperCls = theme === 'dark'
    ? 'bg-[#0D0D0D] border-b border-zinc-800'
    : 'bg-white border-b border-zinc-200'

  return (
    <div className={wrapperCls}>
      <div
        className="overflow-x-auto scrollbar-thin"
        style={{ scrollSnapType: 'x mandatory' }}
      >
        <div className="flex items-center gap-1.5 px-3 py-2 min-w-max">
          {items.map(it => {
            const active = pathname === it.href || (it.href !== '/admin' && pathname.startsWith(it.href + '/'))
            const cls = active ? tones[it.tone].active : tones[it.tone].base
            return (
              <Link
                key={it.href}
                href={it.href}
                style={{ scrollSnapAlign: 'start' }}
                className={cn(
                  'inline-flex items-center gap-1.5 h-10 px-3.5 rounded-full border-2 text-xs font-bold whitespace-nowrap active:scale-95 transition shrink-0',
                  cls,
                )}
              >
                <span className="text-base leading-none" aria-hidden>{it.emoji}</span>
                <span>{it.label}</span>
              </Link>
            )
          })}
        </div>
      </div>
    </div>
  )
}
