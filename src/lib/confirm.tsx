'use client'

// Confirmation in-app — remplace le confirm() natif de l'OS (boîte grise
// bloquante « façon 2010 ») par une modale douce façon Facebook/Instagram :
// monte du bas sur mobile (bottom-sheet), fond flou, gros boutons, action
// destructive en rouge.
//
// API impérative singleton (comme @/lib/toast), renvoie une Promise<boolean> :
//
//   import { askConfirm } from '@/lib/confirm'
//   if (!(await askConfirm('Supprimer ce fournisseur ?'))) return
//   // ... ou avec options :
//   const ok = await askConfirm({
//     title: 'Annuler la réservation ?',
//     message: 'Le client sera notifié. Action irréversible.',
//     confirmLabel: 'Annuler la résa',
//     danger: true,
//   })
//
// Rendu par <ConfirmHost /> monté une seule fois dans le root layout.

import { useEffect, useState } from 'react'

export type ConfirmOptions = {
  title?: string
  message: string
  confirmLabel?: string
  cancelLabel?: string
  /** Bouton de confirmation en rouge (suppression/annulation). Défaut : true. */
  danger?: boolean
}

type Pending = ConfirmOptions & { id: number; resolve: (v: boolean) => void }

let listeners: Array<(p: Pending | null) => void> = []
let current: Pending | null = null
let seq = 0

function emit() { for (const l of listeners) l(current) }

/** Ouvre une confirmation. Résout `true` si l'utilisateur confirme, `false` sinon. */
export function askConfirm(opts: ConfirmOptions | string): Promise<boolean> {
  const o: ConfirmOptions = typeof opts === 'string' ? { message: opts } : opts
  return new Promise<boolean>(resolve => {
    // Si une confirmation est déjà ouverte, on la referme en "annulé".
    if (current) current.resolve(false)
    current = { id: ++seq, danger: true, ...o, resolve }
    emit()
  })
}

function settle(v: boolean) {
  if (current) { current.resolve(v); current = null; emit() }
}

/** Conteneur visuel. À monter une seule fois (root layout). */
export function ConfirmHost() {
  const [p, setP] = useState<Pending | null>(current)
  useEffect(() => {
    const l = (x: Pending | null) => setP(x)
    listeners = [...listeners, l]
    setP(current)
    return () => { listeners = listeners.filter(f => f !== l) }
  }, [])

  useEffect(() => {
    if (!p) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') settle(false)
      if (e.key === 'Enter') settle(true)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [p])

  if (!p) return null
  return (
    <div className="fixed inset-0 z-[110] flex items-end sm:items-center justify-center" role="dialog" aria-modal="true">
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm animate-in fade-in duration-200"
        onClick={() => settle(false)}
        aria-hidden
      />
      <div
        className="relative w-full sm:max-w-sm bg-white rounded-t-3xl sm:rounded-3xl shadow-2xl shadow-black/30 px-5 pt-5 animate-in slide-in-from-bottom-4 sm:zoom-in-95 duration-200"
        style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 1.25rem)' }}
      >
        {/* petite poignée façon bottom-sheet mobile */}
        <div className="sm:hidden mx-auto mb-3 h-1 w-10 rounded-full bg-zinc-300" aria-hidden />
        {p.title && <h2 className="text-lg font-bold text-zinc-900 mb-1.5">{p.title}</h2>}
        <p className="text-[15px] text-zinc-600 leading-snug whitespace-pre-line">{p.message}</p>
        <div className="mt-5 flex flex-col-reverse sm:flex-row gap-2.5 sm:justify-end">
          <button
            type="button"
            onClick={() => settle(false)}
            className="min-h-[48px] px-5 rounded-2xl font-semibold text-zinc-700 bg-zinc-100 hover:bg-zinc-200 active:scale-[0.97] transition"
          >
            {p.cancelLabel ?? 'Annuler'}
          </button>
          <button
            type="button"
            autoFocus
            onClick={() => settle(true)}
            className={`min-h-[48px] px-5 rounded-2xl font-bold text-white active:scale-[0.97] transition ${
              p.danger ? 'bg-red-600 hover:bg-red-700' : 'bg-emerald-600 hover:bg-emerald-700'
            }`}
          >
            {p.confirmLabel ?? 'Confirmer'}
          </button>
        </div>
      </div>
    </div>
  )
}
