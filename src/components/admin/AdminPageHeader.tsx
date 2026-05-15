// Header premium éditorial pour pages /admin/* (sous-modules métier).
// Style cohérent avec /admin/cat : trait vertical + titre Fraunces italic
// + subtitle uppercase tracking[0.2em] + actions à droite.
//
// Usage :
//   <AdminPageHeader
//     emoji="📦"
//     accent="amber"
//     title="Stock"
//     subtitle="Inventaire & alertes"
//     description="Niveaux temps réel, mouvements, ruptures."
//     actions={<Button>...</Button>}
//   />

import { type ReactNode } from 'react'
import { cn } from '@/lib/utils'

type Accent = 'emerald' | 'amber' | 'rose' | 'blue' | 'violet' | 'zinc' | 'orange' | 'indigo' | 'red'

const ACCENTS: Record<Accent, { accentBar: string; subtitleColor: string; numColor: string }> = {
  emerald: { accentBar: 'bg-emerald-500', subtitleColor: 'text-emerald-700', numColor: 'text-emerald-600' },
  amber:   { accentBar: 'bg-amber-500',   subtitleColor: 'text-amber-700',   numColor: 'text-amber-600' },
  orange:  { accentBar: 'bg-orange-500',  subtitleColor: 'text-orange-700',  numColor: 'text-orange-600' },
  rose:    { accentBar: 'bg-rose-500',    subtitleColor: 'text-rose-700',    numColor: 'text-rose-600' },
  red:     { accentBar: 'bg-red-500',     subtitleColor: 'text-red-700',     numColor: 'text-red-600' },
  blue:    { accentBar: 'bg-blue-500',    subtitleColor: 'text-blue-700',    numColor: 'text-blue-600' },
  indigo:  { accentBar: 'bg-indigo-500',  subtitleColor: 'text-indigo-700',  numColor: 'text-indigo-600' },
  violet:  { accentBar: 'bg-violet-500',  subtitleColor: 'text-violet-700',  numColor: 'text-violet-600' },
  zinc:    { accentBar: 'bg-zinc-900',    subtitleColor: 'text-zinc-700',    numColor: 'text-zinc-600' },
}

export default function AdminPageHeader({
  emoji, title, subtitle, description, accent = 'zinc', actions, chapterNumber, children,
}: {
  /** Emoji optionnel (s'affiche en filigrane si présent, plus subtle qu'avant). */
  emoji?: string
  /** Numéro de chapitre (style magazine), ex: "03" pour la 3ème page de la catégorie. */
  chapterNumber?: string
  title: string
  subtitle?: string
  description?: string
  accent?: Accent
  actions?: ReactNode
  /** Contenu additionnel sous le header (ex: tabs, filtres). */
  children?: ReactNode
}) {
  const a = ACCENTS[accent]
  return (
    <header className="mb-6 sm:mb-8">
      <div className="flex items-start justify-between flex-wrap gap-4">
        {/* Bloc gauche : trait + texte */}
        <div className="flex items-stretch gap-4 min-w-0 flex-1">
          {/* Trait vertical coloré (signature éditoriale) */}
          <span className={cn('w-1 rounded-full self-stretch shrink-0', a.accentBar)} aria-hidden />

          <div className="min-w-0 space-y-1.5">
            {/* Subtitle uppercase + numéro de chapitre éditorial */}
            {(subtitle || chapterNumber) && (
              <div className="flex items-baseline gap-2.5">
                {chapterNumber && (
                  <span className={cn('font-display italic text-base font-medium tabular-nums leading-none', a.numColor)}>
                    {chapterNumber}
                  </span>
                )}
                {subtitle && (
                  <p className={cn('text-[10px] font-black uppercase tracking-[0.2em]', a.subtitleColor)}>
                    {subtitle}
                  </p>
                )}
              </div>
            )}

            {/* Titre principal — Fraunces italic medium */}
            <h1 className="font-display italic text-3xl sm:text-5xl font-medium text-zinc-900 tracking-[-0.02em] leading-[0.95]">
              {title}
              {emoji && (
                <span className="ml-2 text-2xl sm:text-3xl opacity-50 not-italic align-middle" aria-hidden>
                  {emoji}
                </span>
              )}
            </h1>

            {/* Description courte */}
            {description && (
              <p className="text-sm sm:text-base text-zinc-500 leading-relaxed max-w-2xl pt-1">
                {description}
              </p>
            )}
          </div>
        </div>

        {/* Bloc droit : actions (boutons, badges) */}
        {actions && (
          <div className="flex items-center gap-2 flex-wrap shrink-0 pt-1">
            {actions}
          </div>
        )}
      </div>

      {/* Slot enfants pour tabs/filtres sous le header */}
      {children && <div className="mt-4 sm:mt-6">{children}</div>}
    </header>
  )
}
