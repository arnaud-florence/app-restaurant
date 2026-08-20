'use client'

// KDS générique d'un comptoir (préparation) — réutilise TicketCommande + le
// pattern realtime de la cuisine. Filtre les articles du tag du point de vente
// (FOURNIL / SNACKING / BAR), groupés par commande, triés FIFO.

import { useEffect, useMemo, useRef, useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { cn } from '@/lib/utils'
import { type CommandeService, type StatutArticle, playDing } from '@/lib/service'
import { changerStatutArticle } from '../../../actions'
import TicketCommande from '@/components/ops/TicketCommande'
import { ACCENTS, type ComptoirDef } from '@/lib/comptoir/config'

export default function ComptoirKdsClient({ config, initial }: { config: ComptoirDef; initial: CommandeService[] }) {
  const router = useRouter()
  const a = ACCENTS[config.accent]
  const [commandes, setCommandes] = useState(initial)
  const [now, setNow] = useState(() => Date.now())
  const [, startTransition] = useTransition()
  const previousIdsRef = useRef(new Set(initial.map(c => c.id)))
  const audioReadyRef = useRef(false)
  const [cb, setCb] = useState(false)

  useEffect(() => { try { setCb(localStorage.getItem('cb_mode') === '1') } catch { /* ignore */ } }, [])

  // Tick minuteur (1s)
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [])

  // Sync depuis props + ding sur nouvelle commande de ce poste
  useEffect(() => {
    setCommandes(initial)
    const nouvelles = initial.filter(c => !previousIdsRef.current.has(c.id))
    const pourMoi = nouvelles.filter(c => c.articles.some(art => art.tag_destination === config.tag && art.statut !== 'servi'))
    if (pourMoi.length > 0 && audioReadyRef.current) playDing()
    previousIdsRef.current = new Set(initial.map(c => c.id))
  }, [initial, config.tag])

  // Realtime → refresh
  useEffect(() => {
    const supabase = createClient()
    const channel = supabase
      .channel(`comptoir-kds-${config.slug}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'commandes' }, () => router.refresh())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'commande_articles' }, () => router.refresh())
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [router, config.slug])

  // Groupage par commande : articles du tag, non servis, hors attente-paiement
  const tickets = useMemo(() => {
    const out: Array<{ commande: CommandeService; articles: CommandeService['articles'] }> = []
    for (const c of commandes) {
      if (c.statut === 'en_attente_paiement_comptoir') continue
      const arts = c.articles.filter(art => art.tag_destination === config.tag && art.statut !== 'servi')
      if (arts.length === 0) continue
      out.push({ commande: c, articles: arts })
    }
    out.sort((x, y) => new Date(x.commande.created_at).getTime() - new Date(y.commande.created_at).getTime())
    return out
  }, [commandes, config.tag])

  const nbEnAttente = tickets.reduce((n, t) => n + t.articles.filter(art => art.statut === 'en_attente').length, 0)

  function transition(article_id: string, nouveau: StatutArticle) {
    setCommandes(prev => prev.map(c => ({
      ...c,
      articles: c.articles.map(art => art.id === article_id ? { ...art, statut: nouveau } : art),
    })))
    startTransition(async () => {
      try { await changerStatutArticle({ article_id, nouveau_statut: nouveau }) }
      catch { router.refresh() }
    })
  }

  function activerSon() { audioReadyRef.current = true; playDing() }

  return (
    <div className="min-h-screen pb-mobile-nav bg-[#0D0D0D] text-zinc-100" style={{ paddingTop: 'env(safe-area-inset-top)' }}>
      <header className="sticky top-0 z-20 bg-gradient-to-b from-zinc-950 to-[#0D0D0D]/95 backdrop-blur border-b border-zinc-800 px-3 sm:px-5 py-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <span className={cn('inline-flex items-center justify-center w-12 h-12 rounded-xl bg-gradient-to-br text-white text-xl shadow-md shrink-0', a.headerIcon)}>{config.emoji}</span>
            <div className="min-w-0">
              <p className={cn('text-[10px] font-black uppercase tracking-[0.2em] leading-none', a.kicker)}>Préparation · KDS</p>
              <h1 className="font-display italic text-xl sm:text-2xl font-medium text-white leading-none mt-0.5 truncate">{config.label}</h1>
            </div>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <span className="inline-flex items-center gap-1 px-2.5 h-12 rounded-xl bg-red-500/15 text-red-200 ring-1 ring-red-500/30 text-xs font-black tabular-nums">
              🔔 {nbEnAttente}
            </span>
            <button onClick={activerSon} className="inline-flex items-center justify-center px-2.5 h-12 rounded-xl bg-zinc-800 text-zinc-200 text-xs font-bold active:scale-95" title="Activer le son">🔊</button>
            <Link href={`/comptoir/${config.slug}`} className="inline-flex items-center gap-1 px-3 h-12 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-100 font-bold text-sm active:scale-95" title="Prise de commande">🛒</Link>
            <Link href="/service" className="inline-flex items-center gap-1 px-3 h-12 rounded-xl bg-zinc-100 hover:bg-white text-zinc-900 font-black text-sm shadow-lg active:scale-95">
              <span className="text-lg">⊞</span><span className="hidden sm:inline">Service</span>
            </Link>
          </div>
        </div>
      </header>

      <div className="p-3 sm:p-5">
        {tickets.length === 0 ? (
          <div className="bg-zinc-900/40 rounded-2xl border border-dashed border-zinc-800 py-20 px-6 text-center">
            <p className="text-6xl mb-3">{config.emoji}</p>
            <p className="text-base font-bold text-zinc-300">Aucune commande en préparation</p>
            <p className="text-xs text-zinc-500 mt-1">Les commandes s&apos;affichent ici dès qu&apos;elles arrivent du comptoir.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
            {tickets.map(t => (
              <TicketCommande
                key={t.commande.id}
                commande={t.commande}
                articles={t.articles}
                now={now}
                onTransition={transition}
                headerTone="plain"
                subtitle={t.commande.numero}
                cb={cb}
                permetRemise
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
