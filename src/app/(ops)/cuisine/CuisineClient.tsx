'use client'

import { useEffect, useMemo, useRef, useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { cn } from '@/lib/utils'
import {
  type CommandeService, type StatutArticle,
  playDing,
} from '@/lib/service'
import { changerStatutArticle } from '../actions'
import type { OpsBottomNavProfil } from '@/components/ops-nav-types'
import AgendaCreneauxColonnes from '@/components/AgendaCreneauxColonnes'
import TicketCommande from '@/components/ops/TicketCommande'
import TachesSequentielles from '@/components/TachesSequentielles'
import type { PosteWidget } from '@/lib/taches-du-jour'

type ColonneTag = 'CUISINE' | 'PIZZA'
type Role = 'cuisinier' | 'pizzaiolo'

export default function CuisineClient({
  initial, role = 'cuisinier', widgetPoste, navProfil, widgetEmployeId = null, widgetInitialDone = [],
}: {
  initial: CommandeService[]
  role?: Role
  widgetPoste?: PosteWidget
  navProfil?: OpsBottomNavProfil
  widgetEmployeId?: string | null
  widgetInitialDone?: string[]
}) {
  const router = useRouter()
  const [commandes, setCommandes] = useState(initial)
  const [now, setNow] = useState(() => Date.now())
  const [, startTransition] = useTransition()
  const previousIdsRef = useRef(new Set(initial.map(c => c.id)))
  const audioReadyRef = useRef(false)
  const [autoPrint, setAutoPrint] = useState(false)
  const [printJobs, setPrintJobs] = useState<Array<{ key: string; src: string }>>([])
  const [cb, setCb] = useState(false)   // mode daltonien : glyphes de forme

  // Persistance auto-print en localStorage (clé séparée par poste)
  const autoPrintKey = role === 'pizzaiolo' ? 'pizza_auto_print' : 'cuisine_auto_print'
  useEffect(() => {
    try { setAutoPrint(localStorage.getItem(autoPrintKey) === '1') } catch { /* ignore */ }
    try { setCb(localStorage.getItem('cb_mode') === '1') } catch { /* ignore */ }
  }, [autoPrintKey])
  function toggleAutoPrint() {
    setAutoPrint(v => {
      const nv = !v
      try { localStorage.setItem(autoPrintKey, nv ? '1' : '0') } catch { /* ignore */ }
      return nv
    })
  }
  function toggleCb() {
    setCb(v => {
      const nv = !v
      try { localStorage.setItem('cb_mode', nv ? '1' : '0') } catch { /* ignore */ }
      return nv
    })
  }

  // Tag affiché par ce poste (CUISINE pour cuisinier, PIZZA pour pizzaiolo)
  const monTag: ColonneTag = role === 'pizzaiolo' ? 'PIZZA' : 'CUISINE'

  // Tick minuteur (1 seconde)
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [])

  // Sync depuis props quand le server renvoie une nouvelle liste
  useEffect(() => {
    setCommandes(initial)
    // Détecte les nouvelles commandes : ding + auto-impression bons
    const newIds = new Set(initial.map(c => c.id))
    const nouvelles: typeof initial = []
    for (const c of initial) {
      if (!previousIdsRef.current.has(c.id)) nouvelles.push(c)
    }
    // Ne déclenche son/impression que si la commande a quelque chose POUR CE POSTE
    const nouvellesPourMoi = nouvelles.filter(c =>
      c.articles.some(a => a.tag_destination === monTag)
    )
    if (nouvellesPourMoi.length > 0 && audioReadyRef.current) playDing()
    if (nouvellesPourMoi.length > 0 && autoPrint) {
      const jobs: Array<{ key: string; src: string }> = []
      for (const c of nouvellesPourMoi) {
        jobs.push({ key: `${c.id}-${monTag}-${Date.now()}`, src: `/print/bons/${c.id}?dest=${monTag}&auto=1` })
      }
      if (jobs.length > 0) setPrintJobs(prev => [...prev, ...jobs])
    }
    previousIdsRef.current = newIds
  }, [initial, autoPrint, monTag])

  // Cleanup des iframes auto-print après 8s
  useEffect(() => {
    if (printJobs.length === 0) return
    const t = setTimeout(() => setPrintJobs([]), 8000)
    return () => clearTimeout(t)
  }, [printJobs])

  // Realtime : écoute les changements et déclenche router.refresh()
  useEffect(() => {
    const supabase = createClient()
    const channel = supabase
      .channel('cuisine-rt')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'commandes' }, () => {
        router.refresh()
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'commande_articles' }, () => {
        router.refresh()
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notifications' }, () => {
        router.refresh()
      })
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [router])

  // ─── Groupage par commande : on regroupe TOUS les articles tagués CUISINE/PIZZA
  // d'une même commande dans un seul ticket. Évite d'avoir N tickets pour N pizzas.
  const articlesParColonne = useMemo(() => {
    const out: Record<ColonneTag, Array<{ commande: CommandeService; articles: CommandeService['articles'] }>> = {
      CUISINE: [], PIZZA: [],
    }
    for (const tag of ['CUISINE', 'PIZZA'] as ColonneTag[]) {
      const map = new Map<string, CommandeService['articles']>()
      for (const c of commandes) {
        // Une commande BORNE/COMPTOIR non encore payée ne doit PAS apparaître en prep
        // (elle reste sur /emporter jusqu'à encaissement). Cf. règle métier multi-canal.
        if (c.statut === 'en_attente_paiement_comptoir') continue
        // La colonne CUISINE englobe aussi le SNACKING (même poste de prod) —
        // sinon un article tagué SNACKING n'apparaît sur aucun écran KDS.
        const articlesDuTag = c.articles.filter(a =>
          (a.tag_destination === tag || (tag === 'CUISINE' && a.tag_destination === 'SNACKING'))
          && a.statut !== 'servi')
        if (articlesDuTag.length === 0) continue
        // On indexe via la commande complète pour avoir created_at, source, etc.
        const existing = map.get(c.id)
        if (existing) existing.push(...articlesDuTag)
        else map.set(c.id, [...articlesDuTag])
      }
      // Reconstruit la liste en récupérant la commande
      for (const [cmdId, arts] of map.entries()) {
        const cmd = commandes.find(x => x.id === cmdId)
        if (cmd) out[tag].push({ commande: cmd, articles: arts })
      }
      // Tri par ancienneté
      out[tag].sort((a, b) => new Date(a.commande.created_at).getTime() - new Date(b.commande.created_at).getTime())
    }
    return out
  }, [commandes])

  // Compteurs en haut — comptés sur le MÊME ensemble que les tickets affichés
  // (articlesParColonne) : hérite de la fusion SNACKING→CUISINE et de l'exclusion
  // des commandes comptoir non payées. Sinon le badge ne collait pas aux tickets.
  const nbEnAttente = useMemo(
    () => articlesParColonne[monTag].reduce(
      (n, t) => n + t.articles.filter(a => a.statut === 'en_attente').length, 0),
    [articlesParColonne, monTag],
  )

  const tempsMoyen = useMemo(() => {
    // Ne compte que les tickets ENCORE en attente/préparation : un ticket dont tous
    // les articles sont déjà 'pret' reste affiché (règle d'or) mais n'est plus « en
    // cuisson », donc l'inclure gonflait artificiellement le temps moyen.
    const tickets = articlesParColonne[monTag].filter(
      t => t.articles.some(a => a.statut === 'en_attente' || a.statut === 'en_preparation'),
    )
    if (tickets.length === 0) return 0
    const total = tickets.reduce((s, t) => s + (now - new Date(t.commande.created_at).getTime()) / 60000, 0)
    return total / tickets.length
  }, [articlesParColonne, monTag, now])

  function transition(article_id: string, nouveau: StatutArticle) {
    // Optimistic update
    setCommandes(prev => prev.map(c => ({
      ...c,
      articles: c.articles.map(a => a.id === article_id ? { ...a, statut: nouveau } : a),
    })))
    startTransition(async () => {
      try { await changerStatutArticle({ article_id, nouveau_statut: nouveau }) }
      catch { router.refresh() }
    })
  }

  function activerSon() {
    audioReadyRef.current = true
    playDing()
  }

  return (
    <div className="min-h-screen flex flex-col pb-mobile-nav">
      {/* ═══ HEADER POS UNIFIÉ (style /serveur) ═══ */}
      <header className="sticky top-[var(--op-bar-h,0px)] z-20 bg-gradient-to-r from-zinc-900 via-zinc-900 to-zinc-950 border-b border-zinc-800 shadow-xl" style={{ paddingTop: 'env(safe-area-inset-top)' }}>
        {/* Mobile : titre visible + 2 lignes */}
        <div className="md:hidden p-2 space-y-2">
          <div className="flex items-center justify-center -mb-1">
            <h1 className="text-zinc-100 text-xs font-black uppercase tracking-[0.2em]">
              {role === 'pizzaiolo' ? '🍕 Pizza' : '👨‍🍳 Cuisine'}
            </h1>
          </div>
          <div className="flex items-center gap-1.5">
            <span className={cn(
              'inline-flex items-center justify-center w-12 h-12 rounded-xl text-white text-lg shadow-md shrink-0',
              role === 'pizzaiolo'
                ? 'bg-gradient-to-br from-red-500 to-red-700'
                : 'bg-gradient-to-br from-amber-500 to-amber-700',
            )}>
              {role === 'pizzaiolo' ? '🍕' : '👨‍🍳'}
            </span>
            <span className="flex-1 inline-flex items-center gap-1 px-2 h-12 rounded-xl bg-red-500/15 text-red-200 ring-1 ring-red-500/30 text-xs font-black tabular-nums">
              <span className="text-sm">🔔</span>
              <span>{nbEnAttente} en attente</span>
            </span>
            <span className="inline-flex items-center gap-1 px-2 h-12 rounded-xl bg-amber-500/15 text-amber-200 ring-1 ring-amber-500/30 text-xs font-black tabular-nums shrink-0">
              <span className="text-sm">⏱</span>{tempsMoyen.toFixed(0)}m
            </span>
            <Link
              href="/service"
              className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-zinc-100 hover:bg-white text-zinc-900 text-lg shadow-lg active:scale-95 shrink-0"
              aria-label="Centre opérationnel"
            >⊞</Link>
          </div>
          <div className="flex items-center gap-1.5">
            {!audioReadyRef.current && (
              <button
                onClick={activerSon}
                className="flex-1 inline-flex items-center justify-center gap-1 px-2 h-12 rounded-xl bg-zinc-800 text-zinc-200 text-xs font-black border border-zinc-700"
              >
                🔔 Activer son
              </button>
            )}
            <button
              onClick={toggleAutoPrint}
              className={cn(
                'flex-1 inline-flex items-center justify-center gap-1 px-2 h-12 rounded-xl text-xs font-black transition-colors',
                autoPrint
                  ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-500/30'
                  : 'bg-zinc-800 text-zinc-300 border border-zinc-700',
              )}
            >
              🖨 {autoPrint ? 'Auto ON' : 'Auto OFF'}
            </button>
            <button
              onClick={toggleCb}
              title="Mode daltonien : ajoute des formes (●◆■) aux couleurs"
              className={cn(
                'inline-flex items-center justify-center px-3 h-12 rounded-xl text-base font-black transition-colors shrink-0',
                cb ? 'bg-blue-600 text-white shadow-lg shadow-blue-500/30' : 'bg-zinc-800 text-zinc-300 border border-zinc-700',
              )}
            >◐</button>
          </div>
        </div>

        {/* Desktop : 1 ligne unique uniforme */}
        <div className="hidden md:flex px-3 h-14 items-center gap-2 overflow-x-auto whitespace-nowrap">
          <div className="inline-flex items-center gap-2 shrink-0">
            <span className={cn(
              'inline-flex items-center justify-center w-12 h-12 rounded-xl text-white text-xl shadow-md',
              role === 'pizzaiolo'
                ? 'bg-gradient-to-br from-red-500 to-red-700'
                : 'bg-gradient-to-br from-amber-500 to-amber-700',
            )}>
              {role === 'pizzaiolo' ? '🍕' : '👨‍🍳'}
            </span>
            <div className="block min-w-0 flex-1">
              <p className="text-[9px] font-black uppercase tracking-[0.2em] text-amber-400 leading-none">Service</p>
              <h1 className="font-display italic text-base font-medium text-white tracking-tight leading-none mt-0.5">
                {role === 'pizzaiolo' ? 'Pizzaiolo' : 'Cuisine'}
              </h1>
            </div>
          </div>
          <div className="inline-flex items-center gap-1.5 shrink-0">
            <span className={cn(
              'inline-flex items-center gap-1.5 px-2.5 h-12 rounded-xl ring-1 text-xs font-black tabular-nums whitespace-nowrap',
              nbEnAttente > 0
                ? 'bg-red-500/15 text-red-200 ring-red-500/30 animate-pulse'
                : 'bg-zinc-800 text-zinc-300 ring-zinc-700',
            )}>
              <span className="text-base">🔔</span>{nbEnAttente} en attente
            </span>
            <span className={cn(
              'inline-flex items-center gap-1.5 px-2.5 h-12 rounded-xl ring-1 text-xs font-black tabular-nums whitespace-nowrap',
              tempsMoyen > 15 ? 'bg-red-500/15 text-red-200 ring-red-500/30'
                : tempsMoyen > 10 ? 'bg-amber-500/15 text-amber-200 ring-amber-500/30'
                : 'bg-zinc-800 text-zinc-300 ring-zinc-700',
            )}>
              <span className="text-base">⏱</span>{tempsMoyen.toFixed(0)} min
            </span>
          </div>
          <div className="flex-1 min-w-2" />
          {!audioReadyRef.current && (
            <button
              onClick={activerSon}
              className="inline-flex items-center gap-2 px-2.5 h-12 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-black border border-zinc-700 shrink-0"
              title="Active le son pour les nouvelles commandes"
            >
              🔔 Activer son
            </button>
          )}
          <button
            onClick={toggleAutoPrint}
            className={cn(
              'inline-flex items-center gap-2 px-2.5 h-12 rounded-xl text-xs font-black transition-colors shrink-0',
              autoPrint
                ? 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-lg shadow-emerald-500/30'
                : 'bg-zinc-800 hover:bg-zinc-700 text-zinc-300 border border-zinc-700',
            )}
            title="Imprime automatiquement le bon dès qu'une nouvelle commande arrive"
          >
            🖨 Auto : {autoPrint ? 'ON' : 'OFF'}
          </button>
          <button
            onClick={toggleCb}
            title="Mode daltonien : ajoute des formes (●◆■) aux couleurs"
            className={cn(
              'inline-flex items-center gap-1.5 px-2.5 h-12 rounded-xl text-xs font-black transition-colors shrink-0',
              cb ? 'bg-blue-600 hover:bg-blue-500 text-white shadow-lg shadow-blue-500/30' : 'bg-zinc-800 hover:bg-zinc-700 text-zinc-300 border border-zinc-700',
            )}
          >
            ◐ {cb ? 'Daltonien ON' : 'Daltonien'}
          </button>
          <Link
            href="/service"
            className="inline-flex items-center gap-1.5 px-2.5 h-12 rounded-xl bg-zinc-100 hover:bg-white text-zinc-900 font-black text-sm shadow-lg transition-all active:scale-95 whitespace-nowrap shrink-0"
          >
            <span className="text-lg">⊞</span>
            <span>Service</span>
          </Link>
        </div>
      </header>

      {/* iframes cachées pour auto-impression bons */}
      {printJobs.map(j => (
        <iframe
          key={j.key}
          src={j.src}
          aria-hidden
          tabIndex={-1}
          style={{ position: 'fixed', width: 0, height: 0, border: 0, opacity: 0, pointerEvents: 'none' }}
        />
      ))}

      {/* Tâches séquentielles (Phase 2 — ancien widget retiré temporairement pour isoler le bug) */}
      <div className="px-3 pt-3 bg-zinc-900">
        <TachesSequentielles
          poste={widgetPoste ?? (role === 'pizzaiolo' ? 'pizzaiolo' : 'cuisinier')}
          employeId={widgetEmployeId}
          initialDone={widgetInitialDone}
          theme="dark"
        />
      </div>

      {/* ═══ MODE D'AFFICHAGE ═══
          - Cuisinier : FIFO horizontal (gauche → droite, ordre arrivée)
          - Pizzaiolo : AGENDA colonnes 15min (créneaux retrait)
          Justification : la pizza traite beaucoup d'emporter/livraison
          avec créneaux précis. La cuisine traite surtout du sur place. */}
      <main className="flex-1 p-3 sm:p-4">
        {role === 'pizzaiolo' ? (
          <PizzaAgenda
            articles={articlesParColonne.PIZZA}
            now={now}
            onTransition={transition}
            cb={cb}
          />
        ) : (
          <ColonneAgenda
            tag="CUISINE"
            icone="👨‍🍳"
            articles={articlesParColonne.CUISINE}
            now={now}
            onTransition={transition}
            cb={cb}
          />
        )}
      </main>
    </div>
  )
}

// ─── Cuisine = Flux FIFO horizontal (gauche → droite, ordre arrivée) ──
function ColonneAgenda({
  tag, icone, articles, now, onTransition, cb,
}: {
  tag: ColonneTag
  icone: string
  articles: Array<{ commande: CommandeService; articles: CommandeService['articles'] }>
  now: number
  onTransition: (id: string, nouveau: StatutArticle) => void
  cb: boolean
}) {
  // Tri par created_at croissant (FIFO : plus ancien à gauche, plus récent à droite)
  const ordered = useMemo(
    () => [...articles].sort(
      (a, b) => new Date(a.commande.created_at).getTime() - new Date(b.commande.created_at).getTime(),
    ),
    [articles],
  )

  if (articles.length === 0) {
    return (
      <div className="bg-zinc-900/40 rounded-2xl border border-dashed border-zinc-800 py-20 px-6 text-center">
        <p className="text-6xl mb-3">{icone}</p>
        <p className="text-base font-bold text-zinc-300">Aucune commande {tag.toLowerCase()} en attente</p>
        <p className="text-xs text-zinc-500 mt-1">Les commandes s'affichent ici dès qu'elles arrivent.</p>
      </div>
    )
  }

  return (
    <div className="space-y-2">
      {/* Bandeau de flux : indique l'ordre de traitement */}
      <header className="flex items-center gap-2 px-1 mb-2">
        <span className="inline-flex items-center gap-2 px-3 h-9 rounded-xl bg-zinc-900 ring-1 ring-zinc-700 text-white text-sm font-black shrink-0">
          <span className="text-base">{icone}</span>
          <span>Flux FIFO · gauche → droite</span>
        </span>
        <div className="flex-1 h-px bg-gradient-to-r from-zinc-700 to-transparent" />
        <span className="text-[10px] font-black uppercase tracking-[0.15em] text-zinc-500 shrink-0">
          {ordered.length} ticket{ordered.length > 1 ? 's' : ''}
        </span>
        <span className="inline-flex items-center gap-1 px-2 h-7 rounded-full bg-emerald-500/15 text-emerald-300 text-[10px] font-black tabular-nums shrink-0">
          <span>1er →</span>
          <span className="text-base">→</span>
          <span>← dernier</span>
        </span>
      </header>

      {/* Flux : vertical sur mobile (scroll naturel vers le bas, façon fil),
          horizontal côte-à-côte sur desktop (ordre d'arrivée FIFO gauche→droite). */}
      <div
        className="overflow-visible md:overflow-x-auto scroll-visible-dark pb-2"
        style={{ scrollSnapType: 'x mandatory', WebkitOverflowScrolling: 'touch' }}
      >
        <div className="flex flex-col md:flex-row items-stretch gap-3 lg:gap-4 md:min-w-max">
          {ordered.map(({ commande, articles: arts }, idx) => (
            <div
              key={commande.id}
              className="w-full md:w-[320px] lg:w-[360px] md:shrink-0 relative"
              style={{ scrollSnapAlign: 'start' }}
            >
              {/* Numéro d'ordre dans le flux (1er = le plus ancien) */}
              <span className={cn(
                'absolute -top-2 -left-2 z-10 inline-flex items-center justify-center min-w-8 h-8 px-2 rounded-full text-sm font-black tabular-nums shadow-lg ring-2 ring-zinc-950',
                idx === 0 ? 'bg-emerald-500 text-white animate-pulse' : 'bg-zinc-800 text-zinc-300',
              )}>
                {idx + 1}
              </span>
              <Ticket
                commande={commande}
                articles={arts}
                now={now}
                onTransition={onTransition}
                cb={cb}
              />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// ─── Ticket ──────────────────────────────────────────────────────────
function Ticket({
  commande, articles, now, onTransition, cb,
}: {
  commande: CommandeService
  articles: CommandeService['articles']
  now: number
  onTransition: (id: string, nouveau: StatutArticle) => void
  cb: boolean
}) {
  // Délègue au composant de ticket PARTAGÉ (cuisine = fond sombre + n° commande).
  return (
    <TicketCommande
      commande={commande}
      articles={articles}
      now={now}
      onTransition={onTransition}
      headerTone="plain"
      subtitle={commande.numero}
      cb={cb}
    />
  )
}

// ─── PizzaAgenda = AGENDA colonnes 15min (mode pizzaiolo) ────────────
// Comme emporter/livreur : tickets placés sous leur créneau de retrait.
// Les commandes sans créneau (sur place / comptoir) → colonne "Hors créneau".
function PizzaAgenda({
  articles, now, onTransition, cb,
}: {
  articles: Array<{ commande: CommandeService; articles: CommandeService['articles'] }>
  now: number
  onTransition: (id: string, nouveau: StatutArticle) => void
  cb: boolean
}) {
  if (articles.length === 0) {
    return (
      <div className="bg-zinc-900/40 rounded-2xl border border-dashed border-zinc-800 py-20 px-6 text-center">
        <p className="text-6xl mb-3">🍕</p>
        <p className="text-base font-bold text-zinc-300">Aucune commande pizza en attente</p>
        <p className="text-xs text-zinc-500 mt-1">Les commandes s'affichent ici dès qu'elles arrivent.</p>
      </div>
    )
  }
  return (
    <div className="space-y-2">
      <header className="flex items-center gap-2 px-1 mb-2">
        <span className="inline-flex items-center gap-2 px-3 h-9 rounded-xl bg-zinc-900 ring-1 ring-zinc-700 text-white text-sm font-black shrink-0">
          <span className="text-base">🍕</span>
          <span>Agenda · colonnes 15 min</span>
        </span>
        <div className="flex-1 h-px bg-gradient-to-r from-zinc-700 to-transparent" />
        <span className="text-[10px] font-black uppercase tracking-[0.15em] text-zinc-500 shrink-0">
          {articles.length} ticket{articles.length > 1 ? 's' : ''}
        </span>
        <span className="hidden sm:inline-flex items-center gap-1 px-2 h-7 rounded-full bg-red-500/15 text-red-300 text-[10px] font-black tabular-nums shrink-0">
          ⟵ Scroll horizontal ⟶
        </span>
      </header>
      <AgendaCreneauxColonnes
        items={articles.map(a => ({ creneauISO: a.commande.creneau_retrait, data: a }))}
        renderItem={({ commande, articles: arts }) => (
          <Ticket
            commande={commande}
            articles={arts}
            now={now}
            onTransition={onTransition}
            cb={cb}
          />
        )}
        accent="red"
        now={new Date(now)}
        columnWidth={300}
        // Commandes salle (sans créneau) + retards → placées dans la 1ère colonne
        // (= heure actuelle) par le composant directement. Plus de colonne séparée.
        emptyMessage="Aucune commande pizza dans l'agenda."
      />
    </div>
  )
}
