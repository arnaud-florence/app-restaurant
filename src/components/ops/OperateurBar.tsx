'use client'

// Bandeau « opérateur » pour les tablettes partagées (modèle pro POS).
//  - Personne au poste → bouton « Prendre le poste » → clavier PIN.
//  - Opérateur identifié → « 👤 Anaïs · Quitter ». Toutes les actions du
//    service sont alors estampillées à son nom (côté serveur via cookie).
//  - Verrouillage automatique après INACTIVITÉ (5 min) → le poste se libère.
//
// L'identité circule via un cookie httpOnly signé (cf. lib/operateur.ts) ; ce
// composant ne fait que l'UI + les appels /api/operateur/*.

import { useEffect, useState, useCallback, useRef } from 'react'
import { Lock, LogOut, Loader2, Delete } from 'lucide-react'
import { cn } from '@/lib/utils'

type Operateur = { id: string; nom: string; poste: string | null }
const INACTIVITE_MS = 5 * 60 * 1000

export default function OperateurBar() {
  const [op, setOp] = useState<Operateur | null>(null)
  const [loaded, setLoaded] = useState(false)
  const [pad, setPad] = useState(false)
  const [pin, setPin] = useState('')
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const refresh = useCallback(async () => {
    try {
      const r = await fetch('/api/operateur/me', { cache: 'no-store' })
      const j = await r.json()
      setOp(j.operateur ?? null)
    } catch { /* */ } finally { setLoaded(true) }
  }, [])

  useEffect(() => { refresh() }, [refresh])

  const lock = useCallback(async () => {
    setBusy(true)
    try { await fetch('/api/operateur/logout', { method: 'POST' }) } catch { /* */ }
    setOp(null); setBusy(false)
  }, [])

  // Verrouillage auto par inactivité (uniquement quand un opérateur est au poste)
  useEffect(() => {
    if (!op) return
    const reset = () => {
      if (timer.current) clearTimeout(timer.current)
      timer.current = setTimeout(() => { lock() }, INACTIVITE_MS)
    }
    const evts = ['pointerdown', 'keydown', 'touchstart'] as const
    evts.forEach(e => window.addEventListener(e, reset, { passive: true }))
    reset()
    return () => {
      if (timer.current) clearTimeout(timer.current)
      evts.forEach(e => window.removeEventListener(e, reset))
    }
  }, [op, lock])

  async function valider() {
    if (pin.length < 4) return
    setBusy(true); setErr(null)
    try {
      const r = await fetch('/api/operateur/login', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin }),
      })
      const j = await r.json()
      if (j.ok) { setOp(j.operateur); setPad(false); setPin('') }
      else { setErr(j.error ?? 'PIN incorrect'); setPin('') }
    } catch { setErr('Erreur réseau') } finally { setBusy(false) }
  }

  if (!loaded) return null

  return (
    <>
      <div className="sticky top-0 z-30 flex items-center justify-between gap-2 px-3 py-1.5 bg-zinc-900/95 backdrop-blur border-b border-zinc-800 text-zinc-100"
        // --op-bar-h : exposé pour que les headers POS sticky se calent dessous
        // (top-[var(--op-bar-h)]) au lieu d'utiliser une valeur en dur 64px.
        style={{ paddingTop: 'max(0.375rem, env(safe-area-inset-top))', ['--op-bar-h' as string]: '48px' }}>
        {op ? (
          <>
            <span className="inline-flex items-center gap-2 text-sm font-bold min-w-0">
              <span className="h-2 w-2 rounded-full bg-emerald-400 shrink-0" />
              <span className="truncate">👤 {op.nom}</span>
              {op.poste && <span className="text-[11px] text-zinc-400 font-normal capitalize truncate">· {op.poste}</span>}
            </span>
            <button onClick={lock} disabled={busy}
              className="inline-flex items-center gap-1.5 min-h-[40px] px-3 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-sm font-semibold shrink-0">
              <LogOut className="h-4 w-4" /> Quitter
            </button>
          </>
        ) : (
          <>
            <span className="inline-flex items-center gap-2 text-sm text-zinc-400">
              <Lock className="h-4 w-4" /> Aucun opérateur au poste
            </span>
            <button onClick={() => { setPad(true); setErr(null); setPin('') }}
              className="inline-flex items-center gap-1.5 min-h-[40px] px-3 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-bold shrink-0">
              🔓 Prendre le poste
            </button>
          </>
        )}
      </div>

      {/* Clavier PIN */}
      {pad && (
        <div className="fixed inset-0 z-[70] bg-black/70 flex items-end sm:items-center justify-center p-0 sm:p-4"
          onClick={() => !busy && setPad(false)}>
          <div className="bg-zinc-900 text-zinc-100 w-full sm:max-w-xs rounded-t-2xl sm:rounded-2xl p-5 border border-zinc-800"
            onClick={e => e.stopPropagation()}
            style={{ paddingBottom: 'calc(1.25rem + env(safe-area-inset-bottom))' }}>
            <p className="text-center text-sm font-bold mb-1">Tape ton code</p>
            <p className="text-center text-[11px] text-zinc-400 mb-3">Tu prends le poste — tes actions seront à ton nom.</p>

            <div className="flex justify-center gap-2 mb-4 h-6">
              {Array.from({ length: Math.max(4, pin.length) }).map((_, i) => (
                <span key={i} className={cn('h-3.5 w-3.5 rounded-full', i < pin.length ? 'bg-emerald-400' : 'bg-zinc-700')} />
              ))}
            </div>

            {err && <p className="text-center text-sm text-red-400 mb-2">⚠️ {err}</p>}

            <div className="grid grid-cols-3 gap-2">
              {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map(d => (
                <button key={d} onClick={() => setPin(p => (p + d).slice(0, 6))}
                  className="min-h-[56px] rounded-xl bg-zinc-800 hover:bg-zinc-700 active:scale-95 text-2xl font-bold tabular-nums">{d}</button>
              ))}
              <button onClick={() => setPin(p => p.slice(0, -1))}
                className="min-h-[56px] rounded-xl bg-zinc-800 hover:bg-zinc-700 active:scale-95 flex items-center justify-center">
                <Delete className="h-6 w-6" />
              </button>
              <button onClick={() => setPin(p => (p + '0').slice(0, 6))}
                className="min-h-[56px] rounded-xl bg-zinc-800 hover:bg-zinc-700 active:scale-95 text-2xl font-bold tabular-nums">0</button>
              <button onClick={valider} disabled={pin.length < 4 || busy}
                className="min-h-[56px] rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:bg-zinc-700 disabled:text-zinc-500 active:scale-95 flex items-center justify-center font-bold">
                {busy ? <Loader2 className="h-6 w-6 animate-spin" /> : '✓'}
              </button>
            </div>

            <button onClick={() => setPad(false)} className="w-full mt-3 text-xs text-zinc-400 hover:text-zinc-200 min-h-[40px]">Annuler</button>
          </div>
        </div>
      )}
    </>
  )
}
