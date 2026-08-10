'use client'

// « Le coup de main d'Arnaud » — bannière live sur l'écran de poste.
// Détecte le poste via l'URL, interroge les nudges toutes les 40 s, joue un
// ding sur une nouvelle alerte rouge. Ton : collègue qui aide, pas flicage.

import { useEffect, useId, useRef, useState } from 'react'
import { usePathname } from 'next/navigation'
import { ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'
import { playDing } from '@/lib/service'
import { createClient } from '@/lib/supabase/client'
import { coupDeMainPoste, type CoupDeMain } from './coup-de-main-actions'

function posteDePath(p: string): string | null {
  if (p.startsWith('/cuisine')) return 'cuisine'
  if (p.startsWith('/pizza')) return 'pizza'
  if (p.startsWith('/bar')) return 'bar'
  if (p.startsWith('/serveur')) return 'serveur'
  if (p.startsWith('/emporter')) return 'emporter'
  return null
}

export default function CoupDeMainArnaud() {
  const pathname = usePathname()
  const poste = posteDePath(pathname || '')
  const channelId = useId()
  const [nudges, setNudges] = useState<CoupDeMain[]>([])
  const [ouvert, setOuvert] = useState(true)
  const prevCount = useRef(0)

  useEffect(() => {
    if (!poste) { setNudges([]); return }
    let alive = true
    let debounce: ReturnType<typeof setTimeout> | null = null

    const tick = async () => {
      try {
        const r = await coupDeMainPoste(poste)
        if (!alive) return
        if (r.length > prevCount.current && r.some(n => n.urgence === 'rouge')) {
          try { playDing() } catch { /* audio policy */ }
        }
        prevCount.current = r.length
        setNudges(r)
      } catch { /* réseau : on garde l'état précédent */ }
    }
    const tickDebounced = () => {
      if (debounce) clearTimeout(debounce)
      debounce = setTimeout(tick, 700)
    }

    tick()
    // Tick périodique : rattrape les seuils TEMPORELS (un plat qui passe +20 min
    // n'émet aucun événement DB) — le realtime gère le reste instantanément.
    const interval = setInterval(tick, 30000)

    // ⚡ Temps réel : réagit aux nouvelles commandes / changements de statut / alertes.
    const supabase = createClient()
    const channel = supabase
      .channel(`coup-de-main-${channelId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'commandes' }, tickDebounced)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'commande_articles' }, tickDebounced)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'agent_findings' }, tickDebounced)
      .subscribe()

    return () => {
      alive = false
      clearInterval(interval)
      if (debounce) clearTimeout(debounce)
      supabase.removeChannel(channel)
    }
  }, [poste, channelId])

  if (!poste || nudges.length === 0) return null
  const rouge = nudges.some(n => n.urgence === 'rouge')

  return (
    <div className="sticky z-30 top-[var(--op-bar-h,48px)] px-2 sm:px-3 pt-2">
      <div className={cn('rounded-2xl bg-zinc-900/95 backdrop-blur shadow-lg ring-1', rouge ? 'ring-red-500/40' : 'ring-amber-500/30')}>
        <button onClick={() => setOuvert(o => !o)} className="w-full flex items-center gap-2 px-3 py-2 text-left">
          <span className="text-base shrink-0">🧑‍💼</span>
          <span className={cn('text-[11px] font-black uppercase tracking-wider', rouge ? 'text-red-300' : 'text-amber-300')}>
            Le coup de main d'Arnaud
          </span>
          <span className="ml-1 inline-flex items-center justify-center h-5 min-w-5 px-1.5 rounded-full bg-white/10 text-[11px] font-black tabular-nums">{nudges.length}</span>
          <ChevronDown className={cn('h-4 w-4 ml-auto text-zinc-400 transition', ouvert ? 'rotate-180' : '')} />
        </button>
        {ouvert && (
          <div className="px-3 pb-2.5 space-y-1.5">
            {nudges.map(n => (
              <div key={n.id} className="flex items-start gap-2 text-sm leading-snug">
                <span className="shrink-0">{n.emoji}</span>
                <span className={cn('font-semibold', n.urgence === 'rouge' ? 'text-red-200' : n.urgence === 'orange' ? 'text-amber-200' : 'text-zinc-200')}>{n.texte}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
