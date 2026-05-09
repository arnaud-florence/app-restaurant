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

  // ─── Filtrage : 1 ticket par COMMANDE (regroupe tous les articles BAR
  // d'une même table/comptoir pour éviter les oublis lors de la préparation)
  const ticketsParCommande = useMemo(() => {
    const out: Array<{
      commande: CommandeService
      articles: CommandeService['articles']
    }> = []
    for (const c of commandes) {
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
              🖨 Auto : {autoPrint ? 'ON' : 'OFF'}
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

      <div className="px-3 pt-3 bg-zinc-900">
        <TachesDuJourWidget poste="barman" theme="dark" employeId={widgetEmployeId} initialDone={widgetInitialDone} />
      </div>

      {/* Section commandes comptoir à encaisser (violet = COMPTOIR) */}
      {commandesComptoir.length > 0 && (
        <section className="px-3 pt-3 bg-zinc-900">
          <div className="rounded-lg border-2 border-violet-500/60 bg-violet-950/30 p-3">
            <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
              <p className="text-sm uppercase tracking-wider font-bold text-violet-200 flex items-center gap-2">
                <span className="text-lg">🛒</span>
                Comptoir — {commandesComptoir.length} à encaisser
              </p>
              <p className="text-[11px] text-violet-400">Clic sur une note pour ouvrir l&apos;encaissement</p>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-2">
              {commandesComptoir.map(c => {
                const totalArticles = c.articles.reduce((s, a) => s + (a.quantite ?? 1), 0)
                return (
                  <button
                    key={c.id}
                    onClick={() => setEncaissementCmd(c)}
                    className="text-left p-3 rounded-md bg-zinc-900 border-2 border-violet-700/40 hover:border-violet-400 transition-colors active:scale-[0.97]"
                  >
                    <div className="flex items-center justify-between">
                      <p className="text-[10px] text-violet-300 font-bold">#{(c.numero ?? c.id).slice(-4)}</p>
                      <p className="text-[10px] text-zinc-500">{totalArticles} art.</p>
                    </div>
                    <p className="text-xl sm:text-2xl font-bold tabular-nums mt-1 text-violet-100">
                      {fmtPrix(Number(c.montant_total_ttc ?? 0))}
                    </p>
                    <p className="text-[10px] text-emerald-400 mt-1 font-bold">→ ENCAISSER</p>
                  </button>
                )
              })}
            </div>
          </div>
        </section>
      )}

      {/* Légende couleurs sources (didactique) */}
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

      <main className="flex-1 p-3 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 pb-32">
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
            />
          ))
        )}
      </main>

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

// Ticket regroupant TOUS les articles BAR d'une même commande
// (table ou comptoir) — évite le risque d'oubli en éparpillant les lignes.
function TicketCommande({
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

  const sourceBorderL =
    commande.source === 'TABLE'    ? 'border-l-[6px] border-l-blue-500' :
    commande.source === 'COMPTOIR' ? 'border-l-[6px] border-l-violet-500' :
    'border-l-[6px] border-l-emerald-500'

  const sourceHeaderBg =
    commande.source === 'TABLE'    ? 'bg-blue-950/50' :
    commande.source === 'COMPTOIR' ? 'bg-violet-950/50' :
    'bg-emerald-950/50'

  // Statut global : si tout pret = pret, si en cours = en_preparation, sinon en_attente
  const tousEnAttente   = articles.every(a => a.statut === 'en_attente')
  const tousPret        = articles.every(a => a.statut === 'pret')
  const tousEnPrep      = articles.every(a => a.statut === 'en_preparation' || a.statut === 'pret')

  // Allergènes : agrégation pour visibilité globale
  const allergenes = Array.from(new Set(articles.flatMap(a => a.allergenes_a_eviter)))

  // Bouton groupé : action sur tous les articles non encore au statut cible
  function avancerTous(cible: StatutArticle) {
    const ids = articles
      .filter(a => a.statut !== cible && a.statut !== 'servi')
      .map(a => a.id)
    for (const id of ids) onTransition(id, cible)
  }

  // Border globale selon avancement majoritaire
  const borderClasse = tousPret
    ? 'border-emerald-500/70'
    : tousEnPrep ? 'border-amber-500/50'
    : 'border-blue-500/50'

  return (
    <div className={cn('rounded-lg border-2 bg-zinc-900 overflow-hidden', sourceBorderL, borderClasse)}>
      {/* Header : source + minuteur + impression */}
      <div className={cn('px-3 py-2 flex items-center justify-between gap-2', sourceHeaderBg)}>
        <div className="flex items-center gap-2 min-w-0">
          <span className={cn('text-[11px] font-bold uppercase tracking-wider px-2 py-1 rounded', sourceSty.bg, sourceSty.text)}>
            {sourceSty.emoji} {commande.source === 'TABLE' && commande.numero_table ? `T${commande.numero_table}` : sourceSty.label}
          </span>
          <span className="text-[11px] text-zinc-400 font-medium">
            {articles.length} ligne{articles.length > 1 ? 's' : ''}
          </span>
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

      {/* Allergènes globaux (banner rouge si présent) */}
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

      {/* Liste articles avec leur statut individuel */}
      <ul className="divide-y divide-zinc-800">
        {articles.map(a => {
          const statutSty = STATUT_ARTICLE_LABEL[a.statut]
          const nextStatut: StatutArticle | null =
            a.statut === 'en_attente' ? 'en_preparation' :
            a.statut === 'en_preparation' ? 'pret' :
            null
          return (
            <li key={a.id} className="px-3 py-2.5">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-baseline gap-2 min-w-0 flex-1">
                  <span className="text-2xl font-bold tabular-nums text-zinc-100 flex-shrink-0">×{a.quantite}</span>
                  <p className="text-base font-semibold leading-tight truncate">{a.recette_nom}</p>
                </div>
                <span className={cn('text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded flex-shrink-0', statutSty.bg, statutSty.text)}>
                  {statutSty.emoji}
                </span>
                {nextStatut && (
                  <button
                    onClick={() => onTransition(a.id, nextStatut)}
                    className={cn(
                      'min-h-[36px] px-3 rounded-md font-bold text-xs transition-colors active:scale-95 flex-shrink-0',
                      a.statut === 'en_attente' ? 'bg-amber-500 text-white' : 'bg-emerald-500 text-white'
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

      {/* Action groupée : avancer tous les articles d'un coup */}
      {!tousPret && (
        <div className="px-3 py-2 border-t border-zinc-800 bg-zinc-950/50">
          <button
            onClick={() => avancerTous(tousEnAttente ? 'en_preparation' : 'pret')}
            className={cn(
              'w-full min-h-[44px] rounded-md font-bold text-sm uppercase tracking-wider transition-colors active:scale-[0.98]',
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

function KPI({ label, value, accent = 'default', pulse }: { label: string; value: string | number; accent?: 'default' | 'red' | 'orange'; pulse?: boolean }) {
  const cls = { default: 'bg-zinc-800 text-zinc-100', red: 'bg-red-600 text-white', orange: 'bg-amber-500 text-white' }[accent]
  return (
    <div className={cn('rounded-md px-3 py-1.5 text-center min-w-20', cls, pulse && 'animate-pulse')}>
      <p className="text-[10px] uppercase tracking-wider opacity-80">{label}</p>
      <p className="text-base font-bold tabular-nums leading-tight">{value}</p>
    </div>
  )
}
