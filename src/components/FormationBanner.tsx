'use client'

// Bandeau global « MODE FORMATION » affiché quand le flag parametres.mode_formation
// est actif. Sert à prévenir tout le monde que les données affichées sont des
// données d'exercice (rien n'est réel) pendant la phase de prise en main.
//
// Masqué sur les pages d'impression (/print) et l'écran TV public (/affichage)
// pour ne pas polluer ces sorties.

import { useEffect, useState } from 'react'
import { usePathname } from 'next/navigation'

export default function FormationBanner() {
  const pathname = usePathname()
  const [active, setActive] = useState(false)

  useEffect(() => {
    let alive = true
    fetch('/api/mode-formation', { cache: 'no-store' })
      .then(r => r.json())
      .then(j => { if (alive) setActive(Boolean(j?.active)) })
      .catch(() => { /* silencieux */ })
    return () => { alive = false }
  }, [pathname])

  // Pas de bandeau sur l'impression ni la TV publique
  if (!active) return null
  if (pathname?.startsWith('/print') || pathname?.startsWith('/affichage')) return null

  return (
    <div
      role="status"
      className="w-full bg-amber-400 text-amber-950 text-center text-xs sm:text-sm font-bold px-3 py-1.5 border-b-2 border-amber-600"
      style={{ paddingTop: 'max(0.375rem, env(safe-area-inset-top))' }}
    >
      🎓 MODE FORMATION — données d&apos;exercice, rien n&apos;est réel. Tout sera remis à zéro avant l&apos;ouverture.
    </div>
  )
}
