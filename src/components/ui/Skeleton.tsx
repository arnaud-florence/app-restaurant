// Squelettes de chargement façon Facebook/Instagram : des silhouettes grises
// animées (shimmer) affichées PENDANT que le serveur répond, au lieu d'un écran
// blanc. Donne la sensation que l'app est instantanée même quand elle charge.
//
// Utilisé surtout via les fichiers loading.tsx de l'App Router (Suspense auto).

import { cn } from '@/lib/utils'

/** Brique de base : un bloc gris animé. */
export function Skeleton({ className, dark = false }: { className?: string; dark?: boolean }) {
  return (
    <div
      className={cn(
        'animate-pulse rounded-lg',
        dark ? 'bg-zinc-700/40' : 'bg-zinc-200/80',
        className,
      )}
      aria-hidden
    />
  )
}

/** En-tête de page (trait d'accent + gros titre + sous-titre). */
export function SkeletonHeader({ dark = false }: { dark?: boolean }) {
  return (
    <div className="space-y-2.5">
      <Skeleton dark={dark} className="h-3 w-24 rounded-full" />
      <Skeleton dark={dark} className="h-8 w-2/3 max-w-xs" />
      <Skeleton dark={dark} className="h-4 w-1/2 max-w-[16rem]" />
    </div>
  )
}

/** Rangée de KPI (tuiles chiffres). */
export function SkeletonKpis({ n = 4, dark = false }: { n?: number; dark?: boolean }) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5">
      {Array.from({ length: n }).map((_, i) => (
        <div key={i} className={cn('rounded-2xl p-4 space-y-2', dark ? 'bg-zinc-900/60 border border-zinc-800' : 'bg-white border border-zinc-100')}>
          <Skeleton dark={dark} className="h-3 w-16" />
          <Skeleton dark={dark} className="h-7 w-20" />
        </div>
      ))}
    </div>
  )
}

/** Liste de cartes empilées (le motif "feed"). */
export function SkeletonCards({ n = 5, dark = false }: { n?: number; dark?: boolean }) {
  return (
    <div className="space-y-3">
      {Array.from({ length: n }).map((_, i) => (
        <div key={i} className={cn('rounded-2xl p-4 flex items-center gap-3', dark ? 'bg-zinc-900/60 border border-zinc-800' : 'bg-white border border-zinc-100')}>
          <Skeleton dark={dark} className="h-11 w-11 rounded-full shrink-0" />
          <div className="flex-1 space-y-2">
            <Skeleton dark={dark} className="h-4 w-1/2" />
            <Skeleton dark={dark} className="h-3 w-3/4" />
          </div>
          <Skeleton dark={dark} className="h-8 w-16 rounded-xl shrink-0" />
        </div>
      ))}
    </div>
  )
}

/** Page complète type admin (header + KPIs + feed). */
export function SkeletonPage({ dark = false }: { dark?: boolean }) {
  return (
    <div className="max-w-5xl mx-auto px-3 sm:px-4 py-4 space-y-5">
      <SkeletonHeader dark={dark} />
      <SkeletonKpis dark={dark} />
      <SkeletonCards dark={dark} />
    </div>
  )
}
