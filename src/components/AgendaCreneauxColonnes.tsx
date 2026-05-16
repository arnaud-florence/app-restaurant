'use client'

import { useMemo, useRef, useEffect, type ReactNode } from 'react'
import { cn } from '@/lib/utils'

/**
 * AgendaCreneauxColonnes
 * ─────────────────────────────────────────────────────────────────────
 * Layout type agenda : colonnes verticales de tranches horaires (15 min
 * par défaut), chaque colonne prenant une portion fixe de la largeur
 * de l'écran. Les tickets sont placés sous leur créneau correspondant.
 *
 * Pattern visuel :
 *   ┌──────────┬──────────┬──────────┬──────────┬──────────┐
 *   │  12:00   │  12:15   │  12:30   │  12:45   │  13:00   │
 *   ├──────────┼──────────┼──────────┼──────────┼──────────┤
 *   │ ┌──────┐ │          │          │ ┌──────┐ │          │
 *   │ │ T#5  │ │ ┌──────┐ │          │ │ Web  │ │          │
 *   │ └──────┘ │ │ T#7  │ │          │ └──────┘ │          │
 *   │ ┌──────┐ │ └──────┘ │          │          │          │
 *   │ │ Web  │ │          │          │          │          │
 *   │ └──────┘ │          │          │          │          │
 *   └──────────┴──────────┴──────────┴──────────┴──────────┘
 *      ↑ scroll horizontal si overflow                       ↑
 *
 * - Auto-scroll sur le créneau le plus proche de l'heure actuelle au montage
 * - Pas de RSC (utilise useRef + useEffect)
 * - Hors-créneaux (commandes sans créneau) regroupés en queue
 */

export type AgendaItem<T> = {
  /** ISO date string du créneau (null/undefined = hors agenda) */
  creneauISO: string | null | undefined
  /** Donnée arbitraire à rendre dans la cellule */
  data: T
}

export type AgendaCreneauxColonnesProps<T> = {
  items: AgendaItem<T>[]
  /** Fonction de rendu d'un item dans la cellule */
  renderItem: (data: T, index: number) => ReactNode
  /** Date du jour à afficher (défaut: aujourd'hui) */
  date?: Date
  /** Pas en minutes (défaut: 15) */
  stepMinutes?: number
  /** Heure de début (défaut: 11h) */
  startHour?: number
  /** Heure de fin (défaut: 23h) */
  endHour?: number
  /** Largeur d'une colonne (défaut: 280px) */
  columnWidth?: number
  /** Largeur fixe colonne "hors créneau" (défaut: 320px) */
  horsCreneauWidth?: number
  /** Accent color (Tailwind ring/text) */
  accent?: 'emerald' | 'amber' | 'violet' | 'blue' | 'red'
  /** Empty state */
  emptyMessage?: string
  /** Maintenant (pour scroll auto + highlight) */
  now?: Date
}

const ACCENT_CLS: Record<NonNullable<AgendaCreneauxColonnesProps<unknown>['accent']>, {
  text: string
  ring: string
  bg: string
  bar: string
}> = {
  emerald: { text: 'text-emerald-300', ring: 'ring-emerald-500/40', bg: 'bg-emerald-500/10', bar: 'bg-emerald-500' },
  amber:   { text: 'text-amber-300',   ring: 'ring-amber-500/40',   bg: 'bg-amber-500/10',   bar: 'bg-amber-500' },
  violet:  { text: 'text-violet-300',  ring: 'ring-violet-500/40',  bg: 'bg-violet-500/10',  bar: 'bg-violet-500' },
  blue:    { text: 'text-blue-300',    ring: 'ring-blue-500/40',    bg: 'bg-blue-500/10',    bar: 'bg-blue-500' },
  red:     { text: 'text-red-300',     ring: 'ring-red-500/40',     bg: 'bg-red-500/10',     bar: 'bg-red-500' },
}

/** Arrondit une date à la tranche stepMinutes la plus proche (ex: 12:23 → 12:15 si step=15) */
function floorToStep(d: Date, stepMin: number): Date {
  const out = new Date(d)
  out.setSeconds(0, 0)
  const m = out.getMinutes()
  out.setMinutes(Math.floor(m / stepMin) * stepMin)
  return out
}

function formatHHMM(d: Date): string {
  return d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
}

function dateKey(d: Date): string {
  // YYYY-MM-DD-HH-MM clé stable pour Map
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}-${String(d.getHours()).padStart(2, '0')}-${String(d.getMinutes()).padStart(2, '0')}`
}

export default function AgendaCreneauxColonnes<T>({
  items,
  renderItem,
  date = new Date(),
  stepMinutes = 15,
  startHour = 11,
  endHour = 23,
  columnWidth = 280,
  horsCreneauWidth = 320,
  accent = 'emerald',
  emptyMessage = 'Aucune commande dans l\'agenda',
  now = new Date(),
}: AgendaCreneauxColonnesProps<T>) {
  const accentCls = ACCENT_CLS[accent]
  const scrollerRef = useRef<HTMLDivElement | null>(null)
  const nowColRef = useRef<HTMLDivElement | null>(null)

  // ─── Construction des colonnes (créneaux du jour) ──────────────────
  const colonnes = useMemo(() => {
    const cols: { key: string; date: Date; label: string }[] = []
    const base = new Date(date)
    base.setHours(startHour, 0, 0, 0)
    const fin = new Date(date)
    fin.setHours(endHour, 0, 0, 0)
    const cur = new Date(base)
    while (cur.getTime() <= fin.getTime()) {
      cols.push({ key: dateKey(cur), date: new Date(cur), label: formatHHMM(cur) })
      cur.setMinutes(cur.getMinutes() + stepMinutes)
    }
    return cols
  }, [date, startHour, endHour, stepMinutes])

  // ─── Bucket items par créneau ──────────────────────────────────────
  const { bucketsParCreneau, horsCreneau } = useMemo(() => {
    const map = new Map<string, T[]>()
    const hors: T[] = []
    for (const it of items) {
      if (!it.creneauISO) { hors.push(it.data); continue }
      const d = new Date(it.creneauISO)
      // Aligner sur la tranche pour matcher la colonne
      const aligned = floorToStep(d, stepMinutes)
      // Si hors plage horaire visible → hors créneau
      if (aligned.getHours() < startHour || aligned.getHours() > endHour) {
        hors.push(it.data); continue
      }
      const k = dateKey(aligned)
      const arr = map.get(k) ?? []
      arr.push(it.data)
      map.set(k, arr)
    }
    return { bucketsParCreneau: map, horsCreneau: hors }
  }, [items, stepMinutes, startHour, endHour])

  // ─── Auto-scroll sur la colonne "maintenant" au montage ────────────
  useEffect(() => {
    if (!scrollerRef.current || !nowColRef.current) return
    // Centre approximatif : laisse 1 colonne de marge à gauche
    const left = nowColRef.current.offsetLeft - columnWidth
    scrollerRef.current.scrollTo({ left: Math.max(0, left), behavior: 'smooth' })
  }, [columnWidth])

  // ─── Empty state ───────────────────────────────────────────────────
  if (items.length === 0) {
    return (
      <div className="rounded-2xl border-2 border-dashed border-zinc-800 bg-zinc-950/40 p-10 text-center">
        <p className="text-4xl mb-2">📭</p>
        <p className="text-sm text-zinc-500">{emptyMessage}</p>
      </div>
    )
  }

  const nowStep = floorToStep(now, stepMinutes)
  const nowKey = dateKey(nowStep)

  return (
    <div ref={scrollerRef} className="overflow-x-auto scroll-visible-dark" style={{ scrollSnapType: 'x mandatory' }}>
      <div className="flex items-stretch min-w-max">
        {colonnes.map((col, idx) => {
          const items = bucketsParCreneau.get(col.key) ?? []
          const isNow = col.key === nowKey
          const isHourMark = col.date.getMinutes() === 0
          return (
            <div
              key={col.key}
              ref={isNow ? nowColRef : null}
              className={cn(
                'shrink-0 flex flex-col border-r border-zinc-800/60',
                isNow && 'bg-zinc-900/40',
              )}
              style={{ width: columnWidth, scrollSnapAlign: 'start' }}
            >
              {/* Header colonne */}
              <div className={cn(
                'sticky top-0 z-10 px-2 py-2 border-b backdrop-blur',
                isNow
                  ? cn('border-b-2', accentCls.bg, accentCls.ring, 'ring-1 ring-inset')
                  : isHourMark
                    ? 'border-zinc-700 bg-zinc-900/95'
                    : 'border-zinc-800/60 bg-zinc-950/80',
              )}>
                <div className="flex items-center justify-between gap-2">
                  <p className={cn(
                    'font-display italic tracking-tight tabular-nums',
                    isHourMark ? 'text-lg font-bold' : 'text-sm font-medium',
                    isNow ? accentCls.text : 'text-zinc-300',
                  )}>
                    {col.label}
                  </p>
                  {items.length > 0 && (
                    <span className={cn(
                      'inline-flex items-center justify-center min-w-[22px] h-[22px] px-1.5 rounded-full text-[10px] font-black tabular-nums',
                      isNow ? cn(accentCls.bar, 'text-white') : 'bg-zinc-700 text-zinc-200',
                    )}>
                      {items.length}
                    </span>
                  )}
                  {isNow && (
                    <span className={cn('flex h-2 w-2 rounded-full animate-pulse', accentCls.bar)} aria-label="Maintenant" />
                  )}
                </div>
              </div>

              {/* Cellules */}
              <div className="flex-1 flex flex-col gap-2 p-2 min-h-[200px]">
                {items.length === 0 ? (
                  <div className="flex-1 rounded-lg border border-dashed border-zinc-800/60 flex items-center justify-center">
                    <span className="text-[10px] text-zinc-700 italic">—</span>
                  </div>
                ) : (
                  items.map((data, i) => (
                    <div key={i} className="scroll-snap-align-start">
                      {renderItem(data, i)}
                    </div>
                  ))
                )}
              </div>
            </div>
          )
        })}

        {/* Colonne "Hors créneau" en queue */}
        {horsCreneau.length > 0 && (
          <div
            className="shrink-0 flex flex-col border-l-2 border-zinc-700 bg-zinc-900/30"
            style={{ width: horsCreneauWidth, scrollSnapAlign: 'start' }}
          >
            <div className="sticky top-0 z-10 px-3 py-2 border-b border-zinc-700 bg-zinc-900/95 backdrop-blur">
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs font-black uppercase tracking-widest text-zinc-400">⏸ Hors créneau</p>
                <span className="inline-flex items-center justify-center min-w-[22px] h-[22px] px-1.5 rounded-full bg-amber-500 text-white text-[10px] font-black tabular-nums">
                  {horsCreneau.length}
                </span>
              </div>
            </div>
            <div className="flex-1 flex flex-col gap-2 p-2 min-h-[200px]">
              {horsCreneau.map((data, i) => (
                <div key={`hors-${i}`}>
                  {renderItem(data, i)}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
