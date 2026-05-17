'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { cn } from '@/lib/utils'
import { definirPinManager } from '@/app/borne/pin-actions'

type Manager = { id: string; prenom: string; nom: string; hasPin: boolean }

export default function BornePinClient({ managers }: { managers: Manager[] }) {
  const router = useRouter()
  const [employeId, setEmployeId] = useState(managers[0]?.id ?? '')
  const [pin, setPin] = useState('')
  const [confirm, setConfirm] = useState('')
  const [err, setErr] = useState<string | null>(null)
  const [ok, setOk] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  function submit(e: React.FormEvent) {
    e.preventDefault()
    setErr(null); setOk(null)
    if (!/^\d{4,6}$/.test(pin)) { setErr('PIN : 4 à 6 chiffres uniquement'); return }
    if (pin !== confirm)         { setErr('Les deux PIN ne correspondent pas'); return }
    startTransition(async () => {
      try {
        await definirPinManager({ employe_id: employeId, pin })
        setOk('✓ PIN enregistré')
        setPin(''); setConfirm('')
        router.refresh()
      } catch (e2) {
        setErr(e2 instanceof Error ? e2.message : 'Erreur')
      }
    })
  }

  return (
    <main className="max-w-2xl mx-auto p-6 space-y-6">
      <div className="flex items-start gap-3">
        <span className="inline-flex items-center justify-center w-12 h-12 rounded-2xl bg-amber-500/15 text-amber-300 ring-1 ring-amber-500/40 text-xl">🔒</span>
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-amber-600 leading-none">Sécurité</p>
          <h1 className="font-display italic text-3xl font-medium tracking-tight mt-1">PIN manager — Borne</h1>
          <p className="text-sm text-zinc-500 mt-2">
            Définit le PIN à 4-6 chiffres requis pour <strong>encaisser ou annuler</strong> une commande borne depuis /caisse.
            3 essais ratés → verrouillage 60 s.
          </p>
        </div>
      </div>

      {managers.length === 0 ? (
        <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm">
          ⚠ Aucun manager actif. Crée-le d&apos;abord dans <a href="/admin/rh" className="underline font-bold">/admin/rh</a>.
        </div>
      ) : (
        <form onSubmit={submit} className="rounded-2xl border border-zinc-200 bg-white p-5 space-y-4 shadow-sm">
          <div>
            <label className="text-xs font-black uppercase tracking-widest text-zinc-500">Manager</label>
            <select
              value={employeId}
              onChange={e => setEmployeId(e.target.value)}
              className="mt-1 w-full h-11 px-3 rounded-xl border border-zinc-300 bg-white text-zinc-900"
            >
              {managers.map(m => (
                <option key={m.id} value={m.id}>
                  {m.prenom} {m.nom} {m.hasPin ? '· ✓ PIN défini' : '· ⚠ pas de PIN'}
                </option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-black uppercase tracking-widest text-zinc-500">Nouveau PIN</label>
              <input
                type="password"
                inputMode="numeric"
                pattern="[0-9]{4,6}"
                maxLength={6}
                value={pin}
                onChange={e => setPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
                className="mt-1 w-full h-12 px-3 rounded-xl border border-zinc-300 bg-white text-zinc-900 text-2xl tabular-nums tracking-widest text-center"
                placeholder="••••"
              />
            </div>
            <div>
              <label className="text-xs font-black uppercase tracking-widest text-zinc-500">Confirmer</label>
              <input
                type="password"
                inputMode="numeric"
                pattern="[0-9]{4,6}"
                maxLength={6}
                value={confirm}
                onChange={e => setConfirm(e.target.value.replace(/\D/g, '').slice(0, 6))}
                className="mt-1 w-full h-12 px-3 rounded-xl border border-zinc-300 bg-white text-zinc-900 text-2xl tabular-nums tracking-widest text-center"
                placeholder="••••"
              />
            </div>
          </div>
          {err && <p className="text-red-600 text-sm font-bold">{err}</p>}
          {ok && <p className="text-emerald-600 text-sm font-bold">{ok}</p>}
          <div className="flex items-center gap-2">
            <button
              type="submit"
              disabled={pending || !pin || !confirm || !employeId}
              className={cn(
                'h-12 px-6 rounded-xl font-black uppercase tracking-wider text-sm transition-all',
                pending || !pin || !confirm
                  ? 'bg-zinc-200 text-zinc-400'
                  : 'bg-emerald-500 hover:bg-emerald-400 text-white shadow active:scale-95',
              )}
            >
              {pending ? 'Enregistrement…' : 'Enregistrer'}
            </button>
            <p className="text-xs text-zinc-500 italic">Le PIN est hashé SHA-256 + salt unique par manager.</p>
          </div>
        </form>
      )}
    </main>
  )
}
