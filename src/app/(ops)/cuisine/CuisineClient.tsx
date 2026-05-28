'use client'

import { useEffect, useMemo, useRef, useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { cn } from '@/lib/utils'
import {
  type CommandeService, type StatutArticle,
  STATUT_ARTICLE_LABEL, SOURCE_LABEL, TAG_DEST_LABEL as TAG_DEST_LABEL_LOCAL, statutMinuteur, STATUT_MINUTEUR_STYLE, formatEcoule, playDing,
} from '@/lib/service'
import { ALLERGENE_INFO, type Allergene } from '@/lib/allergenes'
import { changerStatutArticle } from '../actions'
import OpsBottomNav, { type OpsBottomNavProfil } from '@/components/OpsBottomNav'
import AgendaCreneauxColonnes from '@/components/AgendaCreneauxColonnes'
import TachesDuJourWidget from '@/components/TachesDuJourWidget'
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

  // Persistance auto-print en localStorage (clé séparée par poste)
  const autoPrintKey = role === 'pizzaiolo' ? 'pizza_auto_print' : 'cuisine_auto_print'
  useEffect(() => {
    try { setAutoPrint(localStorage.getItem(autoPrintKey) === '1') } catch { /* ignore */ }
  }, [autoPrintKey])
  function toggleAutoPrint() {
    setAutoPrint(v => {
      const nv = !v
      try { localStorage.setItem(autoPrintKey, nv ? '1' : '0') } catch { /* ignore */ }
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
        const articlesDuTag = c.articles.filter(a => a.tag_destination === tag && a.statut !== 'servi')
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

  // Compteurs en haut — restreints à la colonne du rôle
  const nbEnAttente = useMemo(() => {
    let n = 0
    for (const c of commandes) for (const a of c.articles) {
      if (a.tag_destination === monTag && a.statut === 'en_attente') n++
    }
    return n
  }, [commandes, monTag])

  const tempsMoyen = useMemo(() => {
    const articles = articlesParColonne[monTag]
    if (articles.length === 0) return 0
    const total = articles.reduce((s, x) => s + (now - new Date(x.commande.created_at).getTime()) / 60000, 0)
    return total / articles.length
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
      <OpsBottomNav profil={navProfil} />
      {/* ═══ HEADER POS UNIFIÉ (style /serveur) ═══ */}
      <header className="sticky top-0 z-20 bg-gradient-to-r from-zinc-900 via-zinc-900 to-zinc-950 border-b border-zinc-800 shadow-xl" style={{ paddingTop: 'env(safe-area-inset-top)' }}>
        {/* Mobile : 2 lignes */}
        <div className="md:hidden p-2 space-y-2">
          <div className="flex items-center gap-1.5">
            <span className={cn(
              'inline-flex items-center justify-center w-10 h-10 rounded-xl text-white text-lg shadow-md shrink-0',
              role === 'pizzaiolo'
                ? 'bg-gradient-to-br from-red-500 to-red-700'
                : 'bg-gradient-to-br from-amber-500 to-amber-700',
            )}>
              {role === 'pizzaiolo' ? '🍕' : '👨‍🍳'}
            </span>
            <span className="flex-1 inline-flex items-center gap-1 px-2 h-10 rounded-xl bg-red-500/15 text-red-200 ring-1 ring-red-500/30 text-xs font-black tabular-nums">
              <span className="text-sm">🔔</span>
              <span>{nbEnAttente} en attente</span>
            </span>
            <span className="inline-flex items-center gap-1 px-2 h-10 rounded-xl bg-amber-500/15 text-amber-200 ring-1 ring-amber-500/30 text-xs font-black tabular-nums shrink-0">
              <span className="text-sm">⏱</span>{tempsMoyen.toFixed(0)}m
            </span>
            <Link
              href="/caisse"
              className="inline-flex items-center justify-center w-10 h-10 rounded-xl bg-zinc-100 hover:bg-white text-zinc-900 text-lg shadow-lg active:scale-95 shrink-0"
              aria-label="Caisse"
            >💰</Link>
          </div>
          <div className="flex items-center gap-1.5">
            {!audioReadyRef.current && (
              <button
                onClick={activerSon}
                className="flex-1 inline-flex items-center justify-center gap-1 px-2 h-10 rounded-xl bg-zinc-800 text-zinc-200 text-xs font-black border border-zinc-700"
              >
                🔔 Activer son
              </button>
            )}
            <button
              onClick={toggleAutoPrint}
              className={cn(
                'flex-1 inline-flex items-center justify-center gap-1 px-2 h-10 rounded-xl text-xs font-black transition-colors',
                autoPrint
                  ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-500/30'
                  : 'bg-zinc-800 text-zinc-300 border border-zinc-700',
              )}
            >
              🖨 {autoPrint ? 'Auto ON' : 'Auto OFF'}
            </button>
          </div>
        </div>

        {/* Desktop : 1 ligne unique uniforme */}
        <div className="hidden md:flex px-3 h-14 items-center gap-2 overflow-x-auto whitespace-nowrap">
          <div className="inline-flex items-center gap-2 shrink-0">
            <span className={cn(
              'inline-flex items-center justify-center w-10 h-10 rounded-xl text-white text-xl shadow-md',
              role === 'pizzaiolo'
                ? 'bg-gradient-to-br from-red-500 to-red-700'
                : 'bg-gradient-to-br from-amber-500 to-amber-700',
            )}>
              {role === 'pizzaiolo' ? '🍕' : '👨‍🍳'}
            </span>
            <div className="hidden lg:block">
              <p className="text-[9px] font-black uppercase tracking-[0.2em] text-amber-400 leading-none">Service</p>
              <h1 className="font-display italic text-base font-medium text-white tracking-tight leading-none mt-0.5">
                {role === 'pizzaiolo' ? 'Pizzaiolo' : 'Cuisine'}
              </h1>
            </div>
          </div>
          <div className="inline-flex items-center gap-1.5 shrink-0">
            <span className={cn(
              'inline-flex items-center gap-1.5 px-2.5 h-10 rounded-xl ring-1 text-xs font-black tabular-nums whitespace-nowrap',
              nbEnAttente > 0
                ? 'bg-red-500/15 text-red-200 ring-red-500/30 animate-pulse'
                : 'bg-zinc-800 text-zinc-300 ring-zinc-700',
            )}>
              <span className="text-base">🔔</span>{nbEnAttente} en attente
            </span>
            <span className={cn(
              'inline-flex items-center gap-1.5 px-2.5 h-10 rounded-xl ring-1 text-xs font-black tabular-nums whitespace-nowrap',
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
              className="inline-flex items-center gap-2 px-2.5 h-10 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-black border border-zinc-700 shrink-0"
              title="Active le son pour les nouvelles commandes"
            >
              🔔 Activer son
            </button>
          )}
          <button
            onClick={toggleAutoPrint}
            className={cn(
              'inline-flex items-center gap-2 px-2.5 h-10 rounded-xl text-xs font-black transition-colors shrink-0',
              autoPrint
                ? 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-lg shadow-emerald-500/30'
                : 'bg-zinc-800 hover:bg-zinc-700 text-zinc-300 border border-zinc-700',
            )}
            title="Imprime automatiquement le bon dès qu'une nouvelle commande arrive"
          >
            🖨 Auto : {autoPrint ? 'ON' : 'OFF'}
          </button>
          <Link
            href="/caisse"
            className="inline-flex items-center gap-1.5 px-2.5 h-10 rounded-xl bg-zinc-100 hover:bg-white text-zinc-900 font-black text-sm shadow-lg transition-all active:scale-95 whitespace-nowrap shrink-0"
          >
            <span className="text-lg">💰</span>
            <span>Caisse</span>
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
          />
        ) : (
          <ColonneAgenda
            tag="CUISINE"
            icone="👨‍🍳"
            articles={articlesParColonne.CUISINE}
            now={now}
            onTransition={transition}
          />
        )}
      </main>
    </div>
  )
}

// ─── Cuisine = Flux FIFO horizontal (gauche → droite, ordre arrivée) ──
function ColonneAgenda({
  tag, icone, articles, now, onTransition,
}: {
  tag: ColonneTag
  icone: string
  articles: Array<{ commande: CommandeService; articles: CommandeService['articles'] }>
  now: number
  onTransition: (id: string, nouveau: StatutArticle) => void
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

      {/* Flux horizontal : tickets côte à côte par ordre d'arrivée */}
      <div
        className="overflow-x-auto scroll-visible-dark pb-2"
        style={{ scrollSnapType: 'x mandatory', WebkitOverflowScrolling: 'touch' }}
      >
        <div className="flex items-stretch gap-3 lg:gap-4 min-w-max">
          {ordered.map(({ commande, articles: arts }, idx) => (
            <div
              key={commande.id}
              className="w-[280px] sm:w-[320px] lg:w-[360px] shrink-0 relative"
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
  commande, articles, now, onTransition,
}: {
  commande: CommandeService
  articles: CommandeService['articles']
  now: number
  onTransition: (id: string, nouveau: StatutArticle) => void
}) {
  const min = statutMinuteur(commande.created_at, now)
  const minSty = STATUT_MINUTEUR_STYLE[min]
  const sourceSty = SOURCE_LABEL[commande.source]

  // Statuts agrégés du ticket (pour bordure + bouton groupé)
  const tousEnAttente = articles.every(a => a.statut === 'en_attente')
  const tousPret = articles.every(a => a.statut === 'pret')

  // Autres articles de la commande (pas mon poste) — pour coordination livraison
  const idsCePoste = new Set(articles.map(a => a.id))
  const autresArticles = commande.articles.filter(a => !idsCePoste.has(a.id))
  const tousLesAutresPrets = autresArticles.length > 0 && autresArticles.every(a => a.statut === 'pret' || a.statut === 'servi')

  // Allergènes agrégés
  const allergenes = Array.from(new Set(articles.flatMap(a => a.allergenes_a_eviter)))

  // Avance tous les articles non encore au statut cible (action groupée)
  function avancerTous(cible: StatutArticle) {
    for (const a of articles) {
      if (a.statut !== cible && a.statut !== 'servi') onTransition(a.id, cible)
    }
  }

  // Border-left épaisse selon source (cohérent avec BarClient)
  const sourceBorderL =
    commande.source === 'TABLE'    ? 'border-l-[6px] border-l-blue-500' :
    commande.source === 'COMPTOIR' ? 'border-l-[6px] border-l-violet-500' :
    'border-l-[6px] border-l-emerald-500'

  // Bandeau créneau retrait : visible pour TOUTE commande avec un créneau défini.
  // Pour les commandes multi-zones (panier mixte snack+pizza), on utilise le créneau
  // SPÉCIFIQUE au tag de ce ticket (pas le créneau global qui est = max des deux).
  // Ainsi la pizza voit son propre horaire de sortie, pas celui du snack.
  const isOnline = commande.source === 'ONLINE'
  const tagDuTicket = articles[0]?.tag_destination
  const creneauTag = tagDuTicket ? commande.creneaux_par_tag?.[tagDuTicket] : null
  const creneauIso = creneauTag ?? commande.creneau_retrait ?? null
  const creneauTime = creneauIso ? new Date(creneauIso).getTime() : null
  const minutesRestantes = creneauTime ? Math.round((creneauTime - now) / 60000) : null
  const urgenceCls = !creneauTime || minutesRestantes === null ? null
    : minutesRestantes < 0 ? 'bg-red-600 animate-pulse'
    : minutesRestantes < 10 ? 'bg-amber-500'
    : minutesRestantes < 20 ? 'bg-blue-500'
    : 'bg-emerald-700'

  return (
    <div className={cn(
      'rounded-lg border-2 bg-zinc-900 overflow-hidden',
      sourceBorderL,
      tousPret           ? 'border-emerald-500/70' :
      tousEnAttente      ? 'border-blue-500/50' :
                           'border-amber-500/50',
    )}>
      {/* Bandeau créneau retrait — visible pour ONLINE et COMPTOIR (snack avec réservation) */}
      {creneauTime && (
        <div className={cn('px-3 py-2 text-white flex items-center justify-between gap-2', urgenceCls)}>
          <div className="flex items-center gap-2">
            <span className="text-lg">{isOnline ? '📦' : '🛒'}</span>
            <div>
              <p className="text-[10px] uppercase tracking-wider opacity-90 leading-none">
                Retrait {isOnline ? 'web' : 'comptoir'} à
              </p>
              <p className="text-base font-bold tabular-nums leading-tight">
                {new Date(creneauTime).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
              </p>
            </div>
          </div>
          {minutesRestantes !== null && (
            <p className="text-xl font-bold tabular-nums">
              {minutesRestantes < 0 ? `+${Math.abs(minutesRestantes)} min` : `${minutesRestantes} min`}
            </p>
          )}
        </div>
      )}

      {/* Header ticket : source + table + minuteur */}
      <div className="px-3 py-2 flex items-center justify-between gap-2 bg-zinc-950">
        <div className="flex items-center gap-2 min-w-0">
          <span className={cn('text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded', sourceSty.bg, sourceSty.text)}>
            {sourceSty.emoji} {commande.source === 'TABLE' && commande.numero_table ? `T${commande.numero_table}` : sourceSty.label}
          </span>
          <span className="text-[10px] text-zinc-500 truncate">{commande.numero}</span>
        </div>
        <div className="flex items-center gap-1.5">
          <a
            href={`/print/bons/${commande.id}?dest=${articles[0].tag_destination}`}
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

      {/* Allergènes agrégés (banner rouge si au moins un article a une allergie) */}
      {allergenes.length > 0 && (
        <div className="px-3 py-2 bg-red-600 text-white border-b-4 border-red-300 animate-pulse">
          <p className="text-[10px] font-black uppercase tracking-wider opacity-90">🚨 ALLERGIE CLIENT</p>
          <p className="text-sm font-bold mt-0.5">
            ⛔ Éviter : {allergenes.map(a => {
              const info = ALLERGENE_INFO[a as Allergene]
              return info ? `${info.emoji} ${info.label}` : a
            }).join(' · ')}
          </p>
        </div>
      )}

      {/* Corps : liste des articles du poste avec leur statut individuel */}
      <ul className="divide-y divide-zinc-800">
        {articles.map(a => {
          const aSty = STATUT_ARTICLE_LABEL[a.statut]
          const next: StatutArticle | null =
            a.statut === 'en_attente' ? 'en_preparation' :
            a.statut === 'en_preparation' ? 'pret' :
            null
          return (
            <li key={a.id} className="px-3 py-2.5">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-baseline gap-2 min-w-0 flex-1">
                  <span className="text-2xl font-bold tabular-nums shrink-0">×{a.quantite}</span>
                  <p className="text-base font-semibold leading-tight truncate">{a.recette_nom}</p>
                </div>
                <span className={cn('text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded shrink-0', aSty.bg, aSty.text)}>
                  {aSty.emoji}
                </span>
                {next && (
                  <button
                    onClick={() => onTransition(a.id, next)}
                    className={cn(
                      'min-h-[36px] px-3 rounded-md font-bold text-xs transition-colors active:scale-95 shrink-0',
                      a.statut === 'en_attente' ? 'bg-amber-500 text-white hover:bg-amber-400' : 'bg-emerald-500 text-white hover:bg-emerald-400'
                    )}
                  >
                    {a.statut === 'en_attente' ? '🔥' : '✓'}
                  </button>
                )}
              </div>
              {a.commentaire && (
                <p className="mt-1.5 text-xs text-amber-300 bg-amber-900/30 border border-amber-800 rounded px-2 py-1 italic">
                  ⚠ {a.commentaire}
                </p>
              )}
            </li>
          )
        })}
      </ul>

      {/* Notes de commande + serveur */}
      {(commande.notes || commande.serveur_nom) && (
        <div className="px-3 py-2 border-t border-zinc-800 text-xs text-zinc-400 space-y-1">
          {commande.notes && <p className="italic">📝 {commande.notes}</p>}
          {commande.serveur_nom && <p className="text-[10px] text-zinc-500">Serveur : {commande.serveur_nom}</p>}
        </div>
      )}

      {/* Autres articles de la même commande (autres postes) — coordination livraison */}
      {autresArticles.length > 0 && (
        <div className="mx-3 mb-2 rounded border border-zinc-700 bg-zinc-950 px-2 py-1.5">
          <p className="text-[9px] uppercase tracking-wider text-zinc-500 font-bold mb-1">
            📦 Aussi dans cette commande {tousLesAutresPrets && <span className="text-emerald-400">· tout est prêt</span>}
          </p>
          <ul className="space-y-0.5">
            {autresArticles.map(a => {
              const tagSty = TAG_DEST_LABEL_LOCAL[a.tag_destination] ?? { emoji: '·', label: a.tag_destination }
              const aSty = STATUT_ARTICLE_LABEL[a.statut]
              return (
                <li key={a.id} className="flex items-center justify-between text-[11px] gap-2">
                  <span className="truncate">
                    <span className="opacity-70">{tagSty.emoji}</span> <b className="tabular-nums">×{a.quantite}</b> {a.recette_nom}
                  </span>
                  <span className={cn('text-[9px] px-1 py-0.5 rounded shrink-0', aSty.bg, aSty.text)}>
                    {aSty.emoji}
                  </span>
                </li>
              )
            })}
          </ul>
        </div>
      )}

      {/* Action groupée : avancer tous les articles d'un coup */}
      {!tousPret && (
        <div className="px-3 py-2 border-t border-zinc-800 bg-zinc-950/50">
          <button
            onClick={() => avancerTous(tousEnAttente ? 'en_preparation' : 'pret')}
            className={cn(
              'w-full min-h-[48px] rounded-md font-bold text-sm uppercase tracking-wider transition-colors active:scale-[0.98]',
              tousEnAttente ? 'bg-amber-500 hover:bg-amber-400 text-white' : 'bg-emerald-500 hover:bg-emerald-400 text-white'
            )}
          >
            {tousEnAttente ? '🔥 Prendre tout en préparation' : '✓ Marquer tout prêt'}
          </button>
        </div>
      )}
    </div>
  )
}

// ─── PizzaAgenda = AGENDA colonnes 15min (mode pizzaiolo) ────────────
// Comme emporter/livreur : tickets placés sous leur créneau de retrait.
// Les commandes sans créneau (sur place / comptoir) → colonne "Hors créneau".
function PizzaAgenda({
  articles, now, onTransition,
}: {
  articles: Array<{ commande: CommandeService; articles: CommandeService['articles'] }>
  now: number
  onTransition: (id: string, nouveau: StatutArticle) => void
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

// ─── KPI ─────────────────────────────────────────────────────────────
function KPI({ label, value, accent = 'default', pulse }: {
  label: string
  value: string | number
  accent?: 'default' | 'red' | 'orange'
  pulse?: boolean
}) {
  const STYLES = {
    default: 'bg-zinc-800/80 border-zinc-700 text-zinc-100',
    red:     'bg-gradient-to-br from-rose-500/30 to-red-700/10 border-rose-500/40 text-rose-100 shadow-md shadow-rose-900/30',
    orange:  'bg-gradient-to-br from-amber-500/30 to-amber-700/10 border-amber-500/40 text-amber-100 shadow-md shadow-amber-900/30',
  }
  return (
    <div className={cn('rounded-xl border px-3 py-1.5 text-center min-w-20 backdrop-blur', STYLES[accent], pulse && 'animate-pulse')}>
      <p className="text-[10px] uppercase tracking-widest opacity-75 font-bold">{label}</p>
      <p className="text-base font-black tabular-nums leading-tight mt-0.5">{value}</p>
    </div>
  )
}
