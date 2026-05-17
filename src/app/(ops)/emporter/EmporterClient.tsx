'use client'

// Vue staff /emporter — commandes ONLINE en cours.
// Filtre source='ONLINE'. Affiche un compte à rebours du créneau retrait
// avec couleur d'urgence si <10 min. Sonnerie distincte à l'arrivée.
// Actions : Prendre en prep → Prêt → Retiré par client.

import { memo, useCallback, useEffect, useMemo, useRef, useState, useTransition, type ReactNode } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import AgendaCreneauxColonnes from '@/components/AgendaCreneauxColonnes'
import { createClient } from '@/lib/supabase/client'
import { cn } from '@/lib/utils'
import { type CommandeService, fmtPrix, playDing, STATUT_ARTICLE_LABEL } from '@/lib/service'
import { ALLERGENE_INFO, type Allergene } from '@/lib/allergenes'
import { marquerStatutCommandeOnline, avancerCommandeComptoir } from '../actions'
import OpsBottomNav, { type OpsBottomNavProfil } from '@/components/OpsBottomNav'
import TachesDuJourWidget from '@/components/TachesDuJourWidget'
import TachesSequentielles from '@/components/TachesSequentielles'
import ComptoirOrderModal from '../bar/ComptoirOrderModal'
import EncaissementModal from '../serveur/EncaissementModal'

type Recette = {
  id: string; nom: string; categorie: string;
  tag_destination: 'CUISINE' | 'SNACKING' | 'PIZZA' | 'BAR'
  prix_vente_ht: number
  image_url?: string | null
  photo_url?: string | null
  favori?: boolean
}

type Employe = { id: string; prenom: string; nom: string; poste: string }

export default function EmporterClient({
  initial, recettes = [], employes = [], operateurId = null, navProfil, widgetEmployeId = null, widgetInitialDone = [],
}: {
  initial: CommandeService[]
  recettes?: Recette[]
  employes?: Employe[]
  operateurId?: string | null
  navProfil?: OpsBottomNavProfil
  widgetEmployeId?: string | null
  widgetInitialDone?: string[]
}) {
  const [showComptoir, setShowComptoir] = useState(false)
  const [encaisserCmd, setEncaisserCmd] = useState<CommandeService | null>(null)
  const router = useRouter()
  const [commandes, setCommandes] = useState(initial)
  const [now, setNow] = useState(() => Date.now())
  const [, startTransition] = useTransition()
  const previousIdsRef = useRef(new Set(initial.filter(c => c.source === 'ONLINE').map(c => c.id)))
  const audioReadyRef = useRef(false)
  const [autoPrint, setAutoPrint] = useState(false)
  const [printJobs, setPrintJobs] = useState<Array<{ key: string; src: string }>>([])
  // Filtre source affiché dans l'agenda partagé : 'all' (défaut) | 'online' | 'comptoir' | 'borne'
  const [filtreSrc, setFiltreSrc] = useState<'all' | 'online' | 'comptoir' | 'borne'>('all')

  useEffect(() => {
    try { setAutoPrint(localStorage.getItem('emporter_auto_print') === '1') } catch { /* ignore */ }
  }, [])
  function toggleAutoPrint() {
    setAutoPrint(v => {
      const nv = !v
      try { localStorage.setItem('emporter_auto_print', nv ? '1' : '0') } catch { /* ignore */ }
      return nv
    })
  }

  // Tick chaque seconde pour les compteurs
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [])

  // Sync state + détection nouvelles commandes ONLINE
  useEffect(() => {
    setCommandes(initial)
    const onlineNew = initial.filter(c => c.source === 'ONLINE')
    const newIds = new Set(onlineNew.map(c => c.id))
    const nouvelles = onlineNew.filter(c => !previousIdsRef.current.has(c.id))
    if (nouvelles.length > 0 && audioReadyRef.current) {
      playDing()
      // Double ding pour ONLINE = priorité (clients attendent un créneau précis)
      setTimeout(() => playDing(), 280)
    }
    if (nouvelles.length > 0 && autoPrint) {
      const jobs: Array<{ key: string; src: string }> = []
      for (const c of nouvelles) {
        const dests = new Set(c.articles.map(a => a.tag_destination))
        for (const d of dests) {
          jobs.push({ key: `${c.id}-${d}-${Date.now()}`, src: `/print/bons/${c.id}?dest=${d}&auto=1` })
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

  // Realtime sur commandes
  useEffect(() => {
    const supabase = createClient()
    const channel = supabase
      .channel('emporter-rt')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'commandes' }, () => router.refresh())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'commande_articles' }, () => router.refresh())
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [router])

  // Filets de sécurité contre les WebSockets dormants (PWA mobile en arrière-plan,
  // OS qui suspend les sockets, etc.) :
  //   1. Quand l'onglet/PWA redevient actif → router.refresh()
  //   2. Poll toutes les 20s comme fallback si le realtime ne déclenche pas
  useEffect(() => {
    const onVisible = () => { if (document.visibilityState === 'visible') router.refresh() }
    document.addEventListener('visibilitychange', onVisible)
    const poll = setInterval(() => {
      if (document.visibilityState === 'visible') router.refresh()
    }, 20_000)
    return () => {
      document.removeEventListener('visibilitychange', onVisible)
      clearInterval(poll)
    }
  }, [router])

  // Filtre commandes ONLINE non terminées (encaisse/annule/retire_par_client filtrés en amont)
  const commandesOnline = useMemo(() => {
    return commandes
      .filter(c => c.source === 'ONLINE')
      .sort((a, b) => {
        // Priorité : créneau retrait le plus proche d'abord
        const ta = a.creneau_retrait ? new Date(a.creneau_retrait).getTime() : Number.MAX_SAFE_INTEGER
        const tb = b.creneau_retrait ? new Date(b.creneau_retrait).getTime() : Number.MAX_SAFE_INTEGER
        return ta - tb
      })
  }, [commandes])

  // Commandes COMPTOIR (prises depuis le bouton + nouvelle commande sur cette page)
  // — qui contiennent au moins un article SNACKING/PIZZA/BAR. Statut < encaisse.
  const commandesComptoirSnack = useMemo(() => {
    return commandes
      .filter(c => c.source === 'COMPTOIR')
      .filter(c => c.statut !== 'encaisse' && c.statut !== 'annule')
      .filter(c => c.articles.some(a =>
        a.tag_destination === 'SNACKING' || a.tag_destination === 'PIZZA' || a.tag_destination === 'BAR'
      ))
      .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
  }, [commandes])

  // Commandes BORNE déjà ENCAISSÉES (donc plus en attente paiement) :
  // placées dans l'agenda au créneau le plus proche (= maintenant) car
  // les commandes borne n'ont pas de creneau_retrait → servies au plus vite.
  // Les commandes en attente_paiement_comptoir restent dans le banner du haut.
  const commandesBorne = useMemo(() => {
    return commandes
      .filter(c => c.source === 'BORNE')
      .filter(c => c.statut !== 'encaisse' && c.statut !== 'annule')
      .filter(c => c.statut !== 'en_attente_paiement_comptoir') // ← uniquement après encaissement
      .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
  }, [commandes])

  // Vue agenda : groupe les commandes par créneau (heure de retrait).
  // Tri chrono ; "sans créneau" en bas.
  const commandesParCreneau = useMemo(() => {
    const map = new Map<string, { label: string; iso: string | null; commandes: typeof commandesComptoirSnack }>()
    const JOURS = ['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam']
    const aujourdhui = new Date()
    for (const c of commandesComptoirSnack) {
      const key = c.creneau_retrait ?? '__sans__'
      let label: string
      if (c.creneau_retrait) {
        const cr = new Date(c.creneau_retrait)
        const sameDay = cr.toDateString() === aujourdhui.toDateString()
        const heure = cr.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
        label = sameDay ? heure : `${JOURS[cr.getDay()]} ${cr.getDate()}/${cr.getMonth() + 1} · ${heure}`
      } else {
        label = 'Sans créneau (à servir au plus vite)'
      }
      if (!map.has(key)) map.set(key, { label, iso: c.creneau_retrait ?? null, commandes: [] })
      map.get(key)!.commandes.push(c)
    }
    return Array.from(map.values()).sort((a, b) => {
      if (!a.iso) return 1
      if (!b.iso) return -1
      return new Date(a.iso).getTime() - new Date(b.iso).getTime()
    })
  }, [commandesComptoirSnack])

  const nbEnAttente = commandesOnline.filter(c => c.statut === 'en_attente').length
  const nbPretRetrait = commandesOnline.filter(c => c.statut === 'pret_pour_retrait').length

  // ─── AGENDA PARTAGÉ : online + comptoir + borne fusionnés ────────────
  // Chaque item porte sa source pour que le renderItem choisisse le bon composant
  // et que le badge couleur soit visible (🌐 emerald online / 🛒 violet comptoir / 🛍 red borne).
  // Les commandes borne n'ont pas de créneau → tombent dans la 1ère colonne (= maintenant).
  const agendaItems = useMemo(() => {
    type Item = { creneauISO: string | null | undefined; data: CommandeService }
    const online: Item[] = commandesOnline.map(c => ({ creneauISO: c.creneau_retrait, data: c }))
    const comptoir: Item[] = commandesComptoirSnack.map(c => {
      // Multi-zones : prendre le créneau le plus proche dans creneaux_par_tag, sinon creneau_retrait
      const tagsCreneaux = c.creneaux_par_tag ?? {}
      const isos = Object.values(tagsCreneaux).filter((v): v is string => !!v)
      const minIso = isos.length > 0
        ? isos.sort((a, b) => new Date(a).getTime() - new Date(b).getTime())[0]
        : c.creneau_retrait
      return { creneauISO: minIso, data: c }
    })
    const borne: Item[] = commandesBorne.map(c => ({ creneauISO: null, data: c }))
    if (filtreSrc === 'online') return online
    if (filtreSrc === 'comptoir') return comptoir
    if (filtreSrc === 'borne') return borne
    return [...online, ...comptoir, ...borne]
  }, [commandesOnline, commandesComptoirSnack, commandesBorne, filtreSrc])

  const nbTotal = commandesOnline.length + commandesComptoirSnack.length + commandesBorne.length

  // Callbacks stables pour le modal Comptoir → évite re-render à chaque tick d'horloge.
  // Le state `now` ticke chaque seconde pour les compteurs des cartes ONLINE,
  // mais le modal n'a pas besoin d'être re-render à chaque tick.
  const fermerComptoir = useCallback(() => setShowComptoir(false), [])
  const comptoirOk = useCallback(() => {
    setShowComptoir(false)
    router.refresh()
  }, [router])

  function avancerComptoir(commande_id: string, nouveau: 'en_preparation' | 'pret' | 'servi') {
    // Optimistic update
    setCommandes(prev => prev.map(c => c.id === commande_id ? { ...c, statut: nouveau } : c))
    startTransition(async () => {
      try { await avancerCommandeComptoir({ commande_id, nouveau_statut: nouveau }) }
      catch { router.refresh() }
    })
  }

  function avancer(commande_id: string, nouveau: 'en_preparation' | 'pret_pour_retrait' | 'retire_par_client') {
    // Optimistic update
    setCommandes(prev => prev.map(c => c.id === commande_id ? { ...c, statut: nouveau } : c))
    startTransition(async () => {
      try {
        await marquerStatutCommandeOnline({ commande_id, nouveau_statut: nouveau })
      } catch (e) {
        console.error(e)
        router.refresh()
      }
    })
  }

  function activerSon() {
    audioReadyRef.current = true
    playDing()
  }

  return (
    <div className="min-h-screen flex flex-col pb-mobile-nav bg-zinc-950">
      <OpsBottomNav profil={navProfil} />

      {/* ═══ HEADER POS UNIFIÉ ═══ */}
      <header className="sticky top-0 z-20 bg-gradient-to-r from-zinc-900 via-zinc-900 to-zinc-950 border-b border-zinc-800 shadow-xl" style={{ paddingTop: 'env(safe-area-inset-top)' }}>
        <div className="md:hidden p-2 space-y-2">
          <div className="flex items-center gap-1.5">
            <span className="inline-flex items-center justify-center w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-500 to-emerald-700 text-white text-lg shadow-md shrink-0">🥪</span>
            <span className={cn(
              'flex-1 inline-flex items-center justify-center gap-1 px-2 h-10 rounded-xl ring-1 text-xs font-black tabular-nums',
              nbEnAttente > 0 ? 'bg-red-500/15 text-red-200 ring-red-500/30 animate-pulse' : 'bg-zinc-800 text-zinc-300 ring-zinc-700',
            )}>🔔 {nbEnAttente}</span>
            <span className={cn('inline-flex items-center justify-center gap-1 px-2 h-10 rounded-xl ring-1 text-xs font-black tabular-nums shrink-0',
              nbPretRetrait > 0 ? 'bg-amber-500/15 text-amber-200 ring-amber-500/30' : 'bg-zinc-800 text-zinc-300 ring-zinc-700')}>📦 {nbPretRetrait}</span>
            <Link href="/caisse" className="inline-flex items-center justify-center w-10 h-10 rounded-xl bg-zinc-100 text-zinc-900 text-lg shadow-lg shrink-0">💰</Link>
          </div>
          <div className="flex items-center gap-1.5">
            {!audioReadyRef.current && (
              <button onClick={activerSon} className="flex-1 inline-flex items-center justify-center gap-1 px-2 h-10 rounded-xl bg-zinc-800 text-zinc-200 text-xs font-black border border-zinc-700">🔔 Activer son</button>
            )}
            <button
              onClick={toggleAutoPrint}
              className={cn('flex-1 inline-flex items-center justify-center gap-1 px-2 h-10 rounded-xl text-xs font-black transition-colors',
                autoPrint ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-500/30' : 'bg-zinc-800 text-zinc-300 border border-zinc-700')}
            >🖨 Auto {autoPrint ? 'ON' : 'OFF'}</button>
          </div>
        </div>
        <div className="hidden md:flex px-3 h-14 items-center gap-2 overflow-x-auto whitespace-nowrap">
          <div className="inline-flex items-center gap-2 shrink-0">
            <span className="inline-flex items-center justify-center w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-500 to-emerald-700 text-white text-xl shadow-md">🥪</span>
            <div className="hidden lg:block">
              <p className="text-[9px] font-black uppercase tracking-[0.2em] text-emerald-400 leading-none">Service · Snack</p>
              <h1 className="font-display italic text-base font-medium text-white tracking-tight leading-none mt-0.5">Emporter</h1>
            </div>
          </div>
          <div className="inline-flex items-center gap-1.5 shrink-0">
            <span className={cn('inline-flex items-center gap-1.5 px-2.5 h-10 rounded-xl ring-1 text-xs font-black tabular-nums whitespace-nowrap',
              nbEnAttente > 0 ? 'bg-red-500/15 text-red-200 ring-red-500/30 animate-pulse' : 'bg-zinc-800 text-zinc-300 ring-zinc-700')}>
              <span className="text-base">🔔</span>{nbEnAttente} en attente
            </span>
            <span className={cn('inline-flex items-center gap-1.5 px-2.5 h-10 rounded-xl ring-1 text-xs font-black tabular-nums whitespace-nowrap',
              nbPretRetrait > 0 ? 'bg-amber-500/15 text-amber-200 ring-amber-500/30' : 'bg-zinc-800 text-zinc-300 ring-zinc-700')}>
              <span className="text-base">📦</span>{nbPretRetrait} prêtes
            </span>
          </div>
          <div className="flex-1 min-w-2" />
          {!audioReadyRef.current && (
            <button onClick={activerSon} className="inline-flex items-center gap-2 px-2.5 h-10 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-black border border-zinc-700 shrink-0">🔔 Activer son</button>
          )}
          <button
            onClick={toggleAutoPrint}
            className={cn('inline-flex items-center gap-2 px-2.5 h-10 rounded-xl text-xs font-black transition-colors shrink-0',
              autoPrint ? 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-lg shadow-emerald-500/30' : 'bg-zinc-800 hover:bg-zinc-700 text-zinc-300 border border-zinc-700')}
          >🖨 Auto : {autoPrint ? 'ON' : 'OFF'}</button>
          <Link href="/caisse" className="inline-flex items-center gap-1.5 px-2.5 h-10 rounded-xl bg-zinc-100 hover:bg-white text-zinc-900 font-black text-sm shadow-lg transition-all active:scale-95 whitespace-nowrap shrink-0">
            <span className="text-lg">💰</span><span>Caisse</span>
          </Link>
        </div>
      </header>

      {/* iframes auto-impression */}
      {printJobs.map(j => (
        <iframe key={j.key} src={j.src} aria-hidden tabIndex={-1}
          style={{ position: 'fixed', width: 0, height: 0, border: 0, opacity: 0, pointerEvents: 'none' }} />
      ))}

      <div className="px-3 pt-3">
        <TachesSequentielles poste="caisse_snacking" employeId={widgetEmployeId} initialDone={widgetInitialDone} theme="dark" />
      </div>

      <main className="flex-1 p-3 space-y-3 pb-32">
        {/* ═══ AGENDA UNIQUE PARTAGÉ (online + comptoir) ═══
            Filtres source via tabs au-dessus. Chaque ticket porte son badge
            couleur (🌐 emerald online / 🛒 violet comptoir) pour distinction. */}
        <section>
          <div className="flex items-center justify-between mb-2 px-1 gap-2 flex-wrap">
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center justify-center w-7 h-7 rounded-lg bg-zinc-800 text-zinc-100 ring-1 ring-zinc-700">🗓</span>
              <h2 className="font-display italic text-base text-white tracking-tight">
                Agenda <span className="text-zinc-500">·</span> 15 min
              </h2>
              <span className="inline-flex items-center px-2 h-6 rounded-full bg-zinc-800 text-zinc-200 text-[10px] font-black tabular-nums">
                {nbTotal}
              </span>
            </div>
            {/* TABS filtre source */}
            <div className="flex items-center gap-1 p-1 rounded-xl bg-zinc-900 ring-1 ring-zinc-800">
              <button
                onClick={() => setFiltreSrc('all')}
                className={cn(
                  'inline-flex items-center gap-1.5 px-3 h-8 rounded-lg text-xs font-black transition-all tabular-nums',
                  filtreSrc === 'all'
                    ? 'bg-zinc-100 text-zinc-900 shadow'
                    : 'text-zinc-400 hover:text-zinc-200',
                )}
              >
                <span>Toutes</span>
                <span className="text-[10px] opacity-70">{nbTotal}</span>
              </button>
              <button
                onClick={() => setFiltreSrc('online')}
                className={cn(
                  'inline-flex items-center gap-1.5 px-3 h-8 rounded-lg text-xs font-black transition-all tabular-nums',
                  filtreSrc === 'online'
                    ? 'bg-emerald-500 text-white shadow shadow-emerald-500/30'
                    : 'text-emerald-300 hover:text-emerald-200',
                )}
              >
                <span>🌐 Online</span>
                <span className="text-[10px] opacity-80">{commandesOnline.length}</span>
              </button>
              <button
                onClick={() => setFiltreSrc('comptoir')}
                className={cn(
                  'inline-flex items-center gap-1.5 px-3 h-8 rounded-lg text-xs font-black transition-all tabular-nums',
                  filtreSrc === 'comptoir'
                    ? 'bg-violet-500 text-white shadow shadow-violet-500/30'
                    : 'text-violet-300 hover:text-violet-200',
                )}
              >
                <span>🛒 Comptoir</span>
                <span className="text-[10px] opacity-80">{commandesComptoirSnack.length}</span>
              </button>
              <button
                onClick={() => setFiltreSrc('borne')}
                className={cn(
                  'inline-flex items-center gap-1.5 px-3 h-8 rounded-lg text-xs font-black transition-all tabular-nums',
                  filtreSrc === 'borne'
                    ? 'bg-red-500 text-white shadow shadow-red-500/30'
                    : 'text-red-300 hover:text-red-200',
                )}
              >
                <span>🛍 Borne</span>
                <span className="text-[10px] opacity-80">{commandesBorne.length}</span>
              </button>
            </div>
            <p className="hidden lg:block text-[10px] uppercase tracking-widest text-zinc-500 ml-auto">⟵ Scroll horizontal ⟶</p>
          </div>
          <AgendaCreneauxColonnes
            items={agendaItems}
            renderItem={(c) => (
              c.source === 'ONLINE' ? (
                <CommandeOnlineCard
                  key={c.id}
                  commande={c}
                  now={now}
                  onAvancer={avancer}
                />
              ) : (
                <CommandeComptoirCard
                  key={c.id}
                  commande={c}
                  onAvancer={avancerComptoir}
                  onEncaisser={() => setEncaisserCmd(c)}
                />
              )
            )}
            // Accent neutre/zinc en mode "toutes", couleur source si filtré
            accent={filtreSrc === 'online' ? 'emerald' : filtreSrc === 'comptoir' ? 'violet' : filtreSrc === 'borne' ? 'red' : 'emerald'}
            now={new Date(now)}
            emptyMessage={
              filtreSrc === 'online' ? 'Aucune commande online en cours.'
              : filtreSrc === 'comptoir' ? 'Aucune commande snack comptoir.'
              : filtreSrc === 'borne' ? 'Aucune commande borne encaissée.'
              : 'Aucune commande dans l\'agenda. Clique « + Nouvelle commande ».'
            }
          />
        </section>
      </main>

      {/* FAB : nouvelle commande snack/pizza/bar — visible si recettes chargées */}
      {recettes.length > 0 && (
        <button
          onClick={() => setShowComptoir(true)}
          className={cn(
            'fixed right-4 z-30 inline-flex items-center gap-2 rounded-full',
            'bg-emerald-500 hover:bg-emerald-400 text-white font-bold shadow-2xl',
            'transition-all active:scale-95 px-5 py-3 text-sm',
            'bottom-[calc(64px+env(safe-area-inset-bottom)+16px)] md:bottom-6',
          )}
          aria-label="Nouvelle commande snack"
        >
          <span className="text-lg leading-none">+</span>
          <span>Nouvelle commande</span>
        </button>
      )}

      {/* Modal saisie commande snacking/pizza/bar */}
      {showComptoir && (
        <ComptoirSnackModalMemo
          recettes={recettes}
          barmanId={operateurId}
          onClose={fermerComptoir}
          onSuccess={comptoirOk}
        />
      )}

      {/* Modal d'encaissement (réutilisé depuis /serveur) */}
      {encaisserCmd && (
        <EncaissementModal
          commande={encaisserCmd}
          serveurId={operateurId ?? ''}
          employes={employes}
          onClose={() => setEncaisserCmd(null)}
          onSuccess={() => {
            setEncaisserCmd(null)
            router.refresh()
          }}
        />
      )}
    </div>
  )
}

// ─── Card commande COMPTOIR snack ────────────────────────────
function CommandeComptoirCard({
  commande, onAvancer, onEncaisser,
}: {
  commande: CommandeService
  onAvancer: (commande_id: string, nouveau: 'en_preparation' | 'pret' | 'servi') => void
  onEncaisser: () => void
}) {
  const heureCreation = new Date(commande.created_at).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
  const total = commande.articles.reduce((s, a) => s + a.quantite * a.prix_unitaire_ht, 0)

  // ─── Affichage créneaux : un par zone si multi (snack 14:30 · pizza 14:45), sinon créneau unique
  const ICONE_TAG: Record<string, string> = { SNACKING: '🥪', PIZZA: '🍕', BAR: '🍷', CUISINE: '👨‍🍳' }
  const aujourdhui = new Date()
  const JOURS = ['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam']
  function formatHeure(iso: string) {
    const cr = new Date(iso)
    const sameDay = cr.toDateString() === aujourdhui.toDateString()
    const heure = cr.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
    return { heure, sameDay, prefix: sameDay ? '' : `${JOURS[cr.getDay()]} ${cr.getDate()}/${cr.getMonth() + 1} · ` }
  }

  // Construit l'affichage par tag distinct si creneaux_par_tag présent et non vide
  const creneauxParTag = commande.creneaux_par_tag ?? {}
  const tagsAvecCreneau = Object.entries(creneauxParTag).filter(([, iso]) => !!iso)

  // Détection urgence : on prend le créneau le plus proche (= min) pour déclencher l'alerte
  const tousLesIso: string[] = tagsAvecCreneau.length > 0
    ? tagsAvecCreneau.map(([, iso]) => iso as string)
    : (commande.creneau_retrait ? [commande.creneau_retrait] : [])
  const isoLePlusProche = tousLesIso.sort((a, b) => new Date(a).getTime() - new Date(b).getTime())[0]
  const creneauUrgent = isoLePlusProche
    ? ((new Date(isoLePlusProche).getTime() - aujourdhui.getTime()) / 60_000) < 15
    : false

  // Label : multi ou mono
  let creneauNode: ReactNode = <span>🚀 Sans créneau</span>
  if (tagsAvecCreneau.length >= 2) {
    creneauNode = (
      <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
        {tagsAvecCreneau
          .sort(([, a], [, b]) => new Date(a as string).getTime() - new Date(b as string).getTime())
          .map(([tag, iso]) => {
            const f = formatHeure(iso as string)
            return (
              <span key={tag} className="inline-flex items-center gap-1">
                <span>{ICONE_TAG[tag] ?? '🕒'}</span>
                <span className="tabular-nums">{f.prefix}{f.heure}</span>
              </span>
            )
          })}
      </span>
    )
  } else if (tagsAvecCreneau.length === 1) {
    const [tag, iso] = tagsAvecCreneau[0]
    const f = formatHeure(iso as string)
    creneauNode = <span>{ICONE_TAG[tag] ?? '🕒'} {f.prefix}{f.heure}</span>
  } else if (commande.creneau_retrait) {
    // Legacy : pas de breakdown par tag mais un créneau global
    const f = formatHeure(commande.creneau_retrait)
    creneauNode = <span>🕒 {f.prefix}{f.heure}</span>
  }

  // Statut commande → label & action suivante
  const statutInfo: Record<string, { label: string; cls: string; nextLabel: string | null; nextStatut: 'en_preparation' | 'pret' | 'servi' | null }> = {
    en_attente:     { label: '🆕 NOUVELLE',     cls: 'bg-blue-500 text-white',    nextLabel: '🔥 Préparer',  nextStatut: 'en_preparation' },
    en_preparation: { label: '🔥 EN PRÉP',      cls: 'bg-amber-500 text-white',   nextLabel: '✓ Marquer prêt', nextStatut: 'pret' },
    pret:           { label: '✓ PRÊT',           cls: 'bg-emerald-500 text-white', nextLabel: '🍽 Donné au client', nextStatut: 'servi' },
    servi:          { label: '🍽 DONNÉ',         cls: 'bg-zinc-500 text-white',    nextLabel: null,              nextStatut: null },
  }
  const s = statutInfo[commande.statut] ?? { label: commande.statut, cls: 'bg-zinc-700 text-white', nextLabel: null, nextStatut: null }

  return (
    <article className={cn(
      'rounded-lg border p-3 flex flex-col gap-2 transition-colors',
      creneauUrgent ? 'border-red-500 bg-red-950/40' : 'border-zinc-700 bg-zinc-900',
    )}>
      <header className="flex items-center justify-between gap-2">
        <div>
          <p className="text-xs text-zinc-500">#{commande.numero} · créée {heureCreation}</p>
          <p className="text-base font-bold text-white">🛒 Comptoir</p>
        </div>
        <span className={cn('text-[10px] font-bold px-2 py-1 rounded uppercase tracking-wider', s.cls)}>
          {s.label}
        </span>
      </header>

      {/* Bandeau créneau(x) retrait — multi-zones si distinct, mono sinon */}
      <div className={cn(
        'flex items-center justify-between gap-2 px-2 py-1 rounded text-sm font-bold',
        creneauUrgent
          ? 'bg-red-600 text-white animate-pulse'
          : (commande.creneau_retrait || tagsAvecCreneau.length > 0)
            ? 'bg-emerald-600/20 text-emerald-300 border border-emerald-700'
            : 'bg-zinc-800 text-zinc-400 border border-zinc-700',
      )}>
        {creneauNode}
        {creneauUrgent && <span className="text-[10px] uppercase">⚠ Urgent</span>}
      </div>

      {(() => {
        // Split poste SNACK vs autres (pizza/bar/cuisine) — coordination livraison.
        const articlesSnack = commande.articles.filter(a => a.tag_destination === 'SNACKING')
        const autresArticles = commande.articles.filter(a => a.tag_destination !== 'SNACKING')
        const aDuSnack = articlesSnack.length > 0
        const tousLesAutresPrets = autresArticles.length > 0
          && autresArticles.every(a => a.statut === 'pret' || a.statut === 'servi')
        return (
          <>
            {/* MON POSTE — articles SNACK : ce que prépare le snack-man, en gros, encadré */}
            {aDuSnack && (
              <div className="rounded-md bg-emerald-950/40 border-2 border-emerald-700/50 p-2.5">
                <p className="text-[10px] uppercase tracking-wider text-emerald-400 font-bold mb-1.5">
                  🥪 Mon poste — Snack
                </p>
                <ul className="space-y-1.5">
                  {articlesSnack.map(a => (
                    <li key={a.id} className="flex items-center justify-between gap-2 text-white">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="text-3xl font-black tabular-nums text-emerald-400 shrink-0 leading-none">×{a.quantite}</span>
                        <span className="text-lg font-bold leading-tight">{a.recette_nom}</span>
                      </div>
                      <span className="text-[11px] text-zinc-500 tabular-nums shrink-0">{fmtPrix(a.quantite * a.prix_unitaire_ht)}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* AUTRES — pizza/bar/cuisine : info pour le snack-man, en petit, encart sobre */}
            {autresArticles.length > 0 && (
              <div className="rounded border border-zinc-800 bg-zinc-950 px-2 py-1.5">
                <p className="text-[9px] uppercase tracking-wider text-zinc-500 font-bold mb-1">
                  📦 Autres postes {tousLesAutresPrets && <span className="text-emerald-400">· tout est prêt</span>}
                </p>
                <ul className="space-y-0.5">
                  {autresArticles.map(a => {
                    const tagInfo = ICONE_TAG[a.tag_destination] ?? '·'
                    const aSty = STATUT_ARTICLE_LABEL[a.statut]
                    return (
                      <li key={a.id} className="flex items-center justify-between text-[11px] gap-2">
                        <span className="truncate text-zinc-400">
                          <span className="opacity-70">{tagInfo}</span> <b className="tabular-nums">×{a.quantite}</b> {a.recette_nom}
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
          </>
        )
      })()}

      <div className="flex items-center justify-between pt-1 border-t border-zinc-800">
        <span className="text-xs text-zinc-400">Total</span>
        <span className="text-lg font-bold text-white tabular-nums">{fmtPrix(total)}</span>
      </div>

      <div className="flex gap-2 mt-1">
        {s.nextLabel && s.nextStatut && (
          <button
            onClick={() => onAvancer(commande.id, s.nextStatut!)}
            className="flex-1 min-h-[44px] rounded-md bg-amber-500 hover:bg-amber-400 text-white font-bold text-sm transition-colors active:scale-95"
          >
            {s.nextLabel}
          </button>
        )}
        {(commande.statut === 'pret' || commande.statut === 'servi') && (
          <button
            onClick={onEncaisser}
            className="flex-1 min-h-[44px] rounded-md bg-emerald-500 hover:bg-emerald-400 text-white font-bold text-sm transition-colors active:scale-95"
          >
            💰 Encaisser
          </button>
        )}
      </div>
    </article>
  )
}

// ─── Card commande ONLINE ────────────────────────────────────
function CommandeOnlineCard({
  commande, now, onAvancer,
}: {
  commande: CommandeService
  now: number
  onAvancer: (commande_id: string, nouveau: 'en_preparation' | 'pret_pour_retrait' | 'retire_par_client') => void
}) {
  const creneauTime = commande.creneau_retrait ? new Date(commande.creneau_retrait).getTime() : null
  const minutesRestantes = creneauTime ? Math.round((creneauTime - now) / 60000) : null

  // Couleurs urgence selon temps restant avant retrait
  const urgence = minutesRestantes === null ? 'normal'
    : minutesRestantes < 0 ? 'depasse'
    : minutesRestantes < 10 ? 'urgent'
    : minutesRestantes < 20 ? 'proche'
    : 'normal'

  const urgenceCls = {
    depasse: 'border-red-500 bg-red-950/40',
    urgent:  'border-amber-500 bg-amber-950/30',
    proche:  'border-blue-500 bg-blue-950/20',
    normal:  'border-zinc-700 bg-zinc-900',
  }[urgence]

  const minutesCls = {
    depasse: 'bg-red-600 text-white',
    urgent:  'bg-amber-500 text-white',
    proche:  'bg-blue-500 text-white',
    normal:  'bg-zinc-800 text-zinc-200',
  }[urgence]

  const statutInfo: Record<string, { label: string; emoji: string; cls: string }> = {
    en_attente:        { label: 'À PRENDRE',      emoji: '🆕', cls: 'bg-blue-500 text-white' },
    en_preparation:    { label: 'EN PRÉPARATION', emoji: '🔥', cls: 'bg-amber-500 text-white' },
    pret:              { label: 'PRÊT',           emoji: '✓',  cls: 'bg-emerald-500 text-white' },
    pret_pour_retrait: { label: 'PRÊT À RETIRER', emoji: '🎁', cls: 'bg-emerald-500 text-white' },
    retire_par_client: { label: 'RETIRÉ',         emoji: '✓',  cls: 'bg-zinc-500 text-white' },
  }
  const sty = statutInfo[commande.statut] ?? statutInfo.en_attente

  // Allergènes agrégés
  const allergenes = Array.from(new Set(commande.articles.flatMap(a => a.allergenes_a_eviter)))

  // Bouton action selon statut courant
  const nextStatut: 'en_preparation' | 'pret_pour_retrait' | 'retire_par_client' | null =
    commande.statut === 'en_attente' ? 'en_preparation' :
    commande.statut === 'en_preparation' ? 'pret_pour_retrait' :
    commande.statut === 'pret_pour_retrait' ? 'retire_par_client' :
    null

  const nextLabel = {
    en_preparation:    '🔥 Prendre en préparation',
    pret_pour_retrait: '🎁 Marquer prêt',
    retire_par_client: '✓ Client a retiré',
  }

  return (
    <div className={cn('rounded-lg border-2 overflow-hidden', urgenceCls)}>
      {/* Header : créneau retrait en GROS */}
      <div className={cn('px-3 py-2 flex items-center justify-between gap-2', minutesCls)}>
        <div>
          <p className="text-[10px] uppercase tracking-wider opacity-80">Retrait</p>
          {creneauTime ? (
            <p className="text-xl font-bold">
              {new Date(creneauTime).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
            </p>
          ) : (
            <p className="text-sm font-bold">— pas de créneau —</p>
          )}
        </div>
        <div className="text-right">
          {minutesRestantes !== null && (
            <p className="text-2xl font-bold tabular-nums">
              {minutesRestantes < 0 ? `+${Math.abs(minutesRestantes)} min` : `${minutesRestantes} min`}
            </p>
          )}
          <p className="text-[10px] uppercase tracking-wider opacity-80">
            {urgence === 'depasse' ? 'EN RETARD' : urgence === 'urgent' ? 'urgent' : urgence === 'proche' ? 'bientôt' : 'à temps'}
          </p>
        </div>
      </div>

      {/* Infos commande */}
      <div className="px-3 py-2 border-b border-zinc-800 flex items-center justify-between gap-2 bg-emerald-950/30">
        <span className="text-xs text-emerald-300 font-bold">
          🌐 ONLINE · #{commande.numero?.slice(-6) ?? commande.id.slice(-6)}
        </span>
        <a
          href={`/print/bons/${commande.id}?dest=SNACKING`}
          target="_blank"
          rel="noopener"
          className="text-xs h-7 px-2 inline-flex items-center rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-200 font-bold"
          title="Réimprimer le bon"
        >🖨</a>
      </div>

      {/* Allergènes */}
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

      {/* Articles */}
      <ul className="divide-y divide-zinc-800">
        {commande.articles.map(a => (
          <li key={a.id} className="px-3 py-2">
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-bold tabular-nums text-zinc-100">×{a.quantite}</span>
              <p className="text-base font-semibold leading-tight text-zinc-100">{a.recette_nom}</p>
              <span className="ml-auto text-[10px] px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-300">
                {a.tag_destination}
              </span>
            </div>
            {a.commentaire && (
              <p className="mt-1 text-xs text-amber-300 bg-amber-900/30 border border-amber-800 rounded px-2 py-1 italic">
                ⚠ {a.commentaire}
              </p>
            )}
          </li>
        ))}
      </ul>

      {/* Total + statut + action */}
      <div className="px-3 py-3 border-t border-zinc-800 bg-zinc-950/50 space-y-2">
        <div className="flex items-center justify-between">
          <span className={cn('text-xs font-bold uppercase tracking-wider px-2 py-1 rounded', sty.cls)}>
            {sty.emoji} {sty.label}
          </span>
          <span className="text-base font-bold tabular-nums text-emerald-300">
            {fmtPrix(Number(commande.montant_total_ttc ?? 0))}
          </span>
        </div>
        {nextStatut && (
          <button
            onClick={() => onAvancer(commande.id, nextStatut)}
            className={cn(
              'w-full min-h-[48px] rounded-md font-bold text-sm uppercase tracking-wider transition-colors active:scale-[0.98]',
              nextStatut === 'en_preparation'    ? 'bg-amber-500 hover:bg-amber-400 text-white' :
              nextStatut === 'pret_pour_retrait' ? 'bg-emerald-500 hover:bg-emerald-400 text-white' :
                                                    'bg-zinc-600 hover:bg-zinc-500 text-white'
            )}
          >
            {nextLabel[nextStatut]}
          </button>
        )}
      </div>
    </div>
  )
}

// Wrapper memoïsé pour ComptoirOrderModal — empêche re-render à chaque tick d'horloge
// du parent (qui ticke chaque seconde pour les compteurs ONLINE).
// withCreneaux est une référence stable car définie au niveau module.
// Sur /emporter (poste snack), on accepte les 3 plannings → le modal affichera un
// sélecteur de créneau pour chaque tag réellement présent dans le panier.
const SNACK_CRENEAUX = { tagsAvecPlanning: ['SNACKING', 'PIZZA', 'BAR'] as Array<'SNACKING' | 'PIZZA' | 'BAR'> }
const ComptoirSnackModalMemo = memo(function ComptoirSnackModalMemo(props: {
  recettes: Recette[]
  barmanId: string | null
  onClose: () => void
  onSuccess: (commandeId: string) => void
}) {
  // paiementAuComptoir=true : la commande passe par le banner d'encaissement
  // /emporter avant de partir en cuisine (même flow que la borne).
  return <ComptoirOrderModal {...props} withCreneaux={SNACK_CRENEAUX} tagInitial="SNACKING" paiementAuComptoir />
})

function KPI({ label, value, accent = 'default', pulse }: { label: string; value: string | number; accent?: 'default' | 'red' | 'orange'; pulse?: boolean }) {
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
