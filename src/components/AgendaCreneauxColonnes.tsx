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
  /** Heure de début (défaut: 11h) — IGNORÉ si startFromNow=true */
  startHour?: number
  /** Heure de fin (défaut: 23h) */
  endHour?: number
  /** Si true (défaut), l'agenda commence à l'heure courante (- bufferMinutesBefore)
   *  pour ne pas afficher d'heures inutiles. À désactiver pour un planning prévisionnel. */
  startFromNow?: boolean
  /** Minutes de buffer avant maintenant si startFromNow=true (défaut: 30) */
  bufferMinutesBefore?: number
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
  /** Position de la colonne "hors créneau" : avant ou après les colonnes d'heures */
  horsCreneauPosition?: 'before' | 'after'
  /** Label affiché en header de la colonne hors créneau (défaut: '⏸ Hors créneau') */
  horsCreneauLabel?: string
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
  horsCreneauPosition = 'after',
  horsCreneauLabel = '⏸ Hors créneau',
  startFromNow = true,
  bufferMinutesBefore = 0,
}: AgendaCreneauxColonnesProps<T>) {
  const accentCls = ACCENT_CLS[accent]
  const scrollerRef = useRef<HTMLDivElement | null>(null)
  const nowColRef = useRef<HTMLDivElement | null>(null)
  // Ref vers la colonne "commande la plus proche de maintenant" (= cible scroll auto)
  const cibleScrollRef = useRef<HTMLDivElement | null>(null)

  // Stabilité : on régénère les colonnes au max toutes les 5 min (pas à chaque tick).
  // Évite de re-rendre tout l'agenda quand le parent ticke now chaque seconde.
  const nowMinuteForColumns = Math.floor(now.getTime() / (5 * 60_000)) * (5 * 60_000)

  // ─── Construction des colonnes (créneaux du jour) ──────────────────
  // Si startFromNow : on démarre à (now - bufferMinutesBefore) aligné sur la tranche.
  //   Ex: à 15h10 avec buffer=30 et step=15 → colonnes 14:45, 15:00, 15:15, ...
  // Sinon : on respecte startHour fixe (mode planning).
  // Les commandes dont le créneau est antérieur à la 1ère colonne tombent
  // dans `horsCreneau` (= en retard / à traiter en priorité).
  const baseStartMs = useMemo(() => {
    if (!startFromNow) {
      const base = new Date(date)
      base.setHours(startHour, 0, 0, 0)
      return base.getTime()
    }
    const start = new Date(now)
    start.setMinutes(start.getMinutes() - bufferMinutesBefore, 0, 0)
    const aligned = floorToStep(start, stepMinutes)
    return aligned.getTime()
  }, [date, startHour, startFromNow, bufferMinutesBefore, nowMinuteForColumns, stepMinutes])

  const colonnes = useMemo(() => {
    const cols: { key: string; date: Date; label: string }[] = []
    const cur = new Date(baseStartMs)
    const fin = new Date(date)
    fin.setHours(endHour, 0, 0, 0)
    while (cur.getTime() <= fin.getTime()) {
      cols.push({ key: dateKey(cur), date: new Date(cur), label: formatHHMM(cur) })
      cur.setMinutes(cur.getMinutes() + stepMinutes)
    }
    return cols
  }, [baseStartMs, date, endHour, stepMinutes])

  // ─── Bucket items par créneau ──────────────────────────────────────
  // RÈGLE :
  // - Item sans créneau (salle / comptoir) → 1ère colonne (= maintenant)
  //   pour traitement immédiat, plus de colonne 'Hors créneau' séparée.
  // - Item avec créneau passé (en retard) → 1ère colonne (= maintenant)
  //   pour rattraper le retard.
  // - Item avec créneau futur ≤ fin de journée → colonne correspondante.
  // - Item avec créneau au-delà de la fin → horsCreneau (rare, ex: J+1).
  const finOfDayMs = useMemo(() => {
    const d = new Date(date)
    d.setHours(endHour, 0, 0, 0)
    return d.getTime()
  }, [date, endHour])
  const firstColKey = useMemo(() => {
    const d = new Date(baseStartMs)
    return dateKey(d)
  }, [baseStartMs])
  const { bucketsParCreneau, horsCreneau } = useMemo(() => {
    const map = new Map<string, T[]>()
    const hors: T[] = []
    const putInFirst = (data: T) => {
      const arr = map.get(firstColKey) ?? []
      arr.push(data)
      map.set(firstColKey, arr)
    }
    for (const it of items) {
      // Pas de créneau → directement dans la 1ère colonne
      if (!it.creneauISO) { putInFirst(it.data); continue }
      const d = new Date(it.creneauISO)
      const aligned = floorToStep(d, stepMinutes)
      const alignedMs = aligned.getTime()
      // En retard (créneau passé) → 1ère colonne pour traitement immédiat
      if (alignedMs < baseStartMs) { putInFirst(it.data); continue }
      // Au-delà de la fin de journée (rare) → horsCreneau
      if (alignedMs > finOfDayMs) { hors.push(it.data); continue }
      const k = dateKey(aligned)
      const arr = map.get(k) ?? []
      arr.push(it.data)
      map.set(k, arr)
    }
    return { bucketsParCreneau: map, horsCreneau: hors }
  }, [items, stepMinutes, baseStartMs, finOfDayMs, firstColKey])

  // ─── Cible scroll : colonne avec commandes la plus proche de maintenant ───
  // RÈGLE : si "maintenant" (14:00) n'a pas de commande mais qu'une commande
  // existe à 14:30 et une autre à 15:45, on scrolle sur 14:30 (la plus proche).
  // Si toutes les commandes sont passées, on scrolle sur la plus récente.
  // Si aucune commande dans l'agenda → fallback sur "maintenant".
  //
  // OPTIM : on arrondit `now` à la minute pour ne pas recalculer (et re-scroller)
  // toutes les secondes quand les parents tickent now chaque seconde.
  const nowMinuteMs = Math.floor(now.getTime() / 60_000) * 60_000
  const cibleScrollKey = useMemo(() => {
    const colsAvecItems = colonnes.filter(c => (bucketsParCreneau.get(c.key)?.length ?? 0) > 0)
    if (colsAvecItems.length === 0) return null
    // Plus petit |col.date - now|
    let best = colsAvecItems[0]
    let bestDiff = Math.abs(best.date.getTime() - nowMinuteMs)
    for (const c of colsAvecItems) {
      const d = Math.abs(c.date.getTime() - nowMinuteMs)
      if (d < bestDiff) { best = c; bestDiff = d }
    }
    return best.key
  }, [colonnes, bucketsParCreneau, nowMinuteMs])

  // ─── Auto-scroll sur la cible (commande la plus proche, pas tranche vide) ───
  // Se déclenche AU MONTAGE + à chaque changement de :
  //   - cibleScrollKey : nouvelle commande sur un créneau plus proche, ou
  //     commande de la cible servie → suivante
  //   - items.length : NOUVELLE commande arrive (salle / comptoir / online),
  //     même si la cible reste la 1ère colonne → re-scroll pour garantir
  //     que la commande est visible
  //   - le temps avance et la "plus proche" change → re-scroll
  //
  // Cas spécial : si AUCUNE commande dans les colonnes horaires mais qu'il
  // y a des items "hors créneau" en début (position='before', ex: pizza salle),
  // on scrolle à 0 pour les rendre visibles immédiatement.
  useEffect(() => {
    if (!scrollerRef.current) return
    if (cibleScrollKey === null && horsCreneau.length > 0 && horsCreneauPosition === 'before') {
      scrollerRef.current.scrollTo({ left: 0, behavior: 'smooth' })
      return
    }
    const target = cibleScrollRef.current ?? nowColRef.current
    if (!target) return
    // Centre approximatif : laisse 1 colonne de marge à gauche
    const left = target.offsetLeft - columnWidth
    scrollerRef.current.scrollTo({ left: Math.max(0, left), behavior: 'smooth' })
  }, [columnWidth, cibleScrollKey, horsCreneau.length, horsCreneauPosition, items.length])

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

  // ─── Bloc "Hors créneau" (réutilisé en début OU en fin selon horsCreneauPosition) ───
  const horsCreneauBlock = horsCreneau.length > 0 ? (
    <div
      key="hors-creneau-col"
      className={cn(
        'shrink-0 flex flex-col bg-zinc-900/40 ring-2 ring-inset ring-amber-500/40',
        horsCreneauPosition === 'before' ? 'border-r-4 border-amber-500/60' : 'border-l-2 border-zinc-700',
      )}
      style={{ width: horsCreneauWidth, scrollSnapAlign: 'start' }}
    >
      <div className={cn(
        'sticky top-0 z-10 px-3 py-2 border-b backdrop-blur',
        horsCreneauPosition === 'before' ? 'border-amber-500/50 bg-amber-950/60' : 'border-zinc-700 bg-zinc-900/95',
      )}>
        <div className="flex items-center justify-between gap-2">
          <p className={cn(
            'text-xs font-black uppercase tracking-widest',
            horsCreneauPosition === 'before' ? 'text-amber-200' : 'text-zinc-400',
          )}>{horsCreneauLabel}</p>
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
  ) : null

  return (
    <div ref={scrollerRef} className="overflow-x-auto scroll-visible-dark" style={{ scrollSnapType: 'x mandatory' }}>
      <div className="flex items-stretch min-w-max">
        {horsCreneauPosition === 'before' && horsCreneauBlock}
        {colonnes.map((col, idx) => {
          const items = bucketsParCreneau.get(col.key) ?? []
          const isNow = col.key === nowKey
          const isFirst = col.key === firstColKey
          const isCible = col.key === cibleScrollKey
          const isHourMark = col.date.getMinutes() === 0
          // Une seule ref par colonne ; priorité à la cible (vu qu'on scroll dessus)
          const colRef = isCible ? cibleScrollRef : isNow ? nowColRef : null
          return (
            <div
              key={col.key}
              ref={colRef}
              className={cn(
                'shrink-0 flex flex-col border-r border-zinc-800/60',
                isCible && !isNow && cn(accentCls.bg, 'ring-2 ring-inset', accentCls.ring),
                isNow && 'bg-zinc-900/40',
              )}
              style={{ width: columnWidth, scrollSnapAlign: 'start' }}
            >
              {/* Header colonne */}
              <div className={cn(
                'sticky top-0 z-10 px-2 py-2 border-b backdrop-blur',
                isCible
                  ? cn('border-b-2', accentCls.bg, accentCls.ring, 'ring-1 ring-inset')
                  : isNow
                    ? cn('border-b-2', 'bg-zinc-800/80', 'ring-1 ring-inset ring-zinc-600')
                    : isHourMark
                      ? 'border-zinc-700 bg-zinc-900/95'
                      : 'border-zinc-800/60 bg-zinc-950/80',
              )}>
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-baseline gap-1.5 min-w-0">
                    <p className={cn(
                      'font-display italic tracking-tight tabular-nums',
                      isHourMark ? 'text-lg font-bold' : 'text-sm font-medium',
                      isCible ? accentCls.text : isNow ? 'text-zinc-200' : 'text-zinc-300',
                    )}>
                      {col.label}
                    </p>
                    {isFirst && (
                      <span className={cn(
                        'text-[8px] font-black uppercase tracking-[0.18em] px-1.5 py-0.5 rounded',
                        accentCls.bar, 'text-white',
                      )}>
                        Maintenant
                      </span>
                    )}
                  </div>
                  {items.length > 0 && (
                    <span className={cn(
                      'inline-flex items-center justify-center min-w-[22px] h-[22px] px-1.5 rounded-full text-[10px] font-black tabular-nums',
                      isCible || isFirst ? cn(accentCls.bar, 'text-white') : 'bg-zinc-700 text-zinc-200',
                    )}>
                      {items.length}
                    </span>
                  )}
                  {isNow && !isFirst && (
                    <span className={cn('flex h-2 w-2 rounded-full animate-pulse', accentCls.bar)} aria-label="Maintenant" />
                  )}
                  {isCible && !isNow && !isFirst && (
                    <span className={cn('text-[9px] font-black uppercase tracking-widest', accentCls.text)} title="Prochaine commande">↓</span>
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

        {horsCreneauPosition === 'after' && horsCreneauBlock}
      </div>
    </div>
  )
}
