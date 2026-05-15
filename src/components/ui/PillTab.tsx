// Segmented control pill tactile — utilisé partout pour filtres / catégories.
// Pattern mobile/tablette-first : 44px par défaut (zone tactile WCAG).
//
// Usage :
//   <PillTab active={filtre === 'tous'} onClick={() => setFiltre('tous')}>
//     ✦ Toutes <PillCount n={count} active={filtre === 'tous'} />
//   </PillTab>
//
// Variants :
//   - default (44px) : pour le filtre principal de la page
//   - small (36px)   : pour les sous-filtres
//   - dark           : pour les écrans ops thème sombre

'use client'

import { type ReactNode } from 'react'
import { cn } from '@/lib/utils'

export function PillTab({
  active, onClick, children, small = false, dark = false,
}: {
  active: boolean
  onClick: () => void
  children: ReactNode
  /** Taille compacte 36px pour les sous-filtres (vs 44px par défaut). */
  small?: boolean
  /** Variante pour écrans postes sombres (#0D0D0D). */
  dark?: boolean
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full whitespace-nowrap font-bold border-2 transition-all shrink-0 active:scale-95',
        small ? 'px-3 min-h-[36px] text-xs' : 'px-4 min-h-[44px] text-sm',
        dark
          ? active
            ? 'bg-white text-zinc-900 border-white shadow-md'
            : 'bg-zinc-900/80 text-zinc-300 border-zinc-800 hover:border-zinc-600 backdrop-blur'
          : active
            ? 'bg-zinc-900 text-white border-zinc-900 shadow-md'
            : 'bg-white text-zinc-700 border-zinc-200 hover:border-zinc-400',
      )}
    >
      {children}
    </button>
  )
}

export function PillCount({ n, active, dark = false }: { n: number; active: boolean; dark?: boolean }) {
  return (
    <span className={cn(
      'inline-flex items-center justify-center min-w-5 h-5 px-1.5 rounded-full text-[10px] font-bold tabular-nums',
      dark
        ? active ? 'bg-zinc-900 text-white' : 'bg-zinc-800 text-zinc-500'
        : active ? 'bg-white/20 text-white' : 'bg-zinc-100 text-zinc-500',
    )}>{n}</span>
  )
}

/** Séparateur vertical fin entre groupes de pills (use as <PillDivider />). */
export function PillDivider({ dark = false }: { dark?: boolean }) {
  return <span className={cn('w-px mx-1', dark ? 'bg-zinc-700' : 'bg-zinc-300')}></span>
}
