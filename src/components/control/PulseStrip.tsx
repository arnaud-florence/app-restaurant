// « Le Pouls » du Centre de contrôle : la santé du resto en direct, sur une
// bande responsive (2 colonnes mobile → 6 desktop). Présentationnel (serveur).

import Link from 'next/link'
import { cn } from '@/lib/utils'

export type PulseTone = 'emerald' | 'amber' | 'blue' | 'red' | 'violet'
export type PulseTile = {
  label: string
  value: string
  sub?: string
  tone: PulseTone
  href: string
}

const T: Record<PulseTone, { bar: string; label: string; value: string }> = {
  emerald: { bar: 'bg-emerald-500', label: 'text-emerald-700', value: 'text-zinc-900' },
  amber:   { bar: 'bg-amber-500',   label: 'text-amber-700',   value: 'text-zinc-900' },
  blue:    { bar: 'bg-blue-500',    label: 'text-blue-700',    value: 'text-zinc-900' },
  red:     { bar: 'bg-red-500',     label: 'text-red-700',     value: 'text-red-900' },
  violet:  { bar: 'bg-violet-500',  label: 'text-violet-700',  value: 'text-zinc-900' },
}

export default function PulseStrip({ tiles }: { tiles: PulseTile[] }) {
  if (tiles.length === 0) return null
  return (
    <section>
      <h2 className="text-sm font-black uppercase tracking-[0.15em] text-zinc-500 mb-2 flex items-center gap-1.5">
        <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" aria-hidden />
        Le pouls — en direct
      </h2>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 sm:gap-2.5">
        {tiles.map(tile => {
          const t = T[tile.tone]
          return (
            <Link
              key={tile.label}
              href={tile.href}
              className="group relative flex flex-col rounded-2xl bg-white ring-1 ring-zinc-200 hover:ring-zinc-300 hover:shadow-md active:scale-[0.98] transition overflow-hidden p-3 min-h-[78px]"
            >
              <span className={cn('absolute top-0 left-0 h-full w-1', t.bar)} aria-hidden />
              <span className={cn('text-[9px] font-black uppercase tracking-[0.12em] truncate', t.label)}>{tile.label}</span>
              <span className={cn('text-xl sm:text-2xl font-black tracking-[-0.035em] tabular-nums leading-none mt-1.5 truncate', t.value)}>{tile.value}</span>
              {tile.sub && <span className="text-[10px] text-zinc-400 mt-1 truncate">{tile.sub}</span>}
            </Link>
          )
        })}
      </div>
    </section>
  )
}
