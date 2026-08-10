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
import { toast } from '@/lib/toast'
import { askConfirm } from '@/lib/confirm'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { cn } from '@/lib/utils'
import { fmtPrix, playDing, type CommandeService } from '@/lib/service'
import { annulerCommandeBorne } from '@/app/borne/actions'
import { getCommandeServiceById } from '@/app/(ops)/actions'
import PinManagerModal from '@/components/PinManagerModal'
import EncaissementModal from '@/app/(ops)/serveur/EncaissementModal'

type Employe = { id: string; prenom: string; nom: string; poste: string }

type CommandeBorne = {
  id: string
  numero: string
  source: 'BORNE' | 'COMPTOIR'  // BORNE = client a commandé seul (PIN requis) / COMPTOIR = snackiste a pris la commande (pas de PIN)
  montant_total_ttc: number
  borne_payment_method: 'nfc' | 'comptoir' | null
  borne_expire_at: string | null
  created_at: string
  borne_id: string | null
  client_nom?: string | null
  consommation?: 'sur_place' | 'emporter'
}

export default function CaisseBorneBanner({
  initial, employes = [], operateurId = null,
}: {
  initial: CommandeBorne[]
  employes?: Employe[]
  operateurId?: string | null
}) {
  const router = useRouter()
  const [commandes, setCommandes] = useState<CommandeBorne[]>(initial)
  const [now, setNow] = useState(() => Date.now())
  const previousIdsRef = useRef(new Set(initial.map(c => c.id)))
  const audioReadyRef = useRef(false)
  // PIN gate : étape 1 si source=BORNE
  const [pinAction, setPinAction] = useState<
    | { type: 'encaisser'; cmd: CommandeBorne }
    | { type: 'refuser'; cmd: CommandeBorne }
    | null
  >(null)
  // Étape 2 : commande chargée en CommandeService prête pour EncaissementModal
  const [encaisserCmd, setEncaisserCmd] = useState<CommandeService | null>(null)
  const [chargement, setChargement] = useState(false)

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

  // Charge la commande complète (articles) puis ouvre EncaissementModal
  async function chargerEtOuvrir(c: CommandeBorne) {
    setChargement(true)
    try {
      const full = await getCommandeServiceById(c.id)
      setEncaisserCmd(full as CommandeService)
    } catch (e) {
      toast.error('Erreur chargement commande : ' + (e instanceof Error ? e.message : String(e)))
    } finally {
      setChargement(false)
    }
  }

  // BORNE → PIN obligatoire (client peut être malveillant)
  // COMPTOIR → pas de PIN (le snackiste prend la commande lui-même)
  function encaisser(c: CommandeBorne) {
    if (c.source === 'BORNE') {
      setPinAction({ type: 'encaisser', cmd: c })
    } else {
      void chargerEtOuvrir(c)
    }
  }
  async function refuser(c: CommandeBorne) {
    if (c.source === 'BORNE') {
      setPinAction({ type: 'refuser', cmd: c })
    } else {
      // Annulation directe (avec confirm)
      if (await askConfirm(`Annuler la commande #${c.numero?.slice(-4)} ?`)) {
        void annulerCommandeBorne({ commande_id: c.id, raison: 'manuel', borne_id: c.borne_id ?? undefined })
          .then(() => router.refresh())
      }
    }
  }

  async function executerActionApresPin(employeNom: string) {
    if (!pinAction) return
    const { type, cmd } = pinAction
    setPinAction(null)
    try {
      if (type === 'encaisser') {
        // PIN OK → charge la commande complète et ouvre EncaissementModal standard
        await chargerEtOuvrir(cmd)
      } else {
        // Annulation : action directe (déjà confirmée par le PIN)
        await annulerCommandeBorne({ commande_id: cmd.id, raison: 'manuel', borne_id: cmd.borne_id ?? undefined })
        router.refresh()
      }
    } catch (e) {
      toast.error(`Erreur (${employeNom}) : ` + (e instanceof Error ? e.message : String(e)))
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
            À encaisser
            <span className="ml-2 inline-flex items-center px-2 h-6 rounded-full bg-red-500 text-white text-xs font-black tabular-nums">
              {commandes.length}
            </span>
          </h2>
          <span className="text-[10px] uppercase tracking-widest text-red-300 font-bold">Borne + snack comptoir</span>
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
                  {c.client_nom && (
                    <p className="font-display italic text-lg text-emerald-300 truncate leading-tight">
                      👋 {c.client_nom}
                    </p>
                  )}
                  <p className="font-display italic text-3xl font-medium tabular-nums text-white leading-none">
                    #{c.numero?.slice(-4)}
                  </p>
                  <p className="text-[10px] uppercase tracking-widest text-zinc-500 mt-1">
                    {c.source === 'BORNE' ? `🛍 Borne ${c.borne_id ?? '—'}` : '🛒 Snack comptoir'}
                    {c.consommation && (
                      <span className="ml-1.5">· {c.consommation === 'emporter' ? '📦 Emporter' : '🍽 Sur place'}</span>
                    )}
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
                  className={cn(
                    'flex-1 h-11 rounded-xl text-white font-black text-xs uppercase tracking-wider shadow active:scale-95 inline-flex items-center justify-center gap-1.5',
                    c.source === 'BORNE'
                      ? 'bg-amber-500 hover:bg-amber-400'
                      : 'bg-emerald-500 hover:bg-emerald-400',
                  )}
                  title={c.source === 'BORNE' ? 'PIN manager requis → ouvre l\'encaissement' : 'Ouvre l\'encaissement'}
                >
                  {c.source === 'BORNE' ? <>🔒 Ouvrir</> : <>💰 Encaisser</>}
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

    {/* Étape 1 : PIN gate (déverrouille l'accès) ─────────────────────── */}
    <PinManagerModal
      open={pinAction !== null}
      title={
        pinAction?.type === 'encaisser'
          ? `Ouvrir #${pinAction.cmd.numero?.slice(-4)}`
          : pinAction?.type === 'refuser'
            ? `Annuler #${pinAction.cmd.numero?.slice(-4)}`
            : ''
      }
      subtitle={pinAction ? fmtPrix(pinAction.cmd.montant_total_ttc) : undefined}
      onValid={executerActionApresPin}
      onClose={() => setPinAction(null)}
    />

    {/* Étape 2 : EncaissementModal standard (fidélité, sélection client,
        parts, pourboires par serveur, etc.). Quand la commande est en
        'en_attente_paiement_comptoir', l'action encaisserCommande bascule
        en 'en_attente' au lieu de 'encaisse' → part en cuisine. */}
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
    </>
  )
}
