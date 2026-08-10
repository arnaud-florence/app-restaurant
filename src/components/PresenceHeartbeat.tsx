'use client'

// Battement de présence : pour un employé connecté, signale toutes les ~60 s
// qu'il est actif + sur quel écran (POST /api/presence). Alimente la vue
// gérant « Équipe en direct ». No-op côté serveur si personne n'est connecté.
//
// Monté globalement dans le layout racine. Ignore les pages publiques /
// d'affichage où il n'y a jamais de session employé (évite des requêtes inutiles).

import { useEffect } from 'react'
import { usePathname } from 'next/navigation'

const SKIP_PREFIXES = ['/print', '/affichage', '/table', '/menu-allergenes', '/wifi-signup', '/client', '/legal', '/borne', '/login']
const INTERVAL_MS = 60_000

export default function PresenceHeartbeat() {
  const pathname = usePathname()

  useEffect(() => {
    if (!pathname || SKIP_PREFIXES.some(p => pathname === p || pathname.startsWith(p + '/'))) return

    const ping = () => {
      // Ne bat pas quand l'onglet est en arrière-plan (économise les requêtes).
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return
      fetch('/api/presence', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: pathname }),
        keepalive: true,
      }).catch(() => { /* best-effort */ })
    }

    ping() // immédiat à l'arrivée sur la page
    const id = setInterval(ping, INTERVAL_MS)
    const onVis = () => { if (document.visibilityState === 'visible') ping() }
    document.addEventListener('visibilitychange', onVis)
    return () => { clearInterval(id); document.removeEventListener('visibilitychange', onVis) }
  }, [pathname])

  return null
}
