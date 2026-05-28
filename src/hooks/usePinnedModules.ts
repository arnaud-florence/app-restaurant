'use client'

// Hook : gère la liste des sous-modules épinglés par l'utilisateur.
// Persisté en localStorage (clé 'pinned_modules' : JSON array de hrefs).
// Maximum MAX_PINNED chips épinglés pour éviter de surcharger la barre.

import { useCallback, useEffect, useState } from 'react'

export const MAX_PINNED = 5
const STORAGE_KEY = 'pinned_modules'

export function usePinnedModules(defaultPins?: string[]) {
  const [pinned, setPinned] = useState<string[]>([])

  // Hydrate depuis localStorage au mount
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      if (raw) {
        const arr = JSON.parse(raw)
        if (Array.isArray(arr) && arr.every(x => typeof x === 'string')) {
          setPinned(arr.slice(0, MAX_PINNED))
        }
      } else if (defaultPins && defaultPins.length > 0) {
        // 1ère utilisation (aucune préférence) : pré-épingle les écrans clés.
        const next = defaultPins.slice(0, MAX_PINNED)
        setPinned(next)
        try { localStorage.setItem(STORAGE_KEY, JSON.stringify(next)) } catch { /* ignore */ }
      }
    } catch { /* SSR / private mode */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Synchronise les changements entre onglets (storage event)
  useEffect(() => {
    function onStorage(e: StorageEvent) {
      if (e.key !== STORAGE_KEY) return
      try {
        const arr = e.newValue ? JSON.parse(e.newValue) : []
        if (Array.isArray(arr)) setPinned(arr.slice(0, MAX_PINNED))
      } catch { /* ignore */ }
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [])

  const persist = useCallback((next: string[]) => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(next)) } catch { /* ignore */ }
  }, [])

  const isPinned = useCallback((href: string) => pinned.includes(href), [pinned])

  const pin = useCallback((href: string) => {
    setPinned(prev => {
      if (prev.includes(href)) return prev
      if (prev.length >= MAX_PINNED) return prev
      const next = [...prev, href]
      persist(next)
      return next
    })
  }, [persist])

  const unpin = useCallback((href: string) => {
    setPinned(prev => {
      if (!prev.includes(href)) return prev
      const next = prev.filter(h => h !== href)
      persist(next)
      return next
    })
  }, [persist])

  const togglePin = useCallback((href: string) => {
    setPinned(prev => {
      let next: string[]
      if (prev.includes(href)) {
        next = prev.filter(h => h !== href)
      } else {
        if (prev.length >= MAX_PINNED) return prev
        next = [...prev, href]
      }
      persist(next)
      return next
    })
  }, [persist])

  return { pinned, isPinned, pin, unpin, togglePin, max: MAX_PINNED, count: pinned.length }
}
