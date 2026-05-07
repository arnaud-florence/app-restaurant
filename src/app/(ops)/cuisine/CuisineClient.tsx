'use client'

import { useEffect, useMemo, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { cn } from '@/lib/utils'
import {
  type CommandeService, type StatutArticle,
  STATUT_ARTICLE_LABEL, SOURCE_LABEL, statutMinuteur, STATUT_MINUTEUR_STYLE, formatEcoule, playDing,
} from '@/lib/service'
import { ALLERGENE_INFO, type Allergene } from '@/lib/allergenes'
import { changerStatutArticle } from '../actions'
import OpsBottomNav from '@/components/OpsBottomNav'

type ColonneTag = 'CUISINE' | 'PIZZA'
type Role = 'cuisinier' | 'pizzaiolo'

export default function CuisineClient({ initial, role = 'cuisinier' }: { initial: CommandeService[]; role?: Role }) {
  const router = useRouter()
  const [commandes, setCommandes] = useState(initial)
  const [now, setNow] = useState(() => Date.now())
  const [, startTransition] = useTransition()
  const previousIdsRef = useRef(new Set(initial.map(c => c.id)))
  const audioReadyRef = useRef(false)
  const [autoPrint, setAutoPrint] = useState(false)
  const [printJobs, setPrintJobs] = useState<Array<{ key: string; src: string }>>([])

  // Persistance auto-print en localStorage
  useEffect(() => {
    try { setAutoPrint(localStorage.getItem('cuisine_auto_print') === '1') } catch { /* ignore */ }
  }, [])
  function toggleAutoPrint() {
    setAutoPrint(v => {
      const nv = !v
      try { localStorage.setItem('cuisine_auto_print', nv ? '1' : '0') } catch { /* ignore */ }
      return nv
    })
  }

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
    if (nouvelles.length > 0 && audioReadyRef.current) playDing()
    if (nouvelles.length > 0 && autoPrint) {
      const jobs: Array<{ key: string; src: string }> = []
      for (const c of nouvelles) {
        const dests = new Set(c.articles
          .filter(a => a.tag_destination === 'CUISINE' || a.tag_destination === 'PIZZA')
          .map(a => a.tag_destination))
        for (const d of dests) {
          jobs.push({ key: `${c.id}-${d}-${Date.now()}`, src: `/print/bons/${c.id}?dest=${d}&auto=1` })
        }
      }
      if (jobs.length > 0) setPrintJobs(prev => [...prev, ...jobs])
    }
    previousIdsRef.current = newIds
  }, [initial, autoPrint])

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
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [router])

  // ─── Filtrage : articles tagués CUISINE ou PIZZA, hors statuts terminaux
  const articlesParColonne = useMemo(() => {
    const out: Record<ColonneTag, Array<{ commande: CommandeService; article: CommandeService['articles'][number] }>> = {
      CUISINE: [], PIZZA: [],
    }
    for (const c of commandes) {
      for (const a of c.articles) {
        if (a.tag_destination !== 'CUISINE' && a.tag_destination !== 'PIZZA') continue
        if (a.statut === 'servi') continue   // déjà parti côté serveur
        out[a.tag_destination as ColonneTag].push({ commande: c, article: a })
      }
    }
    // Tri par ancienneté (plus vieux en haut)
    for (const k of ['CUISINE', 'PIZZA'] as const) {
      out[k].sort((a, b) => new Date(a.commande.created_at).getTime() - new Date(b.commande.created_at).getTime())
    }
    return out
  }, [commandes])

  // Compteurs en haut
  const nbEnAttente = useMemo(() => {
    let n = 0
    for (const c of commandes) for (const a of c.articles) {
      if ((a.tag_destination === 'CUISINE' || a.tag_destination === 'PIZZA') && a.statut === 'en_attente') n++
    }
    return n
  }, [commandes])

  const tempsMoyen = useMemo(() => {
    const articles = [
      ...articlesParColonne.CUISINE,
      ...articlesParColonne.PIZZA,
    ]
    if (articles.length === 0) return 0
    const total = articles.reduce((s, x) => s + (now - new Date(x.commande.created_at).getTime()) / 60000, 0)
    return total / articles.length
  }, [articlesParColonne, now])

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
      {/* Bottom nav mobile (espace opérationnel — masqué pour le pizzaiolo
          qui a une vue concentrée sur sa colonne uniquement). */}
      {role !== 'pizzaiolo' && <OpsBottomNav />}
      {/* Header sombre */}
      <header className="sticky top-0 z-20 bg-zinc-900/95 backdrop-blur border-b border-zinc-800" style={{ paddingTop: 'env(safe-area-inset-top)' }}>
        <div className="px-4 py-3 flex items-center justify-between gap-3 flex-wrap">
          <div>
            <p className="text-xs font-bold uppercase tracking-wider text-zinc-400">
              {role === 'pizzaiolo' ? 'Service — Pizzeria' : 'Service — Atelier'}
            </p>
            <h1 className="text-2xl sm:text-3xl font-bold">
              {role === 'pizzaiolo' ? '🍕 Pizzaiolo' : '👨‍🍳 Cuisine'}
            </h1>
          </div>
          <div className="flex items-center gap-3">
            <KPI label="En attente" value={nbEnAttente} accent={nbEnAttente > 0 ? 'red' : 'default'} pulse={nbEnAttente > 0} />
            <KPI label="Temps moyen" value={`${tempsMoyen.toFixed(0)} min`} accent={tempsMoyen > 15 ? 'red' : tempsMoyen > 10 ? 'orange' : 'default'} />
            {!audioReadyRef.current && (
              <button
                onClick={activerSon}
                className="text-xs px-3 py-2 rounded-md bg-zinc-800 hover:bg-zinc-700 border border-zinc-700"
                title="Active le son pour les nouvelles commandes (limitation navigateur)"
              >
                🔔 Activer son
              </button>
            )}
            <button
              onClick={toggleAutoPrint}
              className={cn(
                'text-xs px-3 py-2 rounded-md border transition-colors',
                autoPrint
                  ? 'bg-emerald-600 border-emerald-500 text-white'
                  : 'bg-zinc-800 border-zinc-700 text-zinc-300 hover:bg-zinc-700'
              )}
              title="Imprime automatiquement le bon dès qu'une nouvelle commande arrive"
            >
              🖨 Auto-impression : {autoPrint ? 'ON' : 'OFF'}
            </button>
          </div>
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

      {/* Colonnes : pizzaiolo voit uniquement PIZZA, cuisinier voit les 2 */}
      <main className={cn('flex-1 grid gap-px bg-zinc-800', role === 'pizzaiolo' ? 'grid-cols-1' : 'grid-cols-1 md:grid-cols-2')}>
        {role !== 'pizzaiolo' && (
          <Colonne
            tag="CUISINE"
            icone="👨‍🍳"
            articles={articlesParColonne.CUISINE}
            now={now}
            onTransition={transition}
          />
        )}
        <Colonne
          tag="PIZZA"
          icone="🍕"
          articles={articlesParColonne.PIZZA}
          now={now}
          onTransition={transition}
        />
      </main>
    </div>
  )
}

// ─── Colonne (CUISINE ou PIZZA) ──────────────────────────────────────
function Colonne({
  tag, icone, articles, now, onTransition,
}: {
  tag: ColonneTag
  icone: string
  articles: Array<{ commande: CommandeService; article: CommandeService['articles'][number] }>
  now: number
  onTransition: (id: string, nouveau: StatutArticle) => void
}) {
  return (
    <section className="bg-[#0D0D0D] flex flex-col min-h-[60vh]">
      <div className="sticky top-[calc(env(safe-area-inset-top,0px)+72px)] z-10 px-4 py-2 bg-zinc-900/90 backdrop-blur border-b border-zinc-800 flex items-center justify-between">
        <h2 className="text-lg font-bold flex items-center gap-2">
          <span className="text-2xl">{icone}</span>
          <span>{tag}</span>
        </h2>
        <span className="text-xs text-zinc-400 tabular-nums">
          {articles.length} ticket{articles.length > 1 ? 's' : ''}
        </span>
      </div>
      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        {articles.length === 0 ? (
          <div className="text-center text-zinc-500 py-12">
            <p className="text-5xl mb-2">{icone}</p>
            <p className="text-sm">Aucun ticket {tag.toLowerCase()} en attente</p>
          </div>
        ) : (
          articles.map(({ commande, article }) => (
            <Ticket
              key={article.id}
              commande={commande}
              article={article}
              now={now}
              onTransition={onTransition}
            />
          ))
        )}
      </div>
    </section>
  )
}

// ─── Ticket ──────────────────────────────────────────────────────────
function Ticket({
  commande, article, now, onTransition,
}: {
  commande: CommandeService
  article: CommandeService['articles'][number]
  now: number
  onTransition: (id: string, nouveau: StatutArticle) => void
}) {
  const min = statutMinuteur(commande.created_at, now)
  const minSty = STATUT_MINUTEUR_STYLE[min]
  const sourceSty = SOURCE_LABEL[commande.source]
  const statutSty = STATUT_ARTICLE_LABEL[article.statut]

  const nextStatut: StatutArticle | null =
    article.statut === 'en_attente' ? 'en_preparation' :
    article.statut === 'en_preparation' ? 'pret' :
    null

  return (
    <div className={cn(
      'rounded-lg border-2 bg-zinc-900 overflow-hidden',
      article.statut === 'en_attente'     ? 'border-blue-500/50' :
      article.statut === 'en_preparation' ? 'border-amber-500/50' :
      article.statut === 'pret'           ? 'border-emerald-500/70' :
                                             'border-zinc-700'
    )}>
      {/* Header ticket : source + table + minuteur */}
      <div className="px-3 py-2 flex items-center justify-between gap-2 bg-zinc-950">
        <div className="flex items-center gap-2 min-w-0">
          <span className={cn('text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded', sourceSty.bg, sourceSty.text)}>
            {sourceSty.emoji} {sourceSty.label}
          </span>
          {commande.numero_table && (
            <span className="text-sm font-bold text-zinc-100">T{commande.numero_table}</span>
          )}
          <span className="text-[10px] text-zinc-500 truncate">{commande.numero}</span>
        </div>
        <div className="flex items-center gap-1.5">
          <a
            href={`/print/bons/${commande.id}?dest=${article.tag_destination}`}
            target="_blank"
            rel="noopener"
            className="text-xs h-7 px-2 inline-flex items-center rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-200 font-bold"
            title="Réimprimer le bon de préparation"
          >🖨</a>
          <div className={cn('text-sm font-bold tabular-nums px-2 py-0.5 rounded', minSty.bg, minSty.text)}>
            ⏱ {formatEcoule(commande.created_at, now)}
          </div>
        </div>
      </div>

      {/* Corps : article(s) */}
      <div className="px-3 py-3">
        {article.allergenes_a_eviter.length > 0 && (
          <div className="mb-2 -mx-3 -mt-3 px-3 py-2 bg-red-600 text-white border-b-4 border-red-300 animate-pulse">
            <p className="text-[10px] font-black uppercase tracking-wider opacity-90">🚨 ALLERGIE CLIENT</p>
            <p className="text-sm font-bold mt-0.5">
              ⛔ Éviter : {article.allergenes_a_eviter.map(a => {
                const info = ALLERGENE_INFO[a as Allergene]
                return info ? `${info.emoji} ${info.label}` : a
              }).join(' · ')}
            </p>
          </div>
        )}
        <div className="flex items-baseline gap-2">
          <span className="text-3xl font-bold tabular-nums">×{article.quantite}</span>
          <p className="text-lg font-semibold leading-tight">{article.recette_nom}</p>
        </div>
        {article.commentaire && (
          <p className="mt-2 text-sm text-amber-300 bg-amber-900/30 border border-amber-800 rounded px-2 py-1.5 italic">
            ⚠ {article.commentaire}
          </p>
        )}
        {commande.notes && (
          <p className="mt-2 text-xs text-zinc-400 italic">📝 {commande.notes}</p>
        )}
        {commande.serveur_nom && (
          <p className="mt-2 text-[10px] text-zinc-500">Serveur : {commande.serveur_nom}</p>
        )}
      </div>

      {/* Statut + bouton transition */}
      <div className="px-3 pb-3 flex items-center gap-2">
        <span className={cn('flex-1 text-center text-sm font-bold uppercase tracking-wider py-2 rounded-md', statutSty.bg, statutSty.text)}>
          {statutSty.emoji} {statutSty.label}
        </span>
        {nextStatut && (
          <button
            onClick={() => onTransition(article.id, nextStatut)}
            className={cn(
              'min-h-[48px] px-4 py-2 rounded-md font-bold text-sm uppercase tracking-wider transition-colors active:scale-[0.97]',
              article.statut === 'en_attente'
                ? 'bg-amber-500 text-white hover:bg-amber-400'
                : 'bg-emerald-500 text-white hover:bg-emerald-400'
            )}
          >
            {article.statut === 'en_attente' ? '🔥 Prendre' : '✓ Prêt'}
          </button>
        )}
      </div>
    </div>
  )
}

// ─── KPI ─────────────────────────────────────────────────────────────
function KPI({ label, value, accent = 'default', pulse }: {
  label: string
  value: string | number
  accent?: 'default' | 'red' | 'orange'
  pulse?: boolean
}) {
  const cls = {
    default: 'bg-zinc-800 text-zinc-100',
    red:     'bg-red-600 text-white',
    orange:  'bg-amber-500 text-white',
  }[accent]
  return (
    <div className={cn('rounded-md px-3 py-1.5 text-center min-w-20', cls, pulse && 'animate-pulse')}>
      <p className="text-[10px] uppercase tracking-wider opacity-80">{label}</p>
      <p className="text-base font-bold tabular-nums leading-tight">{value}</p>
    </div>
  )
}
