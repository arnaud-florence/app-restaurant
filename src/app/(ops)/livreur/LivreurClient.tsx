'use client'

import { useMemo, useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { cn } from '@/lib/utils'
import OpsBottomNav, { type OpsBottomNavProfil } from '@/components/OpsBottomNav'
import AgendaCreneauxColonnes from '@/components/AgendaCreneauxColonnes'
import type { CommandeLivreur } from './page'
import { marquerEnLivraison, marquerLivree, envoyerEmailRetard } from './actions'

function fmtPrix(n: number) {
  return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(n)
}

const STATUT_INFO: Record<string, { label: string; cls: string; ordre: number }> = {
  en_attente:        { label: '🆕 À PRENDRE',         cls: 'bg-blue-500 text-white',    ordre: 1 },
  en_preparation:    { label: '🔥 EN PRÉP',           cls: 'bg-amber-500 text-white',   ordre: 2 },
  pret:              { label: '✓ PRÊT',                cls: 'bg-emerald-500 text-white', ordre: 3 },
  pret_pour_retrait: { label: '🛵 À LIVRER',           cls: 'bg-violet-500 text-white',  ordre: 3 },
  en_livraison:      { label: '🛵 EN TOURNÉE',         cls: 'bg-blue-600 text-white',    ordre: 4 },
  servi:             { label: '🛵 LIVRÉE',             cls: 'bg-emerald-600 text-white', ordre: 4 },
  encaisse:          { label: '✓ TERMINÉE',            cls: 'bg-zinc-600 text-white',    ordre: 5 },
  retire_par_client: { label: '✓ LIVRÉE',              cls: 'bg-emerald-600 text-white', ordre: 5 },
}

// URL Google Maps multi-points : .../dir/?api=1&destination=X&waypoints=A|B|C
function mapsMultiPointsUrl(adresses: string[]): string {
  if (adresses.length === 0) return ''
  if (adresses.length === 1) {
    return `https://maps.google.com/maps?q=${encodeURIComponent(adresses[0])}`
  }
  const destination = encodeURIComponent(adresses[adresses.length - 1])
  const waypoints = adresses.slice(0, -1).map(encodeURIComponent).join('|')
  return `https://www.google.com/maps/dir/?api=1&destination=${destination}&waypoints=${waypoints}&travelmode=driving`
}

export default function LivreurClient({
  commandes, caJour, navProfil,
}: {
  commandes: CommandeLivreur[]
  caJour: number
  navProfil: OpsBottomNavProfil | null
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
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

  // En tournée = parti livrer, pas encore arrivé
  const enTournee = useMemo(() =>
    commandes.filter(c => c.statut === 'en_livraison')
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

  // URL Maps multi-points : prêtes + en tournée
  const adressesTournee = useMemo(() => {
    return [...aLivrer, ...enTournee]
      .map(c => c.adresse_livraison)
      .filter((x): x is string => !!x && x.trim().length > 0)
  }, [aLivrer, enTournee])

  function handlePartir(commande_id: string) {
    startTransition(async () => {
      const r = await marquerEnLivraison(commande_id)
      if (!r.ok) alert('Erreur : ' + r.error)
      else router.refresh()
    })
  }

  function handleLivree(commande_id: string) {
    if (!confirm('Confirmer la livraison ?')) return
    startTransition(async () => {
      const r = await marquerLivree(commande_id)
      if (!r.ok) alert('Erreur : ' + r.error)
      else router.refresh()
    })
  }

  function handleEmailRetard(commande_id: string) {
    startTransition(async () => {
      const r = await envoyerEmailRetard(commande_id)
      if (!r.ok) {
        alert(r.alreadySent ? 'Email retard déjà envoyé.' : 'Erreur : ' + r.error)
      } else {
        alert('✓ Email retard envoyé au client.')
        router.refresh()
      }
    })
  }

  return (
    <div className="bg-[#0D0D0D] text-zinc-100 min-h-screen pb-32">
      {/* ═══ HEADER POS UNIFIÉ ═══ */}
      <header className="sticky top-0 z-20 bg-gradient-to-r from-zinc-900 via-zinc-900 to-zinc-950 border-b border-zinc-800 shadow-xl" style={{ paddingTop: 'env(safe-area-inset-top)' }}>
        <div className="md:hidden p-2 space-y-2">
          <div className="flex items-center gap-1.5">
            <span className="inline-flex items-center justify-center w-10 h-10 rounded-xl bg-gradient-to-br from-violet-500 to-violet-700 text-white text-lg shadow-md shrink-0">🛵</span>
            <span className={cn(
              'flex-1 inline-flex items-center justify-center gap-1 px-2 h-10 rounded-xl ring-1 text-xs font-black tabular-nums',
              aLivrer.length > 0 ? 'bg-red-500/15 text-red-200 ring-red-500/30 animate-pulse' : 'bg-zinc-800 text-zinc-300 ring-zinc-700',
            )}>📦 {aLivrer.length} à livrer</span>
            <span className="inline-flex items-center justify-center gap-1 px-2 h-10 rounded-xl bg-blue-500/15 text-blue-200 ring-1 ring-blue-500/30 text-xs font-black tabular-nums shrink-0">🛵 {enTournee.length}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="inline-flex items-center justify-center gap-1 px-2 h-10 rounded-xl bg-emerald-500/15 text-emerald-200 ring-1 ring-emerald-500/30 text-xs font-black tabular-nums">✓ {livrees.length}</span>
            <span className="flex-1 inline-flex items-center justify-center gap-1 px-2 h-10 rounded-xl bg-zinc-100 text-zinc-900 text-xs font-black tabular-nums">
              💰 {fmtPrix(caJour)}
            </span>
            {adressesTournee.length > 0 && (
              <a href={mapsMultiPointsUrl(adressesTournee)} target="_blank" rel="noopener" className="inline-flex items-center gap-1 px-2.5 h-10 rounded-xl bg-blue-600 text-white text-xs font-black shadow-lg shadow-blue-500/30 shrink-0">
                📍 Maps
              </a>
            )}
          </div>
        </div>
        <div className="hidden md:flex px-3 h-14 items-center gap-2 overflow-x-auto whitespace-nowrap">
          <div className="inline-flex items-center gap-2 shrink-0">
            <span className="inline-flex items-center justify-center w-10 h-10 rounded-xl bg-gradient-to-br from-violet-500 to-violet-700 text-white text-xl shadow-md">🛵</span>
            <div className="hidden lg:block">
              <p className="text-[9px] font-black uppercase tracking-[0.2em] text-violet-400 leading-none">Service</p>
              <h1 className="font-display italic text-base font-medium text-white tracking-tight leading-none mt-0.5">Livraisons</h1>
            </div>
          </div>
          <div className="inline-flex items-center gap-1.5 shrink-0">
            <span className={cn('inline-flex items-center gap-1.5 px-2.5 h-10 rounded-xl ring-1 text-xs font-black tabular-nums whitespace-nowrap',
              aLivrer.length > 0 ? 'bg-red-500/15 text-red-200 ring-red-500/30 animate-pulse' : 'bg-zinc-800 text-zinc-300 ring-zinc-700')}>
              <span className="text-base">📦</span>{aLivrer.length} à livrer
            </span>
            <span className="inline-flex items-center gap-1.5 px-2.5 h-10 rounded-xl bg-blue-500/15 text-blue-200 ring-1 ring-blue-500/30 text-xs font-black tabular-nums whitespace-nowrap">
              <span className="text-base">🛵</span>{enTournee.length} en tournée
            </span>
            <span className="inline-flex items-center gap-1.5 px-2.5 h-10 rounded-xl bg-zinc-800 text-zinc-300 ring-1 ring-zinc-700 text-xs font-black tabular-nums whitespace-nowrap">
              <span className="text-base">🍳</span>{enCuisine.length} prep.
            </span>
            <span className="inline-flex items-center gap-1.5 px-2.5 h-10 rounded-xl bg-emerald-500/15 text-emerald-200 ring-1 ring-emerald-500/30 text-xs font-black tabular-nums whitespace-nowrap">
              <span className="text-base">✓</span>{livrees.length} livrées
            </span>
            <span className="inline-flex items-center gap-1.5 px-2.5 h-10 rounded-xl bg-zinc-100 text-zinc-900 text-xs font-black tabular-nums whitespace-nowrap">
              💰 CA <span className="text-emerald-600">{fmtPrix(caJour)}</span>
            </span>
          </div>
          <div className="flex-1 min-w-2" />
          {adressesTournee.length > 0 && (
            <a href={mapsMultiPointsUrl(adressesTournee)} target="_blank" rel="noopener" className="inline-flex items-center gap-1.5 px-2.5 h-10 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-black shadow-lg shadow-blue-500/30 transition-all active:scale-95 whitespace-nowrap shrink-0">
              📍 Itinéraire Maps · {adressesTournee.length} arrêts
            </a>
          )}
          <Link href="/caisse" className="inline-flex items-center gap-1.5 px-2.5 h-10 rounded-xl bg-zinc-100 hover:bg-white text-zinc-900 font-black text-sm shadow-lg transition-all active:scale-95 whitespace-nowrap shrink-0">
            <span className="text-lg">💰</span><span>Caisse</span>
          </Link>
        </div>
      </header>

      <main className="p-3 space-y-4">
        {/* À LIVRER — AGENDA COLONNES 15min (priorité) */}
        <section>
          <div className="flex items-center justify-between mb-2 px-1">
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center justify-center w-7 h-7 rounded-lg bg-violet-500/15 text-violet-300 ring-1 ring-violet-500/30">🛵</span>
              <h2 className="font-display italic text-base text-white tracking-tight">
                À livrer <span className="text-zinc-500">·</span> agenda 15 min
              </h2>
              <span className="inline-flex items-center px-2 h-6 rounded-full bg-violet-500/15 text-violet-300 text-[10px] font-black tabular-nums">
                {aLivrer.length}
              </span>
            </div>
            <p className="hidden sm:block text-[10px] uppercase tracking-widest text-zinc-500">⟵ Scroll horizontal ⟶</p>
          </div>
          <AgendaCreneauxColonnes
            items={aLivrer.map(c => ({ creneauISO: c.creneau_retrait, data: c }))}
            renderItem={(c) => (
              <CartelivrAgenda
                key={c.id}
                c={c}
                now={now}
                pending={pending}
                onPartir={handlePartir}
              />
            )}
            accent="violet"
            now={new Date(now)}
            columnWidth={300}
            emptyMessage="Aucune commande prête à livrer pour l'instant."
          />
        </section>

        {/* EN TOURNÉE (commandes parties chez le client) */}
        {enTournee.length > 0 && (
          <section>
            <h2 className="text-blue-400 font-bold text-sm uppercase tracking-wider mb-2 px-1">
              🛵 En tournée ({enTournee.length})
            </h2>
            <div className="space-y-2">
              {enTournee.map(c => {
                const creneauTime = c.creneau_retrait ? new Date(c.creneau_retrait).getTime() : null
                const minutesRest = creneauTime ? Math.round((creneauTime - now) / 60_000) : null
                const enRetard = minutesRest !== null && minutesRest < -10
                return (
                  <article key={c.id} className={cn('rounded-lg border-2 p-3 space-y-2', enRetard ? 'border-red-500 bg-red-950/40' : 'border-blue-700 bg-blue-950/30')}>
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="font-bold text-white text-base">{c.client_nom ?? 'Client'}</p>
                        <p className="text-xs text-zinc-400">#{c.numero}</p>
                      </div>
                      {enRetard && (
                        <span className="text-[10px] px-2 py-1 rounded font-bold uppercase bg-red-600 text-white">
                          ⚠ Retard {Math.abs(minutesRest!)} min
                        </span>
                      )}
                    </div>

                    {c.adresse_livraison && (
                      <a
                        href={`https://maps.google.com/maps?q=${encodeURIComponent(c.adresse_livraison)}`}
                        target="_blank"
                        rel="noopener"
                        className="block rounded bg-blue-900/40 border border-blue-700 px-2 py-1 text-blue-100 hover:bg-blue-800/40 text-xs"
                      >
                        📍 {c.adresse_livraison}
                      </a>
                    )}

                    <div className="flex flex-col gap-1.5 pt-1">
                      <button
                        onClick={() => handleLivree(c.id)}
                        disabled={pending}
                        className="w-full h-11 rounded-md bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-bold text-sm uppercase tracking-wide transition-colors"
                      >
                        ✓ Livrée
                      </button>
                      {enRetard && c.client_email && !c.email_retard_envoye_at && (
                        <button
                          onClick={() => handleEmailRetard(c.id)}
                          disabled={pending}
                          className="w-full h-10 rounded-md bg-amber-600 hover:bg-amber-700 disabled:opacity-50 text-white font-medium text-xs uppercase tracking-wide transition-colors"
                        >
                          📧 Prévenir client du retard
                        </button>
                      )}
                      {c.email_retard_envoye_at && (
                        <p className="text-[10px] text-amber-400 italic text-center">✓ Email retard envoyé</p>
                      )}
                    </div>
                  </article>
                )
              })}
            </div>
          </section>
        )}

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

      </main>

      {navProfil && <OpsBottomNav profil={navProfil} />}
    </div>
  )
}

function KPI({ label, value, accent = 'default', pulse }: { label: string; value: string | number; accent?: 'default' | 'red'; pulse?: boolean }) {
  const STYLES = {
    default: 'bg-zinc-800/80 border-zinc-700 text-zinc-100',
    red:     'bg-gradient-to-br from-rose-500/30 to-red-700/10 border-rose-500/40 text-rose-100 shadow-md shadow-rose-900/30',
  }
  return (
    <div className={cn('rounded-xl border px-3 py-1.5 text-center min-w-20 backdrop-blur', STYLES[accent], pulse && 'animate-pulse')}>
      <p className="text-[10px] uppercase tracking-widest opacity-75 font-bold">{label}</p>
      <p className="text-base font-black tabular-nums leading-tight mt-0.5">{value}</p>
    </div>
  )
}

// ─── Carte livraison en colonne d'agenda (cellule compacte) ────────
function CartelivrAgenda({
  c, now, pending, onPartir,
}: {
  c: CommandeLivreur
  now: number
  pending: boolean
  onPartir: (id: string) => void
}) {
  const sty = STATUT_INFO[c.statut] ?? { label: c.statut, cls: 'bg-zinc-600 text-white', ordre: 0 }
  const creneauTime = c.creneau_retrait ? new Date(c.creneau_retrait).getTime() : null
  const minutesRest = creneauTime ? Math.round((creneauTime - now) / 60_000) : null
  const urgent = minutesRest !== null && minutesRest < 15
  return (
    <article className={cn(
      'rounded-xl border-2 p-2.5 space-y-2 transition-all hover:shadow-lg',
      urgent ? 'border-red-500 bg-red-950/30 animate-pulse shadow-red-900/40' : 'border-violet-700 bg-zinc-900',
    )}>
      <div className="flex items-start justify-between gap-1.5">
        <div className="min-w-0 flex-1">
          <p className="font-display italic text-base font-medium text-white truncate">{c.client_nom ?? 'Client'}</p>
          <p className="text-[10px] text-zinc-500 tabular-nums">#{c.numero}</p>
        </div>
        <span className={cn('text-[9px] px-1.5 py-0.5 rounded font-black uppercase tracking-wider whitespace-nowrap', sty.cls)}>{sty.label}</span>
      </div>

      {minutesRest !== null && (
        <div className={cn(
          'rounded-lg px-2 py-1 text-xs font-black tabular-nums text-center',
          urgent ? 'bg-red-600 text-white' : 'bg-violet-500/20 text-violet-200 ring-1 ring-violet-500/40',
        )}>
          {minutesRest < 0 ? `⚠ +${Math.abs(minutesRest)}min retard` : `🕒 dans ${minutesRest}min`}
        </div>
      )}

      {c.adresse_livraison && (
        <a
          href={`https://maps.google.com/maps?q=${encodeURIComponent(c.adresse_livraison)}`}
          target="_blank"
          rel="noopener"
          className="block rounded-lg bg-emerald-950/60 border border-emerald-800/60 px-2 py-1.5 hover:bg-emerald-900/60 transition-colors"
        >
          <p className="text-[9px] uppercase tracking-wider font-black opacity-70 text-emerald-300">📍 Maps</p>
          <p className="text-xs font-medium leading-tight text-emerald-100 line-clamp-2">{c.adresse_livraison}</p>
        </a>
      )}

      <div className="space-y-0.5 text-[10px]">
        {c.client_telephone && (
          <a href={`tel:${c.client_telephone}`} className="block text-blue-400 underline truncate">📞 {c.client_telephone}</a>
        )}
        {c.notes && <p className="text-amber-300 italic truncate" title={c.notes}>📝 {c.notes}</p>}
      </div>

      <div className="flex items-center justify-between pt-1 border-t border-zinc-800">
        <span className="text-[10px] text-zinc-500 uppercase tracking-wider font-bold">Total</span>
        <span className="font-display italic text-base font-medium tabular-nums text-white">{fmtPrix(Number(c.montant_total_ttc ?? 0))}</span>
      </div>

      <button
        onClick={() => onPartir(c.id)}
        disabled={pending}
        className="w-full h-10 rounded-lg bg-violet-600 hover:bg-violet-500 disabled:opacity-50 text-white font-black text-xs uppercase tracking-wider transition-colors active:scale-95"
      >
        🛵 Partir
      </button>
    </article>
  )
}
