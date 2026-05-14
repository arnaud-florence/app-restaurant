'use client'

import { useMemo, useState } from 'react'
import { cn } from '@/lib/utils'
import OpsBottomNav, { type OpsBottomNavProfil } from '@/components/OpsBottomNav'
import type { CommandeLivreur } from './page'

function fmtPrix(n: number) {
  return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(n)
}

const STATUT_INFO: Record<string, { label: string; cls: string; ordre: number }> = {
  en_attente:        { label: '🆕 À PRENDRE',         cls: 'bg-blue-500 text-white',    ordre: 1 },
  en_preparation:    { label: '🔥 EN PRÉP',           cls: 'bg-amber-500 text-white',   ordre: 2 },
  pret:              { label: '✓ PRÊT',                cls: 'bg-emerald-500 text-white', ordre: 3 },
  pret_pour_retrait: { label: '🛵 À LIVRER',           cls: 'bg-violet-500 text-white',  ordre: 3 },
  servi:             { label: '🛵 LIVRÉE',             cls: 'bg-emerald-600 text-white', ordre: 4 },
  encaisse:          { label: '✓ TERMINÉE',            cls: 'bg-zinc-600 text-white',    ordre: 5 },
  retire_par_client: { label: '✓ LIVRÉE',              cls: 'bg-emerald-600 text-white', ordre: 5 },
}

export default function LivreurClient({
  commandes, caJour, navProfil,
}: {
  commandes: CommandeLivreur[]
  caJour: number
  navProfil: OpsBottomNavProfil | null
}) {
  const [now, setNow] = useState(() => Date.now())
  // tick simple toutes les 30s pour rafraichir les compteurs
  useMemo(() => {
    if (typeof window === 'undefined') return
    const i = setInterval(() => setNow(Date.now()), 30_000)
    return () => clearInterval(i)
  }, [])

  // À livrer maintenant = statut pret ou pret_pour_retrait
  const aLivrer = useMemo(() =>
    commandes.filter(c => c.statut === 'pret' || c.statut === 'pret_pour_retrait')
             .sort((a, b) => {
               const ta = a.creneau_retrait ? new Date(a.creneau_retrait).getTime() : Number.MAX_VALUE
               const tb = b.creneau_retrait ? new Date(b.creneau_retrait).getTime() : Number.MAX_VALUE
               return ta - tb
             }),
    [commandes],
  )

  // En cours (cuisine) — informatif
  const enCuisine = useMemo(() =>
    commandes.filter(c => c.statut === 'en_attente' || c.statut === 'en_preparation'),
    [commandes],
  )

  // Livrées aujourd'hui
  const livrees = useMemo(() =>
    commandes.filter(c => c.statut === 'encaisse' || c.statut === 'retire_par_client' || c.statut === 'servi'),
    [commandes],
  )

  return (
    <div className="bg-[#0D0D0D] text-zinc-100 min-h-screen pb-32">
      {/* Header */}
      <header className="sticky top-0 z-20 bg-zinc-900/95 backdrop-blur border-b border-zinc-800" style={{ paddingTop: 'env(safe-area-inset-top)' }}>
        <div className="px-4 py-3 flex items-center justify-between gap-3 flex-wrap">
          <div>
            <p className="text-xs font-bold uppercase tracking-wider text-violet-400">Service — Livraisons</p>
            <h1 className="text-2xl sm:text-3xl font-bold text-white">🛵 Livreur</h1>
          </div>
          <div className="flex items-center gap-2">
            <KPI label="À livrer" value={aLivrer.length} accent={aLivrer.length > 0 ? 'red' : 'default'} pulse={aLivrer.length > 0} />
            <KPI label="En cuisine" value={enCuisine.length} />
            <KPI label="Livrées" value={livrees.length} />
            <KPI label="CA jour" value={fmtPrix(caJour)} />
          </div>
        </div>
      </header>

      <main className="p-3 space-y-4">
        {/* À LIVRER (priorité) */}
        <section>
          <h2 className="text-violet-400 font-bold text-sm uppercase tracking-wider mb-2 px-1">
            🛵 À livrer maintenant ({aLivrer.length})
          </h2>
          {aLivrer.length === 0 ? (
            <p className="text-zinc-500 italic text-sm px-2">Aucune commande prête à livrer pour l'instant.</p>
          ) : (
            <div className="space-y-2">
              {aLivrer.map(c => {
                const sty = STATUT_INFO[c.statut] ?? { label: c.statut, cls: 'bg-zinc-600 text-white', ordre: 0 }
                const creneauTime = c.creneau_retrait ? new Date(c.creneau_retrait).getTime() : null
                const minutesRest = creneauTime ? Math.round((creneauTime - now) / 60_000) : null
                const urgent = minutesRest !== null && minutesRest < 15
                return (
                  <article key={c.id} className={cn('rounded-lg border-2 p-3 space-y-2', urgent ? 'border-red-500 bg-red-950/30 animate-pulse' : 'border-violet-700 bg-zinc-900')}>
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="font-bold text-white text-lg">{c.client_nom ?? 'Client'}</p>
                        <p className="text-xs text-zinc-400">#{c.numero}</p>
                      </div>
                      <span className={cn('text-[10px] px-2 py-1 rounded font-bold uppercase', sty.cls)}>{sty.label}</span>
                    </div>

                    {c.creneau_retrait && (
                      <div className={cn('rounded px-2 py-1 text-sm font-bold flex items-center justify-between', urgent ? 'bg-red-600 text-white' : 'bg-violet-600/30 text-violet-200 border border-violet-700')}>
                        <span>
                          🕒 Heure prévue : {new Date(c.creneau_retrait).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
                        </span>
                        {minutesRest !== null && (
                          <span className="tabular-nums">
                            {minutesRest < 0 ? `+${Math.abs(minutesRest)} min de retard` : `${minutesRest} min`}
                          </span>
                        )}
                      </div>
                    )}

                    {/* Coordonnées client (à enrichir avec adresse quand le modèle data l'aura) */}
                    <div className="space-y-1 text-xs">
                      {c.client_telephone && (
                        <a href={`tel:${c.client_telephone}`} className="block text-blue-400 underline">
                          📞 Appeler {c.client_telephone}
                        </a>
                      )}
                      {c.client_email && <p className="text-zinc-400">📧 {c.client_email}</p>}
                      {c.notes && <p className="text-amber-300 italic">📝 {c.notes}</p>}
                    </div>

                    <div className="flex items-center justify-between pt-1 border-t border-zinc-800">
                      <span className="text-xs text-zinc-400">Montant</span>
                      <span className="font-bold text-lg tabular-nums">{fmtPrix(Number(c.montant_total_ttc ?? 0))}</span>
                    </div>
                  </article>
                )
              })}
            </div>
          )}
        </section>

        {/* EN CUISINE — informatif */}
        {enCuisine.length > 0 && (
          <section>
            <h2 className="text-zinc-400 font-bold text-sm uppercase tracking-wider mb-2 px-1">
              🍳 En cours de préparation ({enCuisine.length})
            </h2>
            <ul className="text-xs space-y-1 px-2">
              {enCuisine.map(c => {
                const sty = STATUT_INFO[c.statut] ?? { label: c.statut, cls: '', ordre: 0 }
                return (
                  <li key={c.id} className="flex justify-between text-zinc-300">
                    <span>
                      <b className="text-white">#{c.numero}</b> {c.client_nom ?? '—'}
                    </span>
                    <span className={cn('text-[10px] px-1.5 py-0.5 rounded', sty.cls)}>{sty.label}</span>
                  </li>
                )
              })}
            </ul>
          </section>
        )}

        {/* LIVRÉES — historique */}
        {livrees.length > 0 && (
          <section>
            <h2 className="text-emerald-400 font-bold text-sm uppercase tracking-wider mb-2 px-1">
              ✓ {livrees.length} livrée{livrees.length > 1 ? 's' : ''} aujourd'hui
            </h2>
            <ul className="text-xs space-y-1 px-2">
              {livrees.map(c => (
                <li key={c.id} className="flex justify-between text-zinc-400">
                  <span>#{c.numero} {c.client_nom}</span>
                  <span className="tabular-nums">{fmtPrix(Number(c.montant_total_ttc ?? 0))}</span>
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* Note Phase 2 */}
        <div className="rounded-md bg-zinc-900 border border-zinc-800 p-3 text-xs text-zinc-500 italic">
          <p className="font-bold text-zinc-400 mb-1 not-italic">📋 À venir Phase 2</p>
          <p>Adresse de livraison · Optimisation trajet via maps · SMS auto au client si retard · Calcul kilométrage + frais.</p>
          <p className="mt-1">Nécessite : ajout colonnes `adresse_livraison` + `mode_retrait` sur commandes, intégration Twilio/Brevo pour SMS.</p>
        </div>
      </main>

      {navProfil && <OpsBottomNav profil={navProfil} />}
    </div>
  )
}

function KPI({ label, value, accent = 'default', pulse }: { label: string; value: string | number; accent?: 'default' | 'red'; pulse?: boolean }) {
  const cls = { default: 'bg-zinc-800 text-zinc-100', red: 'bg-red-600 text-white' }[accent]
  return (
    <div className={cn('rounded-md px-3 py-1.5 text-center min-w-20', cls, pulse && 'animate-pulse')}>
      <p className="text-[10px] uppercase tracking-wider opacity-80">{label}</p>
      <p className="text-base font-bold tabular-nums leading-tight">{value}</p>
    </div>
  )
}
