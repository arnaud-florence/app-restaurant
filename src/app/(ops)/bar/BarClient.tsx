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
import TicketCommande from '@/components/ops/TicketCommande'
import { changerStatutArticle, annulerCommande } from '../actions'
import { toast } from '@/lib/toast'
import type { OpsBottomNavProfil } from '@/components/ops-nav-types'
import TachesSequentielles from '@/components/TachesSequentielles'
import ComptoirOrderModal from './ComptoirOrderModal'
import { fmtPrix } from '@/lib/service'

type Recette = {
  id: string; nom: string; categorie: string;
  tag_destination: 'CUISINE' | 'SNACKING' | 'PIZZA' | 'BAR'
  prix_vente_ht: number
  image_url?: string | null
  photo_url?: string | null
  favori?: boolean
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
  const [tab, setTab] = useState<'preparer' | 'comptoir'>('preparer')
  const [showComptoir, setShowComptoir] = useState(false)
  const [annulationCible, setAnnulationCible] = useState<CommandeService | null>(null)
  const [motifAnnulation, setMotifAnnulation] = useState('Erreur de saisie')
  const [, startTransition] = useTransition()
  const previousIdsRef = useRef(new Set(initial.map(c => c.id)))
  const audioReadyRef = useRef(false)
  const [autoPrint, setAutoPrint] = useState(false)
  const [printJobs, setPrintJobs] = useState<Array<{ key: string; src: string }>>([])
  const [compact, setCompact] = useState(false)   // vue d'ensemble : cartes basses, plus de colonnes
  const [cb, setCb] = useState(false)             // mode daltonien : glyphes de forme

  useEffect(() => {
    try { setAutoPrint(localStorage.getItem('bar_auto_print') === '1') } catch { /* ignore */ }
    try { setCompact(localStorage.getItem('bar_compact') === '1') } catch { /* ignore */ }
    try { setCb(localStorage.getItem('cb_mode') === '1') } catch { /* ignore */ }
  }, [])
  function toggleAutoPrint() {
    setAutoPrint(v => {
      const nv = !v
      try { localStorage.setItem('bar_auto_print', nv ? '1' : '0') } catch { /* ignore */ }
      return nv
    })
  }
  function toggleCompact() {
    setCompact(v => {
      const nv = !v
      try { localStorage.setItem('bar_compact', nv ? '1' : '0') } catch { /* ignore */ }
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
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notifications' }, () => router.refresh())
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [router])

  // ─── Filtrage : 1 ticket par COMMANDE (regroupe tous les articles BAR
  // d'une même table/comptoir pour éviter les oublis lors de la préparation)
  const ticketsParCommande = useMemo(() => {
    const out: Array<{
      commande: CommandeService
      articles: CommandeService['articles']
    }> = []
    for (const c of commandes) {
      // Commande BORNE/COMPTOIR non payée → pas en prep (reste dans la section
      // "Comptoir à encaisser" ci-dessous jusqu'à encaissement). Règle multi-canal.
      if (c.statut === 'en_attente_paiement_comptoir') continue
      const articlesBar = c.articles.filter(a => a.tag_destination === 'BAR' && a.statut !== 'servi')
      if (articlesBar.length === 0) continue
      out.push({ commande: c, articles: articlesBar })
    }
    out.sort((a, b) => new Date(a.commande.created_at).getTime() - new Date(b.commande.created_at).getTime())
    return out
  }, [commandes])

  // Liste à plat pour les KPIs (compteurs, temps moyen)
  const articles = useMemo(
    () => ticketsParCommande.flatMap(t => t.articles.map(a => ({ commande: t.commande, article: a }))),
    [ticketsParCommande]
  )

  // Commandes comptoir RESTANT à encaisser au bar.
  // Garde anti double-paiement : on exclut celles déjà payées (mode_paiement
  // renseigné) et les commandes snack en attente de paiement comptoir (→ /emporter).
  const commandesComptoir = useMemo(() => {
    return commandes
      .filter(c => c.source === 'COMPTOIR' && c.statut !== 'encaisse' && c.statut !== 'annule'
        && c.statut !== 'en_attente_paiement_comptoir' && !c.mode_paiement)
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
  }, [commandes])

  const nbEnAttente = articles.filter(x => x.article.statut === 'en_attente').length
  const tempsMoyen = articles.length > 0
    ? articles.reduce((s, x) => s + (now - new Date(x.commande.created_at).getTime()) / 60000, 0) / articles.length
    : 0

  function confirmerAnnulation() {
    if (!annulationCible) return
    const motif = motifAnnulation.trim()
    if (!motif) { toast.error('Motif obligatoire pour annuler'); return }
    const cmd = annulationCible
    startTransition(async () => {
      try {
        await annulerCommande(cmd.id, motif)
        toast.success('Commande comptoir annulée')
        setAnnulationCible(null)
        router.refresh()
      } catch (e) { toast.error(e instanceof Error ? e.message : 'Erreur') }
    })
  }

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
      {/* ═══ HEADER POS UNIFIÉ (style /serveur /cuisine) ═══ */}
      <header className="sticky top-[var(--op-bar-h,0px)] z-20 bg-gradient-to-r from-zinc-900 via-zinc-900 to-zinc-950 border-b border-zinc-800 shadow-xl" style={{ paddingTop: 'env(safe-area-inset-top)' }}>
        <div className="md:hidden p-2 space-y-2">
          <div className="flex items-center justify-center -mb-1">
            <h1 className="text-zinc-100 text-xs font-black uppercase tracking-[0.2em]">🍷 Bar</h1>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-gradient-to-br from-violet-500 to-violet-700 text-white text-lg shadow-md shrink-0">🍷</span>
            <span className={cn(
              'flex-1 inline-flex items-center gap-1 px-2 h-12 rounded-xl ring-1 text-xs font-black tabular-nums',
              nbEnAttente > 0 ? 'bg-red-500/15 text-red-200 ring-red-500/30 animate-pulse' : 'bg-zinc-800 text-zinc-300 ring-zinc-700',
            )}><span className="text-sm">🔔</span>{nbEnAttente} en attente</span>
            <span className="inline-flex items-center gap-1 px-2 h-12 rounded-xl bg-amber-500/15 text-amber-200 ring-1 ring-amber-500/30 text-xs font-black tabular-nums shrink-0">
              <span className="text-sm">⏱</span>{tempsMoyen.toFixed(0)}m
            </span>
            <Link href="/service" className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-zinc-100 text-zinc-900 text-lg shadow-lg active:scale-95 shrink-0" aria-label="Centre opérationnel">⊞</Link>
          </div>
          <div className="flex items-center gap-1.5">
            {!audioReadyRef.current && (
              <button onClick={activerSon} className="flex-1 inline-flex items-center justify-center gap-1 px-2 h-12 rounded-xl bg-zinc-800 text-zinc-200 text-xs font-black border border-zinc-700">🔔 Activer son</button>
            )}
            <button
              onClick={toggleAutoPrint}
              className={cn('flex-1 inline-flex items-center justify-center gap-1 px-2 h-12 rounded-xl text-xs font-black transition-colors',
                autoPrint ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-500/30' : 'bg-zinc-800 text-zinc-300 border border-zinc-700')}
            >🖨 {autoPrint ? 'Auto ON' : 'Auto OFF'}</button>
          </div>
        </div>
        <div className="hidden md:flex px-3 h-14 items-center gap-2 overflow-x-auto whitespace-nowrap">
          <div className="inline-flex items-center gap-2 shrink-0">
            <span className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-gradient-to-br from-violet-500 to-violet-700 text-white text-xl shadow-md">🍷</span>
            <div className="block min-w-0 flex-1">
              <p className="text-[9px] font-black uppercase tracking-[0.2em] text-violet-400 leading-none">Service</p>
              <h1 className="font-display italic text-base font-medium text-white tracking-tight leading-none mt-0.5">Bar</h1>
            </div>
          </div>
          <div className="inline-flex items-center gap-1.5 shrink-0">
            <span className={cn('inline-flex items-center gap-1.5 px-2.5 h-12 rounded-xl ring-1 text-xs font-black tabular-nums whitespace-nowrap',
              nbEnAttente > 0 ? 'bg-red-500/15 text-red-200 ring-red-500/30 animate-pulse' : 'bg-zinc-800 text-zinc-300 ring-zinc-700')}>
              <span className="text-base">🔔</span>{nbEnAttente} en attente
            </span>
            <span className={cn('inline-flex items-center gap-1.5 px-2.5 h-12 rounded-xl ring-1 text-xs font-black tabular-nums whitespace-nowrap',
              tempsMoyen > 15 ? 'bg-red-500/15 text-red-200 ring-red-500/30' : tempsMoyen > 10 ? 'bg-amber-500/15 text-amber-200 ring-amber-500/30' : 'bg-zinc-800 text-zinc-300 ring-zinc-700')}>
              <span className="text-base">⏱</span>{tempsMoyen.toFixed(0)} min
            </span>
          </div>
          <div className="flex-1 min-w-2" />
          {!audioReadyRef.current && (
            <button onClick={activerSon} className="inline-flex items-center gap-2 px-2.5 h-12 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-black border border-zinc-700 shrink-0">🔔 Activer son</button>
          )}
          <button
            onClick={toggleAutoPrint}
            className={cn('inline-flex items-center gap-2 px-2.5 h-12 rounded-xl text-xs font-black transition-colors shrink-0',
              autoPrint ? 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-lg shadow-emerald-500/30' : 'bg-zinc-800 hover:bg-zinc-700 text-zinc-300 border border-zinc-700')}
          >🖨 Auto : {autoPrint ? 'ON' : 'OFF'}</button>
          <Link href="/service" className="inline-flex items-center gap-1.5 px-2.5 h-12 rounded-xl bg-zinc-100 hover:bg-white text-zinc-900 font-black text-sm shadow-lg transition-all active:scale-95 whitespace-nowrap shrink-0">
            <span className="text-lg">⊞</span><span>Service</span>
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

      <div className="px-3 pt-3 bg-zinc-900">
        <TachesSequentielles poste="barman" employeId={widgetEmployeId} initialDone={widgetInitialDone} theme="dark" />
      </div>

      {/* Légende couleurs sources (didactique) — reste au-dessus des onglets */}
      {articles.length > 0 && (
        <div className="px-3 pt-3 bg-zinc-900">
          <div className="flex items-center gap-3 text-[11px] text-zinc-400 flex-wrap">
            <span className="font-bold uppercase">À préparer</span>
            <span className="inline-flex items-center gap-1">
              <span className="inline-block w-3 h-3 rounded bg-blue-500"></span>
              <span>Tables (serveurs)</span>
            </span>
            <span className="inline-flex items-center gap-1">
              <span className="inline-block w-3 h-3 rounded bg-violet-500"></span>
              <span>Comptoir (bar)</span>
            </span>
            <span className="inline-flex items-center gap-1">
              <span className="inline-block w-3 h-3 rounded bg-emerald-500"></span>
              <span>Online</span>
            </span>
          </div>
        </div>
      )}

      {/* ═══ BARRE D'ONGLETS STICKY ═══ */}
      <div className="sticky top-[var(--op-bar-h,0px)] z-20 px-3 py-2 bg-zinc-950/90 backdrop-blur flex gap-1.5 overflow-x-auto border-b border-zinc-800">
        {([
          { k: 'preparer', label: '🍷 À préparer' },
          { k: 'comptoir', label: '🛒 Comptoir' },
        ] as const).map(({ k, label }) => (
          <button
            key={k}
            onClick={() => setTab(k)}
            className={cn(
              'min-h-[44px] px-3 rounded-xl text-xs font-black whitespace-nowrap transition active:scale-95',
              tab === k ? 'bg-emerald-500 text-white' : 'bg-zinc-800 text-zinc-300',
            )}
          >
            {label}
            {k === 'comptoir' && commandesComptoir.length > 0 && (
              <span className="ml-1.5 inline-flex items-center justify-center min-w-5 h-5 px-1 rounded-full bg-violet-600 text-white text-[10px] tabular-nums">{commandesComptoir.length}</span>
            )}
          </button>
        ))}
        <div className="flex-1" />
        <button
          onClick={toggleCb}
          title="Mode daltonien : ajoute des formes (●◆■) aux couleurs de statut"
          className={cn(
            'min-h-[44px] px-3 rounded-xl text-xs font-black whitespace-nowrap transition active:scale-95 shrink-0',
            cb ? 'bg-blue-600 text-white shadow-lg shadow-blue-500/30' : 'bg-zinc-800 text-zinc-300',
          )}
        >
          ◐ {cb ? 'Daltonien ON' : 'Daltonien'}
        </button>
        {tab === 'preparer' && (
          <button
            onClick={toggleCompact}
            title="Vue d'ensemble : cartes basses pour tout voir sans défiler"
            className={cn(
              'min-h-[44px] px-3 rounded-xl text-xs font-black whitespace-nowrap transition active:scale-95 shrink-0',
              compact ? 'bg-violet-600 text-white shadow-lg shadow-violet-500/30' : 'bg-zinc-800 text-zinc-300',
            )}
          >
            ▦ {compact ? 'Vue compacte' : 'Vue détaillée'}
          </button>
        )}
      </div>

      {/* ═══ ONGLET : À préparer (grille des tickets) ═══ */}
      {tab === 'preparer' && (
        <main className={cn(
          'flex-1 p-3 grid gap-3 pb-32',
          compact
            ? 'grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-2'
            : 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3',
        )}>
          {ticketsParCommande.length === 0 ? (
            <div className="col-span-full text-center text-zinc-500 py-16">
              <p className="text-6xl mb-3">🍷</p>
              <p className="text-base">Aucun ticket bar en attente.</p>
            </div>
          ) : (
            ticketsParCommande.map(({ commande, articles: arts }) => (
              <TicketCommande
                key={commande.id}
                commande={commande}
                articles={arts}
                now={now}
                onTransition={transition}
                compact={compact}
                cb={cb}
              />
            ))
          )}
        </main>
      )}

      {/* ═══ ONGLET : Comptoir à encaisser (violet = COMPTOIR) ═══ */}
      {tab === 'comptoir' && (
        <section className="flex-1 px-3 pt-3 pb-32 bg-zinc-900">
          {commandesComptoir.length === 0 ? (
            <div className="text-center text-zinc-500 py-16">
              <p className="text-6xl mb-3">🛒</p>
              <p className="text-base">Aucune commande comptoir à encaisser.</p>
            </div>
          ) : (
            <div className="rounded-lg border-2 border-violet-500/60 bg-violet-950/30 p-3">
              <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
                <p className="text-sm uppercase tracking-wider font-bold text-violet-200 flex items-center gap-2">
                  <span className="text-lg">🛒</span>
                  Comptoir — {commandesComptoir.length} à encaisser
                </p>
                <p className="text-[11px] text-violet-400">À encaisser sur la caisse</p>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
                {commandesComptoir.map(c => {
                  const totalArticles = c.articles.reduce((s, a) => s + (a.quantite ?? 1), 0)
                  const ardoise = c.ardoise_nom?.trim()
                  // Carte informative : le bar PRÉPARE, il n'encaisse plus
                  // (cf. src/lib/frontiere-caisse.ts). Elle dit ce qui reste
                  // dû ; le règlement se fait sur la caisse.
                  return (
                    <div
                      key={c.id}
                      className={cn(
                        'text-left p-3 rounded-md bg-zinc-900 border-2',
                        ardoise ? 'border-violet-400/80 ring-1 ring-violet-500/30' : 'border-violet-700/40',
                      )}
                    >
                      <div className="flex items-center justify-between">
                        <p className="text-[11px] text-violet-200 font-bold truncate">
                          {ardoise ? `🧾 ${ardoise}` : `#${(c.numero ?? c.id).slice(-4)}`}
                        </p>
                        <p className="text-[10px] text-zinc-500 shrink-0 ml-1">{totalArticles} art.</p>
                      </div>
                      <p className="text-xl sm:text-2xl font-bold tabular-nums mt-1 text-violet-100">
                        {fmtPrix(Number(c.montant_total_ttc ?? 0))}
                      </p>
                      <div className="flex items-center justify-between gap-2 mt-1">
                        <p className="text-[10px] text-emerald-400 font-bold">{ardoise ? '→ ENCAISSER L\'ARDOISE' : '→ ENCAISSER'}</p>
                        <button
                          onClick={e => { e.stopPropagation(); setMotifAnnulation('Erreur de saisie'); setAnnulationCible(c) }}
                          className="shrink-0 inline-flex items-center gap-1 px-2 min-h-[32px] rounded-md bg-red-950/60 text-red-300 ring-1 ring-red-900 text-[11px] font-bold active:scale-95 transition"
                          aria-label="Annuler cette commande comptoir"
                        >🗑 Annuler</button>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </section>
      )}

      {/* FAB : nouvelle commande comptoir — visible sur tous écrans */}
      {recettes.length > 0 && (
        <button
          onClick={() => setShowComptoir(true)}
          className={cn(
            'fixed right-4 z-30 inline-flex items-center gap-2 rounded-full',
            'bg-emerald-500 hover:bg-emerald-400 text-white font-bold shadow-2xl',
            'transition-all active:scale-95 px-5 py-3 text-sm',
            // Mobile : au-dessus de la bottom nav. Desktop : un peu plus haut pour respirer.
            'bottom-[calc(64px+env(safe-area-inset-bottom)+16px)] md:bottom-6',
          )}
          aria-label="Nouvelle commande comptoir"
        >
          <span className="text-lg leading-none">+</span>
          <span>Nouvelle commande</span>
        </button>
      )}

      {/* Modal saisie commande comptoir */}
      {showComptoir && (
        <ComptoirOrderModal
          recettes={recettes}
          barmanId={barmanId}
          ardoisesOuvertes={Array.from(new Set(
            commandesComptoir.map(c => c.ardoise_nom?.trim()).filter((n): n is string => !!n),
          ))}
          onClose={() => setShowComptoir(false)}
          onSuccess={() => {
            setShowComptoir(false)
            router.refresh()
          }}
        />
      )}

      {/* Modale d'annulation d'une commande comptoir (in-app, kiosque-safe) */}
      {annulationCible && (
        <div className="fixed inset-0 z-[60] bg-black/70 flex items-end sm:items-center justify-center p-3" onClick={() => setAnnulationCible(null)}>
          <div className="w-full sm:max-w-sm rounded-3xl bg-zinc-900 ring-1 ring-red-900/60 p-5 space-y-4" onClick={e => e.stopPropagation()}>
            <div>
              <p className="text-[11px] font-black uppercase tracking-wider text-red-400">🗑 Annuler la commande comptoir</p>
              <p className="text-lg font-bold text-white mt-1">
                {annulationCible.ardoise_nom?.trim() ? `🧾 ${annulationCible.ardoise_nom}` : `#${(annulationCible.numero ?? annulationCible.id).slice(-4)}`}
              </p>
              <p className="text-sm text-zinc-400 mt-1">
                {annulationCible.articles.reduce((s, a) => s + (a.quantite ?? 1), 0)} article(s) · {fmtPrix(Number(annulationCible.montant_total_ttc ?? 0))}
              </p>
              <p className="text-xs text-red-300/80 mt-2">Action irréversible : la note disparaît et n&apos;est pas encaissée.</p>
            </div>
            <div>
              <label className="text-[11px] font-bold uppercase tracking-wider text-zinc-400">Motif (obligatoire — tracé au journal)</label>
              <input
                type="text"
                value={motifAnnulation}
                onChange={e => setMotifAnnulation(e.target.value)}
                autoFocus
                placeholder="Ex : erreur de saisie, client parti…"
                className="mt-1 w-full min-h-[48px] px-3 rounded-xl bg-zinc-950 border border-zinc-700 text-zinc-100 placeholder:text-zinc-600 focus:border-red-500 outline-none text-base"
              />
            </div>
            <button
              onClick={confirmerAnnulation}
              disabled={!motifAnnulation.trim()}
              className="w-full min-h-[56px] rounded-2xl bg-red-600 text-white font-black text-base active:scale-95 transition disabled:opacity-40">
              🗑 Confirmer l&apos;annulation
            </button>
            <button onClick={() => setAnnulationCible(null)} className="w-full min-h-[44px] rounded-2xl text-zinc-400 text-sm font-bold active:scale-95 transition">
              Retour
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
