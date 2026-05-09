'use client'

// Card pointage : 3 états visuels selon l'heure du jour.
//  - Pas pointé        → CTA "Pointer arrivée" (vert)
//  - En service        → bandeau vert + chrono live + CTA "Pointer sortie" (rouge)
//  - Service terminé   → résumé heures travaillées (gris)

import { useEffect, useState, useTransition } from 'react'
import { Loader2, LogIn, LogOut, Clock, Pencil, Check, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { pointerArrivee, pointerDepart, corrigerArrivee } from './actions'

export type Pointage = {
  id: string
  heure_arrivee: string | null
  heure_depart: string | null
  heures_travaillees: number | null
}

export default function PointageCard({ pointage }: { pointage: Pointage | null }) {
  const [pending, startTransition] = useTransition()
  const [now, setNow] = useState(() => Date.now())
  const [editing, setEditing] = useState(false)
  const [editValue, setEditValue] = useState(pointage?.heure_arrivee?.slice(0, 5) ?? '')

  // Tick chaque seconde tant qu'on est en service (live duration)
  useEffect(() => {
    if (!pointage?.heure_arrivee || pointage?.heure_depart) return
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [pointage?.heure_arrivee, pointage?.heure_depart])

  function liveDuration(): string {
    if (!pointage?.heure_arrivee || pointage?.heure_depart) return ''
    const [h, m, s] = String(pointage.heure_arrivee).split(':').map(Number)
    const arr = new Date()
    arr.setHours(h, m, s ?? 0, 0)
    const diffMin = Math.floor((now - arr.getTime()) / 60000)
    if (diffMin < 0) return ''
    const dh = Math.floor(diffMin / 60)
    const dm = diffMin % 60
    return `${dh}h ${String(dm).padStart(2, '0')}min`
  }

  function action(fn: () => Promise<unknown>, confirmMsg?: string) {
    if (confirmMsg && !confirm(confirmMsg)) return
    startTransition(async () => {
      try { await fn() }
      catch (e) { alert(e instanceof Error ? e.message : 'Erreur') }
    })
  }

  function saveEdit() {
    if (!/^\d{2}:\d{2}$/.test(editValue)) {
      alert('Format attendu : HH:MM (ex 08:30)')
      return
    }
    startTransition(async () => {
      try {
        await corrigerArrivee({ heure: editValue })
        setEditing(false)
      } catch (e) { alert(e instanceof Error ? e.message : 'Erreur') }
    })
  }

  // ─── État 1 : Pas pointé ─────────────────────────────────────
  if (!pointage) {
    return (
      <Card className="p-4 bg-amber-50 border-amber-200">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <p className="text-xs uppercase tracking-wider font-bold text-amber-700">⏰ Pas encore pointé aujourd'hui</p>
            <p className="text-sm text-zinc-700 mt-0.5">Démarre ton service en pointant ton arrivée.</p>
          </div>
          <Button
            onClick={() => action(pointerArrivee)}
            disabled={pending}
            className="bg-emerald-600 hover:bg-emerald-700 text-white gap-1.5"
          >
            {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <LogIn className="h-4 w-4" />}
            Pointer mon arrivée
          </Button>
        </div>
      </Card>
    )
  }

  // ─── État 2 : En service (arrivée saisie, pas départ) ────────
  if (pointage.heure_arrivee && !pointage.heure_depart) {
    return (
      <Card className="p-4 bg-emerald-50 border-emerald-300">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3 min-w-0">
            <span className="relative flex h-3 w-3 shrink-0">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500" />
            </span>
            <div className="min-w-0">
              <p className="text-xs uppercase tracking-wider font-bold text-emerald-700">En service</p>
              {editing ? (
                <div className="flex items-center gap-1 mt-0.5 text-sm">
                  <span>Arrivé à</span>
                  <input
                    type="time"
                    value={editValue}
                    onChange={e => setEditValue(e.target.value)}
                    className="px-1.5 py-0.5 rounded border border-zinc-300 text-sm"
                    disabled={pending}
                  />
                  <button onClick={saveEdit} disabled={pending} className="p-1 text-emerald-700 hover:bg-emerald-100 rounded">
                    {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                  </button>
                  <button onClick={() => { setEditing(false); setEditValue(pointage.heure_arrivee?.slice(0, 5) ?? '') }} className="p-1 text-zinc-500 hover:bg-zinc-100 rounded">
                    <X className="h-4 w-4" />
                  </button>
                </div>
              ) : (
                <p className="text-sm text-zinc-700 mt-0.5">
                  Arrivé à <strong>{String(pointage.heure_arrivee).slice(0, 5)}</strong>
                  <button
                    onClick={() => setEditing(true)}
                    className="inline-flex items-center gap-0.5 text-xs text-emerald-700 hover:text-emerald-900 ml-1.5 align-middle"
                    title="Corriger l'heure d'arrivée"
                  >
                    <Pencil className="h-3 w-3" />
                  </button>
                  {' · depuis '}<strong className="tabular-nums">{liveDuration()}</strong>
                </p>
              )}
            </div>
          </div>
          <Button
            onClick={() => action(pointerDepart, 'Pointer ta sortie ? Tu termines ton service du jour.')}
            disabled={pending}
            variant="outline"
            className="border-red-300 text-red-700 hover:bg-red-50 hover:text-red-900 gap-1.5"
          >
            {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <LogOut className="h-4 w-4" />}
            Pointer ma sortie
          </Button>
        </div>
      </Card>
    )
  }

  // ─── État 3 : Service terminé ────────────────────────────────
  const heures = Number(pointage.heures_travaillees ?? 0)
  return (
    <Card className="p-4 bg-zinc-50 border-zinc-200">
      <div className="flex items-center gap-3">
        <Clock className="h-5 w-5 text-zinc-500 shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-xs uppercase tracking-wider font-bold text-zinc-500">✓ Service terminé aujourd'hui</p>
          <p className="text-sm text-zinc-700 mt-0.5">
            <strong>{String(pointage.heure_arrivee).slice(0, 5)}</strong>
            {' → '}
            <strong>{String(pointage.heure_depart).slice(0, 5)}</strong>
            <span className={cn(
              'ml-2 font-bold tabular-nums',
              heures >= 7 ? 'text-emerald-700' : 'text-zinc-700',
            )}>
              · {heures.toFixed(2)} h travaillées
            </span>
          </p>
        </div>
      </div>
    </Card>
  )
}
