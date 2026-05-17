'use client'

/**
 * Banner BORNE COMPTOIR dans /caisse.
 * Affiche en temps réel les commandes en attente_paiement_comptoir
 * issues de la borne kiosk. Compte à rebours d'expiration, badge rouge
 * pulsant, son distinct à l'arrivée. Bouton 'Encaisser' pour basculer
 * la commande en cuisine.
 *
 * Realtime sur table commandes (filtre source='BORNE' + statut spécifique).
 */

import { useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { cn } from '@/lib/utils'
import { fmtPrix, playDing } from '@/lib/service'
import { marquerBornePayee, annulerCommandeBorne } from '@/app/borne/actions'
import PinManagerModal from '@/components/PinManagerModal'

type CommandeBorne = {
  id: string
  numero: string
  montant_total_ttc: number
  borne_payment_method: 'nfc' | 'comptoir' | null
  borne_expire_at: string | null
  created_at: string
  borne_id: string | null
}

export default function CaisseBorneBanner({ initial }: { initial: CommandeBorne[] }) {
  const router = useRouter()
  const [commandes, setCommandes] = useState<CommandeBorne[]>(initial)
  const [now, setNow] = useState(() => Date.now())
  const previousIdsRef = useRef(new Set(initial.map(c => c.id)))
  const audioReadyRef = useRef(false)
  // PIN gate : on stocke l'action à exécuter une fois le PIN validé
  const [pinAction, setPinAction] = useState<
    | { type: 'encaisser'; cmd: CommandeBorne }
    | { type: 'refuser'; cmd: CommandeBorne }
    | null
  >(null)

  useEffect(() => {
    setCommandes(initial)
    // Détection nouvelles commandes → 3 dings distincts
    const newIds = new Set(initial.map(c => c.id))
    const nouvelles = initial.filter(c => !previousIdsRef.current.has(c.id))
    if (nouvelles.length > 0 && audioReadyRef.current) {
      playDing(); setTimeout(playDing, 200); setTimeout(playDing, 400)
    }
    previousIdsRef.current = newIds
  }, [initial])

  // Tick chaque seconde pour les compteurs
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [])

  // Realtime sur commandes (filtre côté client pour BORNE + statut)
  useEffect(() => {
    const supabase = createClient()
    const channel = supabase
      .channel('caisse_borne_banner')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'commandes' }, () => {
        router.refresh()
      })
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [router])

  // Active le son (politique navigateur : 1 interaction utilisateur requise)
  function activerSon() {
    audioReadyRef.current = true
    playDing()
  }

  // Les actions sont déclenchées APRÈS validation du PIN manager
  function encaisser(c: CommandeBorne) { setPinAction({ type: 'encaisser', cmd: c }) }
  function refuser(c: CommandeBorne)   { setPinAction({ type: 'refuser', cmd: c }) }

  async function executerActionApresPin(employeNom: string) {
    if (!pinAction) return
    const { type, cmd } = pinAction
    setPinAction(null)
    try {
      if (type === 'encaisser') {
        await marquerBornePayee({ commande_id: cmd.id, payment_intent_id: null, via: 'comptoir' })
      } else {
        await annulerCommandeBorne({ commande_id: cmd.id, raison: 'manuel', borne_id: cmd.borne_id ?? undefined })
      }
      router.refresh()
    } catch (e) {
      alert(`Erreur (${employeNom}) : ` + (e instanceof Error ? e.message : String(e)))
    }
  }

  if (commandes.length === 0) return null

  return (
    <>
    <section className="rounded-2xl border-2 border-red-500/60 bg-gradient-to-br from-red-950/40 to-zinc-900 p-4 space-y-3 animate-pulse-slow">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center justify-center w-9 h-9 rounded-xl bg-red-600 text-white text-lg shadow-lg shadow-red-500/30">
            🛍
          </span>
          <h2 className="font-display italic text-xl text-white">
            Borne comptoir
            <span className="ml-2 inline-flex items-center px-2 h-6 rounded-full bg-red-500 text-white text-xs font-black tabular-nums">
              {commandes.length}
            </span>
          </h2>
          <span className="text-[10px] uppercase tracking-widest text-red-300 font-bold">À encaisser</span>
        </div>
        {!audioReadyRef.current && (
          <button onClick={activerSon} className="px-3 h-9 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-xs font-black text-zinc-200">
            🔔 Activer son
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {commandes.map(c => {
          const expireMs = c.borne_expire_at ? new Date(c.borne_expire_at).getTime() : null
          const timeLeft = expireMs ? Math.max(0, Math.round((expireMs - now) / 1000)) : null
          const urgent = timeLeft !== null && timeLeft < 120
          return (
            <article key={c.id} className={cn(
              'rounded-2xl border-2 p-3 bg-zinc-950',
              urgent ? 'border-red-500 shadow-lg shadow-red-500/30' : 'border-red-700/60',
            )}>
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-display italic text-3xl font-medium tabular-nums text-white leading-none">
                    #{c.numero?.slice(-4)}
                  </p>
                  <p className="text-[10px] uppercase tracking-widest text-zinc-500 mt-1">
                    Borne {c.borne_id ?? '—'}
                  </p>
                </div>
                {timeLeft !== null && (
                  <span className={cn(
                    'inline-flex items-center gap-1 px-2 h-8 rounded-xl text-xs font-black tabular-nums whitespace-nowrap',
                    urgent ? 'bg-red-600 text-white animate-pulse' : 'bg-zinc-800 text-zinc-300',
                  )}>
                    ⏱ {Math.floor(timeLeft / 60)}:{String(timeLeft % 60).padStart(2, '0')}
                  </span>
                )}
              </div>
              <p className="font-display italic text-2xl font-medium tabular-nums text-emerald-400 mt-2">
                {fmtPrix(Number(c.montant_total_ttc))}
              </p>
              <div className="flex gap-2 mt-3">
                <button
                  onClick={() => encaisser(c)}
                  className="flex-1 h-11 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-white font-black text-xs uppercase tracking-wider shadow active:scale-95"
                >
                  ✓ Encaisser
                </button>
                <button
                  onClick={() => refuser(c)}
                  className="px-3 h-11 rounded-xl bg-zinc-800 hover:bg-red-600 text-zinc-300 hover:text-white font-black text-xs uppercase"
                  title="Annuler"
                >
                  ✗
                </button>
              </div>
            </article>
          )
        })}
      </div>
    </section>

    {/* Modal PIN manager : gate sur Encaisser / Annuler ─────────────── */}
    <PinManagerModal
      open={pinAction !== null}
      title={
        pinAction?.type === 'encaisser'
          ? `Encaisser #${pinAction.cmd.numero?.slice(-4)}`
          : pinAction?.type === 'refuser'
            ? `Annuler #${pinAction.cmd.numero?.slice(-4)}`
            : ''
      }
      subtitle={pinAction ? fmtPrix(pinAction.cmd.montant_total_ttc) : undefined}
      onValid={executerActionApresPin}
      onClose={() => setPinAction(null)}
    />
    </>
  )
}
