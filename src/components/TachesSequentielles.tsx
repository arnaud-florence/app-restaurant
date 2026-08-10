'use client'

// Composant : affiche les tâches obligatoires UNE PAR UNE pour un poste donné.
// L'employé voit la première tâche non cochée, la valide (avec saisie si requise),
// passe à la suivante. Affiche un message de félicitations à la fin.
//
// Conçu pour coexister avec TachesDuJourWidget (qui montre la liste complète).
// Phase 2 du système de fiches de poste séquentielles.

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { cn } from '@/lib/utils'
import Link from 'next/link'
import {
  type PosteWidget, type Tache, type Saisie, type Moment,
  TACHES, MOMENT_INFO, POSTE_INFO,
} from '@/lib/taches-du-jour'

// Helper : appelle /api/private/tasks (REST classique, pas server action,
// pour éviter le re-render RSC automatique qui crashait l'arbre).
async function callTasksApi(body: Record<string, unknown>): Promise<void> {
  const res = await fetch('/api/private/tasks', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    let msg = `HTTP ${res.status}`
    try { const j = await res.json(); if (j?.error) msg = j.error } catch { /* ignore */ }
    throw new Error(msg)
  }
}

type TacheAvecMoment = Tache & { moment: Moment }

export default function TachesSequentielles({
  poste, employeId, initialDone = [], theme = 'light',
}: {
  poste: PosteWidget
  employeId: string | null
  initialDone?: string[]
  theme?: 'light' | 'dark'
}) {
  const router = useRouter()
  // State local d'autorité : initialisé une seule fois depuis initialDone,
  // puis mis à jour optimistically à chaque coche. Pas de re-sync depuis
  // initialDone car router.refresh recrée la référence du tableau et
  // resetait nos coches optimistic juste après validation.
  const [done, setDone] = useState<Set<string>>(new Set(initialDone))
  const [valeur, setValeur] = useState<string>('')
  const [erreur, setErreur] = useState<string>('')
  const [isPending, setIsPending] = useState(false)

  // Toutes les tâches du poste (matin + service + fin), avec leur moment
  const allTaches: TacheAvecMoment[] = useMemo(() => {
    const t = TACHES[poste]
    if (!t) return []
    return [
      ...t.matin.map(x => ({ ...x, moment: 'matin' as Moment })),
      ...t.service.map(x => ({ ...x, moment: 'service' as Moment })),
      ...t.fin.map(x => ({ ...x, moment: 'fin' as Moment })),
    ]
  }, [poste])

  const todoTaches = useMemo(() => allTaches.filter(t => !done.has(t.id)), [allTaches, done])
  const currentTache = todoTaches[0] ?? null
  const totalDone = allTaches.length - todoTaches.length
  const total = allTaches.length
  const progress = total === 0 ? 0 : Math.round((totalDone / total) * 100)

  // Reset le champ de saisie quand on change de tâche (useEffect, pas useMemo
  // — setState dans useMemo est un anti-pattern qui casse le re-render).
  const currentId = currentTache?.id ?? null
  useEffect(() => { setValeur(''); setErreur('') }, [currentId])

  const isDark = theme === 'dark'
  const surface = isDark ? 'bg-zinc-900 border-zinc-800 text-zinc-100' : 'bg-white border-zinc-200 text-zinc-900'
  const muted = isDark ? 'text-zinc-400' : 'text-zinc-500'

  // ─── Pas d'employé sélectionné ────────────────────────────────────
  // Mode kiosk (aucun employé rattaché) : on n'affiche RIEN plutôt qu'une
  // consigne "Sélectionne ton nom" sans sélecteur (qui faisait croire à un bug).
  // Les tickets de commande restent affichés normalement par ailleurs.
  // ⛔ Tâches retirées de l'opérationnel — remplacées par les rappels d'Arnaud (/mon-espace) (anti-doublon).
  const MASQUE_OPS: boolean = true
  if (MASQUE_OPS) return null

  if (!employeId) return null

  // ─── Tout fini : félicitations ────────────────────────────────────
  if (!currentTache) {
    return (
      <div className={cn('rounded-lg border p-5 text-center', surface, isDark ? 'border-emerald-700' : 'border-emerald-300')}>
        <div className="text-5xl mb-2 animate-bounce">🎉</div>
        <p className="font-bold text-lg">Bravo, toutes tes tâches sont faites !</p>
        <p className={cn('text-sm mt-1', muted)}>
          {total} tâche{total > 1 ? 's' : ''} validée{total > 1 ? 's' : ''} pour {POSTE_INFO[poste]?.label.toLowerCase()}.
        </p>
      </div>
    )
  }

  // ─── Validation (avec saisie si requis) ───────────────────────────
  function valider() {
    if (!currentTache || !employeId) return
    setErreur('')

    // Validation côté client de la saisie
    if (currentTache.saisie) {
      const s = currentTache.saisie
      if (s.type === 'texte') {
        if (!valeur.trim()) {
          setErreur('Champ obligatoire.')
          return
        }
      } else {
        const num = Number(valeur)
        if (Number.isNaN(num)) {
          setErreur('Saisie un nombre valide.')
          return
        }
        if (s.min !== undefined && num < s.min) {
          setErreur(`Minimum : ${s.min}${s.unite ?? ''}`)
          return
        }
        if (s.max !== undefined && num > s.max) {
          setErreur(`Maximum : ${s.max}${s.unite ?? ''}`)
          return
        }
      }
    }

    setIsPending(true)
    ;(async () => {
      try {
        // 1. Enregistre la saisie si présente
        if (currentTache.saisie) {
          const s = currentTache.saisie
          await callTasksApi({
            action:       'saisir',
            employe_id:   employeId,
            tache_id:     currentTache.id,
            poste:        poste as string,
            moment:       currentTache.moment,
            type_saisie:  s.type,
            valeur_num:   s.type === 'texte' ? null : Number(valeur),
            valeur_texte: s.type === 'texte' ? valeur.trim() : null,
            unite:        s.unite ?? null,
          })
        }
        // 2. Marque la tâche cochée
        await callTasksApi({
          action:      'cocher',
          employe_id:  employeId,
          tache_id:    currentTache.id,
          poste:       poste as string,
          moment:      currentTache.moment,
          obligatoire: !!currentTache.obligatoire,
        })
        // 3. Optimistic update (état local) + router.refresh pour resync
        // les Server Components voisins (/mon-espace, /admin/hygiene, etc.)
        setDone(prev => new Set([...prev, currentTache.id]))
        setValeur('')
        router.refresh()
      } catch (e) {
        console.error('[TachesSequentielles] valider() failed:', e)
        setErreur(e instanceof Error ? e.message : 'Erreur de validation')
      } finally {
        setIsPending(false)
      }
    })()
  }

  // Permet de revenir en arrière (décocher la dernière)
  function annulerDerniere() {
    const lastDone = allTaches.filter(t => done.has(t.id)).slice(-1)[0]
    if (!lastDone || !employeId) return
    setIsPending(true)
    ;(async () => {
      try {
        await callTasksApi({ action: 'decocher', employe_id: employeId, tache_id: lastDone.id })
        setDone(prev => {
          const next = new Set(prev)
          next.delete(lastDone.id)
          return next
        })
        router.refresh()
      } catch (e) {
        console.error('[TachesSequentielles] annulerDerniere() failed:', e)
        setErreur(e instanceof Error ? e.message : 'Erreur')
      } finally {
        setIsPending(false)
      }
    })()
  }

  const momentInfo = MOMENT_INFO[currentTache.moment]
  const accentBorder = isDark ? 'border-emerald-700' : 'border-emerald-400'
  const accentBg = isDark ? 'bg-emerald-700' : 'bg-emerald-500'

  return (
    <div className={cn('rounded-lg border-2 p-4 transition-all', surface, accentBorder)}>
      {/* Barre progression */}
      <div className="flex items-center justify-between gap-3 mb-3">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-xl">{POSTE_INFO[poste]?.emoji}</span>
          <div className="min-w-0">
            <p className={cn('text-[10px] font-bold uppercase tracking-wider', muted)}>
              {momentInfo.emoji} {momentInfo.label}
            </p>
            <p className="text-xs font-bold tabular-nums">
              Tâche {totalDone + 1} / {total}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className={cn('h-2 w-20 rounded-full overflow-hidden', isDark ? 'bg-zinc-800' : 'bg-zinc-200')}>
            <div className={cn('h-full transition-all', accentBg)} style={{ width: `${progress}%` }} />
          </div>
          <span className="text-xs tabular-nums font-bold">{progress}%</span>
        </div>
      </div>

      {/* Tâche courante */}
      <div className="space-y-3">
        <div className="flex items-start gap-2">
          {currentTache.obligatoire && <span className="text-amber-500 text-lg leading-none mt-0.5" title="Tâche obligatoire">⚠️</span>}
          <p className="text-base font-semibold leading-snug flex-1">{currentTache.label}</p>
        </div>

        {/* Champ de saisie si requis */}
        {currentTache.saisie && (
          <SaisieInput
            saisie={currentTache.saisie}
            value={valeur}
            onChange={setValeur}
            isDark={isDark}
            disabled={isPending}
          />
        )}

        {/* Lien vers le module qui aide */}
        {currentTache.module && (
          <Link
            href={currentTache.module}
            className={cn('inline-flex items-center gap-1 text-xs underline', isDark ? 'text-emerald-400' : 'text-emerald-700')}
          >
            🔗 Aller à {currentTache.module}
          </Link>
        )}

        {/* Erreur — affichée en gros pour debug + bouton copier */}
        {erreur && (
          <div className={cn(
            'p-3 rounded border-2',
            isDark ? 'bg-red-950/60 border-red-700 text-red-200' : 'bg-red-50 border-red-400 text-red-900',
          )}>
            <div className="flex items-start gap-2">
              <span className="text-xl">⚠️</span>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-bold uppercase tracking-wider opacity-80">Erreur</p>
                <p className="text-sm font-mono break-all mt-1 select-all">{erreur}</p>
              </div>
              <button
                onClick={() => { navigator.clipboard?.writeText(erreur).catch(() => {}) }}
                className={cn('text-[10px] px-2 py-1 rounded font-bold', isDark ? 'bg-red-800 text-red-100' : 'bg-red-200 text-red-900')}
              >
                📋 Copier
              </button>
            </div>
          </div>
        )}

        {/* Boutons */}
        <div className="flex gap-2 pt-1">
          <button
            onClick={valider}
            disabled={isPending}
            className={cn(
              'flex-1 min-h-[48px] rounded-md font-bold text-sm uppercase tracking-wider transition-all active:scale-[0.97] shadow-sm',
              isPending ? 'opacity-60' : '',
              accentBg, 'text-white hover:opacity-90',
            )}
          >
            {isPending ? '…' : '✓ Fait et validé'}
          </button>
          {totalDone > 0 && (
            <button
              onClick={annulerDerniere}
              disabled={isPending}
              className={cn(
                'min-h-[48px] px-3 rounded-md text-xs font-bold transition-colors',
                isDark ? 'bg-zinc-800 hover:bg-zinc-700 text-zinc-400' : 'bg-zinc-100 hover:bg-zinc-200 text-zinc-600',
              )}
              title="Décocher la précédente"
            >
              ↩
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Champ de saisie selon le type ──────────────────────────────────
function SaisieInput({
  saisie, value, onChange, isDark, disabled,
}: {
  saisie: Saisie
  value: string
  onChange: (v: string) => void
  isDark: boolean
  disabled: boolean
}) {
  const inputCls = cn(
    'w-full px-3 py-2 rounded-md border outline-none transition-colors text-base font-bold tabular-nums',
    isDark
      ? 'bg-zinc-950 border-zinc-700 text-zinc-100 focus:border-emerald-500'
      : 'bg-zinc-50 border-zinc-300 text-zinc-900 focus:border-emerald-500',
  )

  return (
    <div className="space-y-1">
      <label className={cn('text-xs font-bold', isDark ? 'text-zinc-300' : 'text-zinc-700')}>
        {saisie.label}
        {saisie.unite && <span className={cn('ml-1 font-normal', isDark ? 'text-zinc-500' : 'text-zinc-400')}>({saisie.unite})</span>}
      </label>
      {saisie.type === 'texte' ? (
        <textarea
          rows={2}
          value={value}
          onChange={e => onChange(e.target.value)}
          disabled={disabled}
          placeholder={saisie.placeholder}
          className={inputCls}
        />
      ) : (
        <input
          type="number"
          inputMode="decimal"
          step={saisie.type === 'temperature' ? '0.1' : '0.01'}
          min={saisie.min}
          max={saisie.max}
          value={value}
          onChange={e => onChange(e.target.value)}
          disabled={disabled}
          placeholder={saisie.placeholder}
          className={inputCls}
          autoFocus
        />
      )}
    </div>
  )
}
