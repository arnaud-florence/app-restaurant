'use client'

// Widget « Tâches du jour » — affiche la checklist du poste, groupée par moment.
// Persistance :
//   - employeId fourni  → DB via server actions cocherTache/decocherTache
//                         (multi-device, sert au dashboard manager)
//   - employeId absent  → localStorage (kiosk mode tablette partagée)

import { useEffect, useState, useTransition } from 'react'
import Link from 'next/link'
import { ChevronDown, ChevronUp, ListTodo, Check, ExternalLink, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  type PosteWidget, type Moment, type Tache,
  TACHES, POSTE_INFO, MOMENT_INFO,
  momentActuel, clefLocalStorage, getTaches,
} from '@/lib/taches-du-jour'
import { cocherTache, decocherTache } from '@/lib/taches-actions'

export default function TachesDuJourWidget({
  poste,
  defaultOpen = false,
  theme = 'light',
  employeId = null,
  initialDone = [],
}: {
  poste: PosteWidget
  defaultOpen?: boolean
  theme?: 'light' | 'dark'
  /** Si fourni, persistance via DB (recommandé pour les employés connectés). */
  employeId?: string | null
  /** Tâches déjà cochées en DB pour la journée (à hydrater). */
  initialDone?: string[]
}) {
  const persistDb = !!employeId
  const [done, setDone] = useState<Set<string>>(() => new Set(initialDone))
  const [open, setOpen] = useState(defaultOpen)
  const [expandedMoment, setExpandedMoment] = useState<Moment>(momentActuel())
  const [hydrated, setHydrated] = useState(persistDb)  // déjà hydraté côté DB
  const [pending, startTransition] = useTransition()

  // Hydrate depuis localStorage si on est en mode kiosk
  useEffect(() => {
    if (persistDb) return
    try {
      const raw = localStorage.getItem(clefLocalStorage(poste))
      if (raw) {
        const ids: string[] = JSON.parse(raw)
        setDone(new Set(ids))
      }
    } catch { /* ignore */ }
    setHydrated(true)
  }, [poste, persistDb])

  // Sauvegarde localStorage à chaque changement (mode kiosk uniquement)
  useEffect(() => {
    if (!hydrated || persistDb) return
    try {
      localStorage.setItem(clefLocalStorage(poste), JSON.stringify([...done]))
    } catch { /* ignore */ }
  }, [done, hydrated, poste, persistDb])

  /** Cherche le tâche dans la matrice pour ses metadata (moment + obligatoire). */
  function findTache(id: string): { moment: Moment; obligatoire: boolean } | null {
    for (const m of ['matin', 'service', 'fin'] as Moment[]) {
      const t = TACHES[poste]?.[m]?.find(x => x.id === id)
      if (t) return { moment: m, obligatoire: !!t.obligatoire }
    }
    return null
  }

  function toggle(id: string) {
    const wasDone = done.has(id)

    // Optimistic update (UI snappy)
    setDone(prev => {
      const next = new Set(prev)
      if (wasDone) next.delete(id)
      else         next.add(id)
      return next
    })

    if (!persistDb || !employeId) return

    const meta = findTache(id)
    if (!meta) return

    startTransition(async () => {
      try {
        if (wasDone) {
          await decocherTache({ employe_id: employeId, tache_id: id })
        } else {
          await cocherTache({
            employe_id:  employeId,
            tache_id:    id,
            poste,
            moment:      meta.moment,
            obligatoire: meta.obligatoire,
          })
        }
      } catch (e) {
        // Rollback en cas d'erreur
        setDone(prev => {
          const next = new Set(prev)
          if (wasDone) next.add(id)
          else         next.delete(id)
          return next
        })
        alert(e instanceof Error ? e.message : 'Erreur — réessaie.')
      }
    })
  }

  // Stats
  const allTaches = (['matin', 'service', 'fin'] as Moment[]).flatMap(m => getTaches(poste, m).map(t => ({ ...t, moment: m })))
  const totalObligatoires = allTaches.filter(t => t.obligatoire).length
  const doneObligatoires = allTaches.filter(t => t.obligatoire && done.has(t.id)).length
  const allDone = allTaches.length > 0 && allTaches.every(t => done.has(t.id))

  const isDark = theme === 'dark'
  const cardCls = isDark ? 'bg-zinc-900 border-zinc-700 text-zinc-100' : 'bg-white border-zinc-200 text-zinc-900'

  return (
    <div className={cn('rounded-lg border shadow-sm', cardCls)}>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className={cn(
          'w-full px-3 py-2.5 flex items-center justify-between gap-2 text-sm font-semibold',
          isDark ? 'hover:bg-zinc-800' : 'hover:bg-zinc-50',
        )}
      >
        <span className="flex items-center gap-2 min-w-0">
          <ListTodo className="h-4 w-4 shrink-0 text-emerald-500" />
          <span className="truncate">
            {POSTE_INFO[poste].emoji} Tâches du jour — {POSTE_INFO[poste].label}
          </span>
        </span>
        <span className="flex items-center gap-2 shrink-0">
          {totalObligatoires > 0 && (
            <span className={cn(
              'text-xs px-2 py-0.5 rounded-full font-bold',
              doneObligatoires === totalObligatoires
                ? 'bg-emerald-100 text-emerald-900'
                : doneObligatoires > 0
                  ? 'bg-amber-100 text-amber-900'
                  : 'bg-red-100 text-red-900',
            )}>
              ⚠ {doneObligatoires}/{totalObligatoires}
            </span>
          )}
          {open ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </span>
      </button>

      {open && (
        <div className={cn('border-t px-2 pb-2', isDark ? 'border-zinc-700' : 'border-zinc-200')}>
          {(['matin', 'service', 'fin'] as Moment[]).map(moment => {
            const taches = getTaches(poste, moment)
            if (taches.length === 0) return null
            const isExpanded = expandedMoment === moment
            const totalM = taches.length
            const doneM = taches.filter(t => done.has(t.id)).length

            return (
              <div key={moment} className="mt-2">
                <button
                  type="button"
                  onClick={() => setExpandedMoment(moment)}
                  className={cn(
                    'w-full flex items-center justify-between gap-2 px-2 py-1.5 rounded text-xs font-bold uppercase tracking-wider',
                    isExpanded
                      ? isDark ? 'bg-zinc-800 text-emerald-300' : 'bg-emerald-50 text-emerald-900'
                      : isDark ? 'text-zinc-400 hover:bg-zinc-800' : 'text-zinc-500 hover:bg-zinc-50',
                  )}
                >
                  <span>{MOMENT_INFO[moment].emoji} {MOMENT_INFO[moment].label}</span>
                  <span>{doneM}/{totalM}</span>
                </button>
                {isExpanded && (
                  <ul className="mt-1 space-y-0.5">
                    {taches.map(t => <TacheItem key={t.id} tache={t} done={done.has(t.id)} onToggle={toggle} dark={isDark} />)}
                  </ul>
                )}
              </div>
            )
          })}

          {allDone && (
            <div className={cn(
              'mt-3 mb-1 px-3 py-2 rounded text-sm text-center font-semibold',
              isDark ? 'bg-emerald-900/40 text-emerald-200' : 'bg-emerald-50 text-emerald-800',
            )}>
              ✅ Toutes les tâches du jour sont cochées. Bon travail !
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function TacheItem({
  tache, done, onToggle, dark,
}: {
  tache: Tache
  done: boolean
  onToggle: (id: string) => void
  dark: boolean
}) {
  return (
    <li className="flex items-start gap-2">
      <button
        type="button"
        onClick={() => onToggle(tache.id)}
        className={cn(
          'min-h-[44px] flex-1 flex items-start gap-2 px-2 py-1.5 rounded text-sm text-left transition-colors',
          done
            ? dark ? 'text-zinc-500 line-through' : 'text-zinc-400 line-through'
            : dark ? 'text-zinc-100 hover:bg-zinc-800' : 'text-zinc-900 hover:bg-zinc-50',
        )}
      >
        <span className={cn(
          'mt-0.5 h-5 w-5 shrink-0 rounded border-2 flex items-center justify-center transition-colors',
          done
            ? 'bg-emerald-600 border-emerald-600 text-white'
            : dark ? 'border-zinc-500' : 'border-zinc-300',
        )}>
          {done && <Check className="h-3.5 w-3.5" />}
        </span>
        <span className="flex-1 leading-snug">
          {tache.obligatoire && <span className="text-red-500 font-bold mr-1">⚠</span>}
          {tache.label}
        </span>
      </button>
      {tache.module && (
        <Link
          href={tache.module}
          className={cn(
            'shrink-0 min-h-[44px] min-w-[44px] flex items-center justify-center rounded',
            dark ? 'text-zinc-400 hover:bg-zinc-800 hover:text-emerald-300' : 'text-zinc-500 hover:bg-zinc-50 hover:text-emerald-700',
          )}
          title={`Aller sur ${tache.module}`}
          aria-label="Ouvrir le module concerné"
        >
          <ExternalLink className="h-4 w-4" />
        </Link>
      )}
    </li>
  )
}
