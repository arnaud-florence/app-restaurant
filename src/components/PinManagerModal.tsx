'use client'

/**
 * Modal de saisie PIN manager (4-6 digits) avec clavier numérique tactile.
 * S'utilise pour protéger les actions sensibles sur tablette :
 *   - Encaisser une commande borne
 *   - Annuler une commande borne / autre action ops
 *
 * USAGE :
 *   const [pinOpen, setPinOpen] = useState(false)
 *   <PinManagerModal
 *     open={pinOpen}
 *     title="Encaisser commande #1234"
 *     onValid={(employeNom) => { setPinOpen(false); fairLAction(employeNom) }}
 *     onClose={() => setPinOpen(false)}
 *   />
 */

import { useEffect, useState } from 'react'
import { cn } from '@/lib/utils'
import { verifierPinManager } from '@/app/borne/pin-actions'

export default function PinManagerModal({
  open, title, subtitle, onValid, onClose,
}: {
  open: boolean
  title: string
  subtitle?: string
  onValid: (employeNom: string) => void
  onClose: () => void
}) {
  const [pin, setPin] = useState('')
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [lockSec, setLockSec] = useState(0)

  // Reset à l'ouverture
  useEffect(() => {
    if (open) { setPin(''); setErr(null); setLockSec(0) }
  }, [open])

  // Décompte lock
  useEffect(() => {
    if (lockSec <= 0) return
    const t = setInterval(() => setLockSec(s => Math.max(0, s - 1)), 1000)
    return () => clearInterval(t)
  }, [lockSec])

  // Auto-submit à 4 chiffres ou plus si user appuie sur OK
  async function tryValidate(p: string) {
    if (p.length < 4 || busy || lockSec > 0) return
    setBusy(true); setErr(null)
    try {
      const r = await verifierPinManager(p)
      if (r.ok) {
        onValid(r.employe_nom)
      } else if (r.reason === 'locked') {
        setLockSec(r.lockSecondsRemaining ?? 60)
        setPin('')
        setErr('🔒 Trop d\'essais — verrouillé')
      } else if (r.reason === 'invalid') {
        setErr('❌ PIN incorrect')
        setPin('')
      } else if (r.reason === 'no_manager') {
        setErr('Aucun manager n\'a de PIN défini')
        setPin('')
      } else {
        setErr('Format invalide')
        setPin('')
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Erreur')
    } finally {
      setBusy(false)
    }
  }

  function tap(d: string) {
    if (lockSec > 0) return
    setErr(null)
    setPin(prev => {
      const next = (prev + d).slice(0, 6)
      // Auto-submit à 4 chiffres
      if (next.length === 4) void tryValidate(next)
      return next
    })
  }
  function back() {
    if (lockSec > 0) return
    setPin(prev => prev.slice(0, -1))
    setErr(null)
  }
  function clear() {
    if (lockSec > 0) return
    setPin('')
    setErr(null)
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 z-[80] bg-black/85 backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="w-full max-w-sm bg-zinc-950 rounded-3xl border-2 border-zinc-800 shadow-2xl overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        <header className="px-6 py-5 text-center border-b border-zinc-800">
          <span className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-amber-500/15 text-amber-300 ring-1 ring-amber-500/40 text-2xl mb-3">🔒</span>
          <h2 className="font-display italic text-2xl text-white">{title}</h2>
          {subtitle && <p className="text-sm text-zinc-400 mt-1">{subtitle}</p>}
          <p className="text-[10px] uppercase tracking-widest text-zinc-500 font-bold mt-2">PIN manager</p>
        </header>

        {/* Affichage PIN (4-6 dots) */}
        <div className="px-6 py-4 flex items-center justify-center gap-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <span
              key={i}
              className={cn(
                'w-4 h-4 rounded-full transition-all',
                pin.length > i
                  ? 'bg-emerald-500 scale-110'
                  : 'bg-zinc-800 ring-1 ring-zinc-700',
              )}
            />
          ))}
        </div>

        {/* Erreur ou lock */}
        <div className="px-6 h-7 text-center">
          {lockSec > 0 ? (
            <p className="text-red-400 text-sm font-bold tabular-nums animate-pulse">🔒 Verrouillé · {lockSec}s</p>
          ) : err ? (
            <p className="text-red-400 text-sm font-bold">{err}</p>
          ) : busy ? (
            <p className="text-zinc-500 text-sm italic">Vérification…</p>
          ) : null}
        </div>

        {/* Clavier numérique tactile */}
        <div className="p-4 grid grid-cols-3 gap-2">
          {['1','2','3','4','5','6','7','8','9'].map(d => (
            <button
              key={d}
              onClick={() => tap(d)}
              disabled={busy || lockSec > 0}
              className="h-16 rounded-2xl bg-zinc-900 hover:bg-zinc-800 active:bg-zinc-700 text-white font-display italic text-3xl font-medium tabular-nums transition-all active:scale-95 disabled:opacity-40"
            >
              {d}
            </button>
          ))}
          <button
            onClick={clear}
            disabled={busy || lockSec > 0}
            className="h-16 rounded-2xl bg-zinc-900 hover:bg-zinc-800 text-zinc-400 text-xs font-black uppercase disabled:opacity-40"
          >
            Effacer
          </button>
          <button
            onClick={() => tap('0')}
            disabled={busy || lockSec > 0}
            className="h-16 rounded-2xl bg-zinc-900 hover:bg-zinc-800 active:bg-zinc-700 text-white font-display italic text-3xl font-medium tabular-nums transition-all active:scale-95 disabled:opacity-40"
          >
            0
          </button>
          <button
            onClick={back}
            disabled={busy || lockSec > 0}
            className="h-16 rounded-2xl bg-zinc-900 hover:bg-zinc-800 text-zinc-300 text-xl disabled:opacity-40"
          >
            ⌫
          </button>
        </div>

        {/* Actions */}
        <div className="p-4 pt-0 flex gap-2">
          <button
            onClick={onClose}
            className="flex-1 h-12 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-200 font-black uppercase tracking-wider text-sm"
          >
            Annuler
          </button>
          {pin.length >= 4 && pin.length < 6 && (
            <button
              onClick={() => tryValidate(pin)}
              disabled={busy || lockSec > 0}
              className="flex-1 h-12 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-white font-black uppercase tracking-wider text-sm shadow-lg shadow-emerald-500/30 disabled:opacity-40"
            >
              Valider
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
