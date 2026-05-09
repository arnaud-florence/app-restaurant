'use client'

// Indicateur global : bandeau rouge fixe en haut quand le navigateur perd sa connexion.
// Listen `online`/`offline` events. Auto-cache et retour quand la connexion revient.

import { useEffect, useState } from 'react'

export default function OfflineIndicator() {
  // Default true : on assume online jusqu'à preuve du contraire
  const [online, setOnline] = useState(true)

  useEffect(() => {
    // Initialise depuis l'état réel au mount (évite SSR mismatch)
    setOnline(navigator.onLine)

    const goOnline  = () => setOnline(true)
    const goOffline = () => setOnline(false)
    window.addEventListener('online',  goOnline)
    window.addEventListener('offline', goOffline)
    return () => {
      window.removeEventListener('online',  goOnline)
      window.removeEventListener('offline', goOffline)
    }
  }, [])

  if (online) return null

  return (
    <div
      className="fixed top-0 left-0 right-0 z-[9999] bg-red-600 text-white text-center py-1.5 px-3 text-sm font-medium shadow-lg"
      style={{ animation: 'pulse 2s ease-in-out infinite' }}
      role="alert"
    >
      <span className="inline-flex items-center gap-2">
        <span className="inline-block w-2 h-2 bg-white rounded-full animate-ping" />
        📡 Hors-ligne — saisie / encaissement indisponibles. Connexion auto à retour réseau.
      </span>
    </div>
  )
}
