// Header standard pour les pages /admin/* — pattern premium mode clair.
// Garantit la cohérence visuelle entre les 28+ pages du back-office.
//
// Usage :
//   <AdminPageHeader
//     emoji="📦"
//     accent="emerald"
//     title="Stock"
//     subtitle="Inventaire & alertes"
//     actions={<Button>...</Button>}
//   />

import { type ReactNode } from 'react'
import { cn } from '@/lib/utils'

type Accent = 'emerald' | 'amber' | 'rose' | 'blue' | 'violet' | 'zinc' | 'orange' | 'indigo'

const ACCENTS: Record<Accent, { gradient: string; shadow: string; subtitle: string }> = {
  emerald: { gradient: 'from-emerald-500 to-teal-600', shadow: 'shadow-emerald-500/30', subtitle: 'text-emerald-600' },
  amber:   { gradient: 'from-amber-500 to-orange-600', shadow: 'shadow-amber-500/30',   subtitle: 'text-amber-600' },
  orange:  { gradient: 'from-orange-500 to-red-600',   shadow: 'shadow-orange-500/30',  subtitle: 'text-orange-600' },
  rose:    { gradient: 'from-rose-500 to-pink-600',    shadow: 'shadow-rose-500/30',    subtitle: 'text-rose-600' },
  blue:    { gradient: 'from-blue-500 to-cyan-600',    shadow: 'shadow-blue-500/30',    subtitle: 'text-blue-600' },
  indigo:  { gradient: 'from-indigo-500 to-blue-600',  shadow: 'shadow-indigo-500/30',  subtitle: 'text-indigo-600' },
  violet:  { gradient: 'from-violet-500 to-purple-600', shadow: 'shadow-violet-500/30', subtitle: 'text-violet-600' },
  zinc:    { gradient: 'from-zinc-700 to-zinc-900',    shadow: 'shadow-zinc-500/30',    subtitle: 'text-zinc-600' },
}

export default function AdminPageHeader({
  emoji, title, subtitle, accent = 'zinc', actions, children,
}: {
  emoji: string
  title: string
  subtitle?: string
  accent?: Accent
  actions?: ReactNode
  /** Contenu additionnel sous le titre (ex: tabs, breadcrumbs). */
  children?: ReactNode
}) {
  const a = ACCENTS[accent]
  return (
    <header className="mb-6 flex items-start justify-between flex-wrap gap-4">
      <div className="flex items-center gap-3 min-w-0">
        <span className={cn(
          'inline-flex items-center justify-center w-12 h-12 rounded-2xl text-white text-2xl shadow-lg shrink-0',
          'bg-gradient-to-br', a.gradient, a.shadow,
        )}>
          {emoji}
        </span>
        <div className="min-w-0">
          {subtitle && (
            <p className={cn('text-[10px] font-bold uppercase tracking-widest', a.subtitle)}>
              {subtitle}
            </p>
          )}
          <h1 className="text-2xl sm:text-3xl font-black text-zinc-900 tracking-tight leading-tight">
            {title}
          </h1>
          {children && <div className="mt-1.5">{children}</div>}
        </div>
      </div>
      {actions && (
        <div className="flex items-center gap-2 flex-wrap shrink-0">
          {actions}
        </div>
      )}
    </header>
  )
}
