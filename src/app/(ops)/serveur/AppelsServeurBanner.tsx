'use client'

// Module 26 — Banner appels serveur en realtime sur /serveur.
// Charge les appels en_attente, écoute Realtime, joue un ding sur INSERT.

import { useEffect, useState, useTransition } from 'react'
import { Check, X, Bell, BellRing } from 'lucide-react'
import { cn } from '@/lib/utils'
import { createClient } from '@/lib/supabase/client'
import { type AppelServeur, MOTIF_INFO, ageMin } from '@/lib/affichage'
import { prendreEnChargeAppel, annulerAppel } from '@/app/admin/affichage/actions'
import { playDing } from '@/lib/service'

export default function AppelsServeurBanner({ serveurId }: { serveurId: string | null }) {
  const [appels, setAppels] = useState<AppelServeur[]>([])
  const [open, setOpen] = useState(true)
  const [, startTransition] = useTransition()

  useEffect(() => {
    const supabase = createClient()

    async function load() {
      const { data } = await supabase.from('appels_serveur')
        .select('id, table_id, table_numero, motif, message, statut, pris_par_id, pris_le, created_at')
        .eq('statut', 'en_attente')
        .order('created_at', { ascending: false })
      setAppels((data ?? []) as AppelServeur[])
    }
    load()

    const channel = supabase.channel('serveur-appels-rt')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'appels_serveur' }, payload => {
        const nouveau = payload.new as AppelServeur
        if (nouveau.statut === 'en_attente') {
          setAppels(prev => [nouveau, ...prev])
          try { playDing() } catch {}
          setOpen(true)
        }
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'appels_serveur' }, payload => {
        const maj = payload.new as AppelServeur
        setAppels(prev => maj.statut === 'en_attente'
          ? prev.map(a => a.id === maj.id ? maj : a)
          : prev.filter(a => a.id !== maj.id),
        )
      })
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'appels_serveur' }, payload => {
        const old = payload.old as { id?: string }
        setAppels(prev => prev.filter(a => a.id !== old.id))
      })
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [])

  if (appels.length === 0) return null

  return (
    <div className={cn(
      'sticky top-[64px] z-30 bg-red-600 text-white shadow-lg',
      open ? '' : 'h-10 overflow-hidden',
    )}>
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full px-4 py-2 flex items-center justify-between hover:bg-red-700 transition-colors"
      >
        <span className="flex items-center gap-2 font-bold">
          <BellRing className="h-5 w-5 animate-pulse" />
          {appels.length} appel{appels.length > 1 ? 's' : ''} en attente
        </span>
        <span className="text-xs">{open ? '▼' : '▲'}</span>
      </button>
      {open && (
        <ul className="px-4 pb-3 space-y-2">
          {appels.map(a => (
            <li key={a.id} className="bg-white/10 rounded-md p-2 flex items-center gap-3">
              <div className="text-2xl">{MOTIF_INFO[a.motif].emoji}</div>
              <div className="flex-1 min-w-0">
                <div className="font-bold">Table {a.table_numero ?? '?'} · {MOTIF_INFO[a.motif].label}</div>
                {a.message && <p className="text-sm opacity-90 truncate">{a.message}</p>}
                <p className="text-xs opacity-75">il y a {ageMin(a.created_at)} min</p>
              </div>
              <div className="flex gap-1">
                <button
                  onClick={() => startTransition(() => prendreEnChargeAppel(a.id, serveurId).catch(() => {}))}
                  className="px-2 py-1 bg-emerald-600 hover:bg-emerald-700 rounded text-sm font-semibold inline-flex items-center gap-1"
                ><Check className="h-4 w-4" /> Pris</button>
                <button
                  onClick={() => startTransition(() => annulerAppel(a.id).catch(() => {}))}
                  className="px-2 py-1 bg-zinc-700 hover:bg-zinc-800 rounded text-sm"
                ><X className="h-4 w-4" /></button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
