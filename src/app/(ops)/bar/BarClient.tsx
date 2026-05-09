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
import OpsBottomNav, { type OpsBottomNavProfil } from '@/components/OpsBottomNav'
import TachesDuJourWidget from '@/components/TachesDuJourWidget'
import ComptoirOrderModal from './ComptoirOrderModal'
import EncaissementModal from '../serveur/EncaissementModal'
import { fmtPrix } from '@/lib/service'

type Recette = {
  id: string; nom: string; categorie: string;
  tag_destination: 'CUISINE' | 'PIZZA' | 'BAR'
  prix_vente_ht: number
}

type Employe = { id: string; prenom: string; nom: string; poste: string }

export default function BarClient({
  initial, recettes = [], employes = [], barmanId = null,
  navProfil, widgetEmployeId = null, widgetInitialDone = [],
}: {
  initial: CommandeService[]
  recettes?: Recette[]
  employes?: Employe[]
  barmanId?: string | null
  navProfil?: OpsBottomNavProfil
  widgetEmployeId?: string | null
  widgetInitialDone?: string[]
}) {
  const router = useRouter()
  const [commandes, setCommandes] = useState(initial)
  const [now, setNow] = useState(() => Date.now())
  const [showComptoir, setShowComptoir] = useState(false)
  const [encaissementCmd, setEncaissementCmd] = useState<CommandeService | null>(null)
  const [, startTransition] = useTransition()
  const previousIdsRef = useRef(new Set(initial.map(c => c.id)))
  const audioReadyRef = useRef(false)
  const [autoPrint, setAutoPrint] = useState(false)
  const [printJobs, setPrintJobs] = useState<Array<{ key: string; src: string }>>([])

  useEffect(() => {
    try { setAutoPrint(localStorage.getItem('bar_auto_print') === '1') } catch { /* ignore */ }
  }, [])
  function toggleAutoPrint() {
    setAutoPrint(v => {
      const nv = !v
      try { localStorage.setItem('bar_auto_print', nv ? '1' : '0') } catch { /* ignore */ }
      return nv
    })
  }

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [])

  useEffect(() => {
    setCommandes(initial)
    const newIds = new Set(initial.map(c => c.id))
    const nouvelles = initial.filter(c => !previousIdsRef.current.has(c.id))
    if (nouvelles.length > 0 && audioReadyRef.current) playDing()
    if (nouvelles.length > 0 && autoPrint) {
      const jobs: Array<{ key: string; src: string }> = []
      for (const c of nouvelles) {
        if (c.articles.some(a => a.tag_destination === 'BAR')) {
          jobs.push({ key: `${c.id}-BAR-${Date.now()}`, src: `/print/bons/${c.id}?dest=BAR&auto=1` })
        }
      }
      if (jobs.length > 0) setPrintJobs(prev => [...prev, ...jobs])
    }
    previousIdsRef.current = newIds
  }, [initial, autoPrint])

  useEffect(() => {
    if (printJobs.length === 0) return
    const t = setTimeout(() => setPrintJobs([]), 8000)
    return () => clearTimeout(t)
  }, [printJobs])

  useEffect(() => {
    const supabase = createClient()
    const channel = supabase
      .channel('bar-rt')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'commandes' }, () => router.refresh())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'commande_articles' }, () => router.refresh())
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [router])

  // ─── Filtrage : articles BAR uniquement, hors 'servi'
  const articles = useMemo(() => {
    const out: Array<{ commande: CommandeService; article: CommandeService['articles'][number] }> = []
    for (const c of commandes) {
      for (const a of c.articles) {
        if (a.tag_destination !== 'BAR') continue
        if (a.statut === 'servi') continue
        out.push({ commande: c, article: a })
      }
    }
    out.sort((a, b) => new Date(a.commande.created_at).getTime() - new Date(b.commande.created_at).getTime())
    return out
  }, [commandes])

  // Commandes comptoir à encaisser (source COMPTOIR, statut non encaissé/annulé)
  const commandesComptoir = useMemo(() => {
    return commandes
      .filter(c => c.source === 'COMPTOIR' && c.statut !== 'encaisse' && c.statut !== 'annule')
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
  }, [commandes])

  const nbEnAttente = articles.filter(x => x.article.statut === 'en_attente').length
  const tempsMoyen = articles.length > 0
    ? articles.reduce((s, x) => s + (now - new Date(x.commande.created_at).getTime()) / 60000, 0) / articles.length
    : 0

  function transition(article_id: string, nouveau: StatutArticle) {
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
      <header className="sticky top-0 z-20 bg-zinc-900/95 backdrop-blur border-b border-zinc-800" style={{ paddingTop: 'env(safe-area-inset-top)' }}>
        <div className="px-4 py-3 flex items-center justify-between gap-3 flex-wrap">
          <div>
            <p className="text-xs font-bold uppercase tracking-wider text-zinc-400">Service — Bar</p>
            <h1 className="text-2xl sm:text-3xl font-bold">🍷 Bar</h1>
          </div>
          <div className="flex items-center gap-3">
            <KPI label="En attente" value={nbEnAttente} accent={nbEnAttente > 0 ? 'red' : 'default'} pulse={nbEnAttente > 0} />
            <KPI label="Temps moyen" value={`${tempsMoyen.toFixed(0)} min`} accent={tempsMoyen > 15 ? 'red' : tempsMoyen > 10 ? 'orange' : 'default'} />
            {!audioReadyRef.current && (
              <button onClick={activerSon} className="text-xs px-3 py-2 rounded-md bg-zinc-800 hover:bg-zinc-700 border border-zinc-700">
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
            {recettes.length > 0 && (
              <button
                onClick={() => setShowComptoir(true)}
                className="text-sm px-4 py-2 rounded-md bg-emerald-500 hover:bg-emerald-400 text-white font-bold border border-emerald-400"
              >
                + Nouvelle commande
              </button>
            )}
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

      <div className="px-3 pt-3 bg-zinc-900">
        <TachesDuJourWidget poste="barman" theme="dark" employeId={widgetEmployeId} initialDone={widgetInitialDone} />
      </div>

      {/* Section commandes comptoir à encaisser */}
      {commandesComptoir.length > 0 && (
        <section className="px-3 pt-3 bg-zinc-900">
          <div className="rounded-lg border border-emerald-700/50 bg-emerald-950/20 p-3">
            <p className="text-xs uppercase tracking-wider text-emerald-300 mb-2">
              💰 Comptoir — {commandesComptoir.length} commande{commandesComptoir.length > 1 ? 's' : ''} à encaisser
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
              {commandesComptoir.map(c => {
                const totalArticles = c.articles.reduce((s, a) => s + (a.quantite ?? 1), 0)
                return (
                  <button
                    key={c.id}
                    onClick={() => setEncaissementCmd(c)}
                    className="text-left p-3 rounded-md bg-zinc-900 border border-zinc-700 hover:border-emerald-500 transition-colors active:scale-[0.98]"
                  >
                    <div className="flex items-center justify-between">
                      <p className="text-xs text-zinc-400">#{c.numero ?? c.id.slice(0, 6)}</p>
                      <p className="text-xs text-zinc-500">{totalArticles} art.</p>
                    </div>
                    <p className="text-2xl font-bold tabular-nums mt-1">
                      {fmtPrix(Number(c.montant_total_ttc ?? 0))}
                    </p>
                    <p className="text-[11px] text-emerald-400 mt-1 font-medium">→ Encaisser</p>
                  </button>
                )
              })}
            </div>
          </div>
        </section>
      )}

      <main className="flex-1 p-3 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {articles.length === 0 ? (
          <div className="col-span-full text-center text-zinc-500 py-16">
            <p className="text-6xl mb-3">🍷</p>
            <p className="text-base">Aucun ticket bar en attente.</p>
          </div>
        ) : (
          articles.map(({ commande, article }) => (
            <Ticket key={article.id} commande={commande} article={article} now={now} onTransition={transition} />
          ))
        )}
      </main>

      {/* Modal saisie commande comptoir */}
      {showComptoir && (
        <ComptoirOrderModal
          recettes={recettes}
          barmanId={barmanId}
          onClose={() => setShowComptoir(false)}
          onSuccess={() => {
            setShowComptoir(false)
            router.refresh()
          }}
        />
      )}

      {/* Modal encaissement */}
      {encaissementCmd && (
        <EncaissementModal
          commande={encaissementCmd}
          serveurId={barmanId ?? ''}
          employes={employes}
          onClose={() => setEncaissementCmd(null)}
          onSuccess={() => {
            setEncaissementCmd(null)
            router.refresh()
          }}
        />
      )}
    </div>
  )
}

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
      <div className="px-3 py-2 flex items-center justify-between gap-2 bg-zinc-950">
        <div className="flex items-center gap-2 min-w-0">
          <span className={cn('text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded', sourceSty.bg, sourceSty.text)}>
            {sourceSty.emoji} {sourceSty.label}
          </span>
          {commande.numero_table && <span className="text-sm font-bold">T{commande.numero_table}</span>}
        </div>
        <div className="flex items-center gap-1.5">
          <a
            href={`/print/bons/${commande.id}?dest=BAR`}
            target="_blank"
            rel="noopener"
            className="text-xs h-7 px-2 inline-flex items-center rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-200 font-bold"
            title="Réimprimer le bon bar"
          >🖨</a>
          <div className={cn('text-sm font-bold tabular-nums px-2 py-0.5 rounded', minSty.bg, minSty.text)}>
            ⏱ {formatEcoule(commande.created_at, now)}
          </div>
        </div>
      </div>

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
      </div>

      <div className="px-3 pb-3 flex items-center gap-2">
        <span className={cn('flex-1 text-center text-sm font-bold uppercase tracking-wider py-2 rounded-md', statutSty.bg, statutSty.text)}>
          {statutSty.emoji} {statutSty.label}
        </span>
        {nextStatut && (
          <button
            onClick={() => onTransition(article.id, nextStatut)}
            className={cn(
              'min-h-[48px] px-4 py-2 rounded-md font-bold text-sm uppercase tracking-wider transition-colors active:scale-[0.97]',
              article.statut === 'en_attente' ? 'bg-amber-500 text-white' : 'bg-emerald-500 text-white'
            )}
          >
            {article.statut === 'en_attente' ? '🔥 Prendre' : '✓ Prêt'}
          </button>
        )}
      </div>
    </div>
  )
}

function KPI({ label, value, accent = 'default', pulse }: { label: string; value: string | number; accent?: 'default' | 'red' | 'orange'; pulse?: boolean }) {
  const cls = { default: 'bg-zinc-800 text-zinc-100', red: 'bg-red-600 text-white', orange: 'bg-amber-500 text-white' }[accent]
  return (
    <div className={cn('rounded-md px-3 py-1.5 text-center min-w-20', cls, pulse && 'animate-pulse')}>
      <p className="text-[10px] uppercase tracking-wider opacity-80">{label}</p>
      <p className="text-base font-bold tabular-nums leading-tight">{value}</p>
    </div>
  )
}
