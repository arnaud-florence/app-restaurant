'use client'

// Toasts in-app — remplacent les popups système natifs `alert()` qui, sur iOS
// PWA, ressemblent à des erreurs et déroutent un employé non technique.
//
// API impérative singleton (façon react-hot-toast), pas de hook à câbler dans
// chaque composant :
//
//   import { toast } from '@/lib/toast'
//   toast.error('Mince, réessaie')
//   toast.success('✓ Enregistré')
//   toast.info('Patiente…')
//
// Le rendu se fait par <Toaster /> monté une seule fois dans le root layout.

import { useEffect, useState } from 'react'

export type ToastType = 'success' | 'error' | 'info'
export type ToastItem = { id: number; type: ToastType; message: string; duration: number }

type Listener = (toasts: ToastItem[]) => void

let toasts: ToastItem[] = []
let listeners: Listener[] = []
let seq = 0

function emit() {
  for (const l of listeners) l(toasts)
}

function remove(id: number) {
  toasts = toasts.filter(t => t.id !== id)
  emit()
}

function push(type: ToastType, message: string, duration?: number): number {
  // Durée par défaut : erreurs un peu plus longues (on veut lire), succès courts.
  const d = duration ?? (type === 'error' ? 5000 : 3200)
  const id = ++seq
  toasts = [...toasts, { id, type, message: String(message ?? ''), duration: d }]
  emit()
  if (d > 0 && typeof window !== 'undefined') {
    window.setTimeout(() => remove(id), d)
  }
  return id
}

export const toast = {
  success: (msg: string, duration?: number) => push('success', msg, duration),
  error:   (msg: string, duration?: number) => push('error', msg, duration),
  info:    (msg: string, duration?: number) => push('info', msg, duration),
  dismiss: (id: number) => remove(id),
}

/** S'abonne au store de toasts. Usage interne (Toaster). */
export function useToasts(): ToastItem[] {
  const [items, setItems] = useState<ToastItem[]>(toasts)
  useEffect(() => {
    const l: Listener = next => setItems([...next])
    listeners = [...listeners, l]
    setItems([...toasts])
    return () => { listeners = listeners.filter(x => x !== l) }
  }, [])
  return items
}

const TONE: Record<ToastType, { ring: string; bar: string; icon: string }> = {
  success: { ring: 'border-emerald-200', bar: 'bg-emerald-500', icon: '✓' },
  error:   { ring: 'border-red-200',     bar: 'bg-red-500',     icon: '⚠️' },
  info:    { ring: 'border-blue-200',    bar: 'bg-blue-500',    icon: 'ℹ️' },
}

/**
 * Conteneur visuel. À monter une seule fois (root layout).
 * Positionné en haut-centre, au-dessus de tout (z très haut), respecte la
 * safe-area iOS. Toaster tap → dismiss. Empilement vertical.
 */
export function Toaster() {
  const items = useToasts()
  if (items.length === 0) return null
  return (
    <div
      className="fixed inset-x-0 top-0 z-[100] flex flex-col items-center gap-2 px-3 pointer-events-none"
      style={{ paddingTop: 'calc(env(safe-area-inset-top) + 10px)' }}
      aria-live="polite"
      aria-atomic="false"
    >
      {items.map(t => {
        const tone = TONE[t.type]
        return (
          <button
            key={t.id}
            type="button"
            onClick={() => toast.dismiss(t.id)}
            className={`pointer-events-auto w-full max-w-sm overflow-hidden rounded-2xl border ${tone.ring} bg-white text-left shadow-lg shadow-black/10 active:scale-[0.98] transition-transform animate-in fade-in slide-in-from-top-2 duration-300`}
            role="status"
          >
            <div className="flex items-start gap-3 px-4 py-3">
              <span className="text-lg leading-none mt-0.5 shrink-0" aria-hidden>{tone.icon}</span>
              <span className="flex-1 text-sm font-medium text-zinc-800 leading-snug break-words">{t.message}</span>
            </div>
            <span className={`block h-1 ${tone.bar} opacity-80`} aria-hidden />
          </button>
        )
      })}
    </div>
  )
}
