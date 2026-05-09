'use client'

// Vue staff /emporter — commandes ONLINE en cours.
// Filtre source='ONLINE'. Affiche un compte à rebours du créneau retrait
// avec couleur d'urgence si <10 min. Sonnerie distincte à l'arrivée.
// Actions : Prendre en prep → Prêt → Retiré par client.

import { useEffect, useMemo, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { cn } from '@/lib/utils'
import { type CommandeService, fmtPrix, playDing } from '@/lib/service'
import { ALLERGENE_INFO, type Allergene } from '@/lib/allergenes'
import { marquerStatutCommandeOnline } from '../actions'
import OpsBottomNav, { type OpsBottomNavProfil } from '@/components/OpsBottomNav'
import TachesDuJourWidget from '@/components/TachesDuJourWidget'

export default function EmporterClient({
  initial, navProfil, widgetEmployeId = null, widgetInitialDone = [],
}: {
  initial: CommandeService[]
  navProfil?: OpsBottomNavProfil
  widgetEmployeId?: string | null
  widgetInitialDone?: string[]
}) {
  const router = useRouter()
  const [commandes, setCommandes] = useState(initial)
  const [now, setNow] = useState(() => Date.now())
  const [, startTransition] = useTransition()
  const previousIdsRef = useRef(new Set(initial.filter(c => c.source === 'ONLINE').map(c => c.id)))
  const audioReadyRef = useRef(false)
  const [autoPrint, setAutoPrint] = useState(false)
  const [printJobs, setPrintJobs] = useState<Array<{ key: string; src: string }>>([])

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

  const nbEnAttente = commandesOnline.filter(c => c.statut === 'en_attente').length
  const nbPretRetrait = commandesOnline.filter(c => c.statut === 'pret_pour_retrait').length

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

      <header className="sticky top-0 z-20 bg-zinc-900/95 backdrop-blur border-b border-zinc-800" style={{ paddingTop: 'env(safe-area-inset-top)' }}>
        <div className="px-4 py-3 flex items-center justify-between gap-3 flex-wrap">
          <div>
            <p className="text-xs font-bold uppercase tracking-wider text-emerald-400">Service — Emporter</p>
            <h1 className="text-2xl sm:text-3xl font-bold text-white">📦 Commandes ONLINE</h1>
          </div>
          <div className="flex items-center gap-3">
            <KPI label="En attente" value={nbEnAttente} accent={nbEnAttente > 0 ? 'red' : 'default'} pulse={nbEnAttente > 0} />
            <KPI label="Prêtes" value={nbPretRetrait} accent={nbPretRetrait > 0 ? 'orange' : 'default'} />
            {!audioReadyRef.current && (
              <button onClick={activerSon} className="text-xs px-3 py-2 rounded-md bg-zinc-800 hover:bg-zinc-700 text-white border border-zinc-700">
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
            >
              🖨 Auto : {autoPrint ? 'ON' : 'OFF'}
            </button>
          </div>
        </div>
      </header>

      {/* iframes auto-impression */}
      {printJobs.map(j => (
        <iframe key={j.key} src={j.src} aria-hidden tabIndex={-1}
          style={{ position: 'fixed', width: 0, height: 0, border: 0, opacity: 0, pointerEvents: 'none' }} />
      ))}

      <div className="px-3 pt-3">
        <TachesDuJourWidget poste="cuisinier" theme="dark" employeId={widgetEmployeId} initialDone={widgetInitialDone} />
      </div>

      <main className="flex-1 p-3 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 pb-32">
        {commandesOnline.length === 0 ? (
          <div className="col-span-full text-center text-zinc-500 py-16">
            <p className="text-6xl mb-3">📦</p>
            <p className="text-base">Aucune commande ONLINE en cours.</p>
            <p className="text-xs mt-2">Les commandes du site web apparaîtront ici en temps réel.</p>
          </div>
        ) : (
          commandesOnline.map(c => (
            <CommandeOnlineCard
              key={c.id}
              commande={c}
              now={now}
              onAvancer={avancer}
            />
          ))
        )}
      </main>
    </div>
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

function KPI({ label, value, accent = 'default', pulse }: { label: string; value: string | number; accent?: 'default' | 'red' | 'orange'; pulse?: boolean }) {
  const cls = { default: 'bg-zinc-800 text-zinc-100', red: 'bg-red-600 text-white', orange: 'bg-amber-500 text-white' }[accent]
  return (
    <div className={cn('rounded-md px-3 py-1.5 text-center min-w-20', cls, pulse && 'animate-pulse')}>
      <p className="text-[10px] uppercase tracking-wider opacity-80">{label}</p>
      <p className="text-base font-bold tabular-nums leading-tight">{value}</p>
    </div>
  )
}
