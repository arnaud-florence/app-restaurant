'use client'

// Tirer pour rafraîchir (pull-to-refresh) — le geste mobile iconique de
// Facebook / Instagram. Quand on est tout en haut et qu'on tire vers le bas,
// un indicateur apparaît ; au-delà du seuil, on relâche → la page se rafraîchit
// (router.refresh() côté serveur). En PWA standalone (mode app), il n'y a pas
// de pull-to-refresh natif → pas de conflit.
//
// Usage : envelopper le contenu d'un écran « fil ».
//   <PullToRefresh><MaPage /></PullToRefresh>

import { useRouter } from 'next/navigation'
import { useRef, useState, useTransition, type ReactNode } from 'react'
import { RefreshCw } from 'lucide-react'
import { cn } from '@/lib/utils'

const SEUIL = 72       // px de tirage pour déclencher
const MAX = 110        // px max (résistance)

export default function PullToRefresh({ children }: { children: ReactNode }) {
  const router = useRouter()
  const [pull, setPull] = useState(0)
  const [refreshing, setRefreshing] = useState(false)
  const [, startTransition] = useTransition()
  const startY = useRef<number | null>(null)
  const actif = useRef(false)

  function onTouchStart(e: React.TouchEvent) {
    // On n'arme le geste que si la page est tout en haut.
    if (window.scrollY > 4 || refreshing) { startY.current = null; actif.current = false; return }
    startY.current = e.touches[0].clientY
    actif.current = true
  }

  function onTouchMove(e: React.TouchEvent) {
    if (!actif.current || startY.current === null || refreshing) return
    const dy = e.touches[0].clientY - startY.current
    if (dy <= 0 || window.scrollY > 4) { setPull(0); return }
    // résistance : plus on tire, plus c'est dur
    const resiste = Math.min(MAX, dy * 0.5)
    setPull(resiste)
  }

  function onTouchEnd() {
    if (!actif.current) return
    actif.current = false
    startY.current = null
    if (pull >= SEUIL && !refreshing) {
      setRefreshing(true)
      setPull(SEUIL * 0.6)
      if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
        try { navigator.vibrate(12) } catch { /* ignore */ }
      }
      startTransition(() => router.refresh())
      // Laisse le spinner tourner un court instant pour le ressenti.
      window.setTimeout(() => { setRefreshing(false); setPull(0) }, 850)
    } else {
      setPull(0)
    }
  }

  const progress = Math.min(1, pull / SEUIL)

  return (
    <div onTouchStart={onTouchStart} onTouchMove={onTouchMove} onTouchEnd={onTouchEnd} className="md:contents">
      {/* Indicateur de tirage (mobile seulement) */}
      <div
        className="md:hidden flex items-end justify-center overflow-hidden pointer-events-none"
        style={{ height: pull, transition: actif.current ? 'none' : 'height 0.25s ease' }}
        aria-hidden
      >
        <div className="mb-2 inline-flex items-center justify-center h-9 w-9 rounded-full bg-white shadow-md ring-1 ring-zinc-200">
          <RefreshCw
            className={cn('h-5 w-5 text-emerald-600', refreshing && 'animate-spin')}
            style={{ transform: refreshing ? undefined : `rotate(${progress * 270}deg)`, opacity: 0.4 + progress * 0.6 }}
          />
        </div>
      </div>
      {children}
    </div>
  )
}
