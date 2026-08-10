'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { cn } from '@/lib/utils'
import type { OpsBottomNavProfil } from '@/components/ops-nav-types'
import type { Reservation, Chambre, ReservationTable } from './page'

function fmtPrix(n: number) {
  return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(n)
}
function fmtNomChambre(r: Reservation): string {
  const ch = Array.isArray(r.chambre) ? r.chambre[0] : r.chambre
  if (!ch) return ''
  return ch.numero ? `Ch. ${ch.numero}` : ch.nom ?? ''
}

const STATUT_BADGE: Record<string, { label: string; cls: string }> = {
  demande:    { label: '⏳ Demande',   cls: 'bg-amber-500 text-white' },
  confirme:   { label: '✓ Confirmée', cls: 'bg-emerald-500 text-white' },
  confirmee:  { label: '✓ Confirmée', cls: 'bg-emerald-500 text-white' },
  arrivee:    { label: '🛏 Arrivée',  cls: 'bg-blue-500 text-white' },
  terminee:   { label: '✓ Terminée',  cls: 'bg-zinc-500 text-white' },
  no_show:    { label: '✗ No show',   cls: 'bg-red-500 text-white' },
}

export default function ReceptionClient({
  arrivees, departs, demandes, futures, chambres, reservationsTables, tabInitial = 'demandes', navProfil,
}: {
  arrivees: Reservation[]
  departs: Reservation[]
  demandes: Reservation[]
  futures: Reservation[]
  chambres: Chambre[]
  reservationsTables: ReservationTable[]
  tabInitial?: 'tables' | 'demandes' | 'arrivees' | 'departs' | 'chambres' | 'semaine'
  navProfil: OpsBottomNavProfil | null
}) {
  // Acomptes à encaisser : arrivées du jour dont acompte < 30% du montant
  const acomptesAttente = useMemo(() => {
    return arrivees.filter(r => {
      const total = Number(r.montant_total ?? 0)
      const acompte = Number(r.acompte_verse ?? 0)
      return total > 0 && acompte < total * 0.3
    })
  }, [arrivees])

  // Chambres à préparer : chambres concernées par les arrivées du jour qui ne sont pas encore "arrivee" (= pas encore check-in)
  const chambresAPreparer = useMemo(() => {
    const ids = new Set(arrivees.filter(r => r.statut !== 'arrivee').map(r => r.chambre_id).filter(Boolean) as string[])
    return chambres.filter(c => ids.has(c.id))
  }, [arrivees, chambres])

  // Total revenu attendu du jour (arrivées)
  const revenuAttenduJour = useMemo(() => {
    return arrivees.reduce((s, r) => s + Number(r.montant_total ?? 0), 0)
  }, [arrivees])

  const [tab, setTab] = useState<'tables' | 'demandes' | 'arrivees' | 'departs' | 'chambres' | 'semaine'>(tabInitial)
  const TABS: { k: typeof tab; label: string; count?: number }[] = [
    { k: 'tables', label: '🍽 Tables', count: reservationsTables.length },
    { k: 'demandes', label: '🔔 Demandes', count: demandes.length },
    { k: 'arrivees', label: '✅ Arrivées', count: arrivees.length },
    { k: 'departs', label: '🚪 Départs', count: departs.length },
    { k: 'chambres', label: '🛏 Chambres', count: chambresAPreparer.length },
    { k: 'semaine', label: '📅 Semaine', count: futures.length },
  ]

  return (
    <div className="bg-[#0D0D0D] text-zinc-100 min-h-screen pb-32">
      {/* ═══ HEADER POS UNIFIÉ ═══ */}
      <header className="sticky top-[var(--op-bar-h,0px)] z-20 bg-gradient-to-r from-zinc-900 via-zinc-900 to-zinc-950 border-b border-zinc-800 shadow-xl" style={{ paddingTop: 'env(safe-area-inset-top)' }}>
        <div className="md:hidden p-2 space-y-2">
          <div className="flex items-center justify-center -mb-1">
            <h1 className="text-zinc-100 text-xs font-black uppercase tracking-[0.2em]">🛎 Réception</h1>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="inline-flex items-center justify-center w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-blue-700 text-white text-lg shadow-md shrink-0">🛏</span>
            <span className={cn(
              'flex-1 inline-flex items-center justify-center gap-1 px-2 h-10 rounded-xl ring-1 text-xs font-black tabular-nums',
              arrivees.length > 0 ? 'bg-blue-500/15 text-blue-200 ring-blue-500/30' : 'bg-zinc-800 text-zinc-400 ring-zinc-700',
            )}>🛬 {arrivees.length} arriv.</span>
            <span className="inline-flex items-center justify-center gap-1 px-2 h-10 rounded-xl bg-zinc-800 text-zinc-300 ring-1 ring-zinc-700 text-xs font-black tabular-nums shrink-0">🛫 {departs.length}</span>
            <span className={cn('inline-flex items-center justify-center gap-1 px-2 h-10 rounded-xl ring-1 text-xs font-black tabular-nums shrink-0',
              demandes.length > 0 ? 'bg-red-500/15 text-red-200 ring-red-500/30 animate-pulse' : 'bg-zinc-800 text-zinc-400 ring-zinc-700')}>⏳ {demandes.length}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <Link href="/service" className="inline-flex items-center justify-center gap-1 px-2.5 h-10 rounded-xl bg-zinc-100 text-zinc-900 text-sm font-black shadow-lg shrink-0" aria-label="Centre opérationnel">
              ⊞ <span className="text-xs">Service</span>
            </Link>
            <span className="flex-1 inline-flex items-center justify-center gap-1 px-2 h-10 rounded-xl bg-zinc-100 text-zinc-900 text-xs font-black tabular-nums">
              💰 {fmtPrix(revenuAttenduJour)}
            </span>
            <Link href="/admin/reservations" className="inline-flex items-center gap-1 px-2.5 h-10 rounded-xl bg-blue-600 text-white text-xs font-black shadow-lg shadow-blue-500/30 shrink-0">
              📅 Calendrier
            </Link>
          </div>
        </div>
        <div className="hidden md:flex px-3 h-14 items-center gap-2 overflow-x-auto whitespace-nowrap">
          <div className="inline-flex items-center gap-2 shrink-0">
            <span className="inline-flex items-center justify-center w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-blue-700 text-white text-xl shadow-md">🛏</span>
            <div className="block min-w-0 flex-1">
              <p className="text-[9px] font-black uppercase tracking-[0.2em] text-blue-400 leading-none">Service</p>
              <h1 className="font-display italic text-base font-medium text-white tracking-tight leading-none mt-0.5">Réception</h1>
            </div>
          </div>
          <div className="inline-flex items-center gap-1.5 shrink-0">
            <span className={cn('inline-flex items-center gap-1.5 px-2.5 h-10 rounded-xl ring-1 text-xs font-black tabular-nums whitespace-nowrap',
              arrivees.length > 0 ? 'bg-blue-500/15 text-blue-200 ring-blue-500/30' : 'bg-zinc-800 text-zinc-400 ring-zinc-700')}>
              <span className="text-base">🛬</span>{arrivees.length} arrivées
            </span>
            <span className="inline-flex items-center gap-1.5 px-2.5 h-10 rounded-xl bg-zinc-800 text-zinc-300 ring-1 ring-zinc-700 text-xs font-black tabular-nums whitespace-nowrap">
              <span className="text-base">🛫</span>{departs.length} départs
            </span>
            <span className={cn('inline-flex items-center gap-1.5 px-2.5 h-10 rounded-xl ring-1 text-xs font-black tabular-nums whitespace-nowrap',
              demandes.length > 0 ? 'bg-red-500/15 text-red-200 ring-red-500/30 animate-pulse' : 'bg-zinc-800 text-zinc-400 ring-zinc-700')}>
              <span className="text-base">⏳</span>{demandes.length} demandes
            </span>
            <span className="inline-flex items-center gap-1.5 px-2.5 h-10 rounded-xl bg-zinc-100 text-zinc-900 text-xs font-black tabular-nums whitespace-nowrap">
              💰 Revenu <span className="text-emerald-600">{fmtPrix(revenuAttenduJour)}</span>
            </span>
          </div>
          <div className="flex-1 min-w-2" />
          <Link href="/service" className="inline-flex items-center gap-1.5 px-2.5 h-10 rounded-xl bg-zinc-100 hover:bg-white text-zinc-900 text-xs font-black shadow-lg transition-all active:scale-95 whitespace-nowrap shrink-0">
            <span className="text-lg">⊞</span><span>Service</span>
          </Link>
          <Link href="/admin/reservations" className="inline-flex items-center gap-1.5 px-2.5 h-10 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-black shadow-lg shadow-blue-500/30 transition-all active:scale-95 whitespace-nowrap shrink-0">
            📅 Calendrier
          </Link>
        </div>
      </header>

      {/* ═══ BARRE D'ONGLETS STICKY ═══ */}
      <div className="sticky top-[var(--op-bar-h,0px)] z-20 px-3 py-2 bg-zinc-950/90 backdrop-blur flex gap-1.5 overflow-x-auto border-b border-zinc-800">
        {TABS.map(t => (
          <button
            key={t.k}
            onClick={() => setTab(t.k)}
            className={cn('min-h-[44px] px-3 rounded-xl text-xs font-black whitespace-nowrap transition active:scale-95 inline-flex items-center gap-1.5',
              tab === t.k ? 'bg-emerald-500 text-white' : 'bg-zinc-800 text-zinc-300')}
          >
            {t.label}
            {typeof t.count === 'number' && t.count > 0 && (
              <span className={cn('inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full text-[10px] tabular-nums',
                tab === t.k ? 'bg-white/25 text-white' : 'bg-zinc-700 text-zinc-200')}>{t.count}</span>
            )}
          </button>
        ))}
      </div>

      <main className="p-3 space-y-4">
        {/* ═══ ONGLET TABLES (réservations de tables du jour) ═══ */}
        {tab === 'tables' && (
          reservationsTables.length > 0 ? (
            <section>
              <h2 className="text-emerald-400 font-bold text-sm uppercase tracking-wider mb-2 px-1">
                🍽 {reservationsTables.length} réservation{reservationsTables.length > 1 ? 's' : ''} de table aujourd&apos;hui
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                {reservationsTables.map(r => {
                  const tbl = Array.isArray(r.table) ? r.table[0] : r.table
                  return (
                    <article key={r.id} className="rounded-md bg-zinc-900 border border-zinc-700 p-3 space-y-1">
                      <div className="flex items-center justify-between gap-2">
                        <p className="font-bold text-white truncate">{r.client_nom}</p>
                        <span className="text-emerald-300 font-black tabular-nums shrink-0">{r.heure_arrivee?.slice(0, 5)}</span>
                      </div>
                      <p className="text-xs text-zinc-400">
                        👥 {r.nb_personnes} pers.{tbl?.numero ? ` · 🪑 Table ${tbl.numero}` : ''}{r.zone ? ` · ${r.zone}` : ''}
                      </p>
                      {r.client_telephone && <p className="text-xs text-zinc-500">📞 {r.client_telephone}</p>}
                      {r.notes && <p className="text-xs text-zinc-500 italic truncate">📝 {r.notes}</p>}
                    </article>
                  )
                })}
              </div>
            </section>
          ) : (
            <div className="rounded-2xl border border-zinc-800 bg-zinc-900/50 p-6 text-center">
              <p className="text-3xl mb-1">🍽</p>
              <p className="text-zinc-500 italic text-sm">Aucune réservation de table aujourd&apos;hui.</p>
            </div>
          )
        )}

        {/* ═══ ONGLET DEMANDES ═══ */}
        {tab === 'demandes' && (
          demandes.length > 0 ? (
        /* DEMANDES À TRAITER (priorité 1) */
          <section className="rounded-lg border-2 border-amber-500 bg-amber-950/40 p-3">
            <h2 className="text-amber-400 font-bold text-sm uppercase tracking-wider mb-2">
              ⏳ {demandes.length} demande{demandes.length > 1 ? 's' : ''} à traiter
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {demandes.map(r => (
                <article key={r.id} className="rounded-md bg-zinc-900 border border-zinc-700 p-3 space-y-1.5">
                  <p className="font-bold text-white">{r.client_nom}</p>
                  <p className="text-xs text-zinc-400">
                    {r.date_arrivee} → {r.date_depart} · {r.nb_personnes} pers.
                  </p>
                  <p className="text-xs text-zinc-400">{fmtNomChambre(r) || '— chambre à attribuer —'}</p>
                  {r.client_email && <p className="text-xs text-zinc-500">📧 {r.client_email}</p>}
                  <div className="flex items-center justify-between pt-1.5 border-t border-zinc-800">
                    <span className="text-xs text-zinc-400">Total prévu</span>
                    <span className="font-bold tabular-nums">{fmtPrix(Number(r.montant_total ?? 0))}</span>
                  </div>
                  <Link href="/admin/reservations" className="block text-center mt-1 text-xs px-3 py-2 rounded bg-blue-500 hover:bg-blue-400 text-white font-bold min-h-[40px] flex items-center justify-center">
                    Traiter →
                  </Link>
                </article>
              ))}
            </div>
          </section>
          ) : (
            <div className="rounded-2xl border border-zinc-800 bg-zinc-900/50 p-6 text-center">
              <p className="text-3xl mb-1">✅</p>
              <p className="text-zinc-500 italic text-sm">Aucune demande en attente.</p>
            </div>
          )
        )}

        {/* ═══ ONGLET ARRIVÉES ═══ */}
        {tab === 'arrivees' && (
        /* ARRIVÉES DU JOUR */
        <section>
          <h2 className="text-emerald-400 font-bold text-sm uppercase tracking-wider mb-2 px-1">
            🛬 {arrivees.length} arrivée{arrivees.length > 1 ? 's' : ''} aujourd'hui
          </h2>
          {arrivees.length === 0 ? (
            <div className="rounded-2xl border border-zinc-800 bg-zinc-900/50 p-6 text-center">
              <p className="text-3xl mb-1">🛎</p>
              <p className="text-zinc-500 italic text-sm">Aucune arrivée prévue aujourd'hui.</p>
            </div>
          ) : (
            // Feed mobile : 1 grande card par arrivée, action Check-in évidente.
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
              {arrivees.map(r => {
                const sty = STATUT_BADGE[r.statut] ?? { label: r.statut, cls: 'bg-zinc-700 text-white' }
                const acompte = Number(r.acompte_verse ?? 0)
                const total = Number(r.montant_total ?? 0)
                const acompteOk = total > 0 ? acompte >= total * 0.3 : true
                return (
                  <article key={r.id} className={cn('rounded-2xl border-2 p-4 space-y-3', sty.cls.includes('blue') ? 'border-blue-500 bg-blue-950/30' : 'border-zinc-700 bg-zinc-900')}>
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-lg font-bold text-white truncate">{r.client_nom}</p>
                        <p className="text-sm text-zinc-400">{fmtNomChambre(r)} · {r.nb_personnes} pers.</p>
                      </div>
                      <span className={cn('text-[10px] px-2 py-1 rounded-full font-bold uppercase shrink-0', sty.cls)}>{sty.label}</span>
                    </div>

                    {r.notes && <p className="text-sm text-amber-300 italic bg-amber-950/30 rounded-lg px-3 py-2">📝 {r.notes}</p>}

                    {/* Acompte : badge proéminent vert/rouge */}
                    {total > 0 && (
                      acompteOk ? (
                        <div className="inline-flex items-center gap-1.5 text-xs font-bold text-emerald-300 bg-emerald-950/40 rounded-full px-3 py-1.5">
                          ✓ Acompte OK ({Math.round((acompte / total) * 100)}%)
                        </div>
                      ) : (
                        <div className="inline-flex items-center gap-1.5 text-sm font-bold text-red-200 bg-red-600/30 ring-1 ring-red-500/50 rounded-full px-3 py-1.5">
                          ⚠ Acompte {fmtPrix(acompte)} / {fmtPrix(total)} ({Math.round((acompte / total) * 100)}%)
                        </div>
                      )
                    )}

                    {/* Actions : Appeler + Check-in, gros et tactiles */}
                    <div className="flex gap-2 pt-1">
                      {r.client_telephone && (
                        <a
                          href={`tel:${r.client_telephone}`}
                          className="inline-flex items-center justify-center gap-1.5 min-h-[48px] px-4 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-100 text-sm font-bold active:scale-95 transition shrink-0"
                        >📞 Appeler</a>
                      )}
                      <Link
                        href="/admin/reservations"
                        className="flex-1 inline-flex items-center justify-center gap-1.5 min-h-[48px] px-4 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-white text-sm font-bold active:scale-95 transition"
                      >✓ Check-in →</Link>
                    </div>
                  </article>
                )
              })}
            </div>
          )}
        </section>
        )}

        {/* ═══ ONGLET DÉPARTS ═══ */}
        {tab === 'departs' && (
          departs.length > 0 ? (
          /* DÉPARTS DU JOUR */
          <section>
            <h2 className="text-blue-400 font-bold text-sm uppercase tracking-wider mb-2 px-1">
              🛫 {departs.length} départ{departs.length > 1 ? 's' : ''} aujourd'hui
            </h2>
            <ul className="space-y-1">
              {departs.map(r => {
                const acompte = Number(r.acompte_verse ?? 0)
                const total = Number(r.montant_total ?? 0)
                const reste = total - acompte
                return (
                  <li key={r.id} className="flex items-center justify-between px-3 py-2 rounded bg-zinc-900 border border-zinc-800">
                    <span className="font-bold">{r.client_nom}</span>
                    <span className="text-xs text-zinc-400">{fmtNomChambre(r)}</span>
                    {reste > 0 && <span className="text-xs font-bold text-red-400">Solde dû : {fmtPrix(reste)}</span>}
                    {reste <= 0 && <span className="text-xs text-emerald-400">✓ Payé</span>}
                  </li>
                )
              })}
            </ul>
          </section>
          ) : (
            <div className="rounded-2xl border border-zinc-800 bg-zinc-900/50 p-6 text-center">
              <p className="text-3xl mb-1">🚪</p>
              <p className="text-zinc-500 italic text-sm">Aucun départ aujourd'hui.</p>
            </div>
          )
        )}

        {/* ═══ ONGLET CHAMBRES ═══ */}
        {tab === 'chambres' && (
          chambresAPreparer.length > 0 ? (
          /* CHAMBRES À PRÉPARER */
          <section>
            <h2 className="text-amber-400 font-bold text-sm uppercase tracking-wider mb-2 px-1">
              🧹 {chambresAPreparer.length} chambre{chambresAPreparer.length > 1 ? 's' : ''} à préparer
            </h2>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {chambresAPreparer.map(c => (
                <div key={c.id} className="rounded bg-amber-950/40 border border-amber-700 px-3 py-2">
                  <p className="text-xs text-amber-400 font-bold">Ch. {c.numero}</p>
                  <p className="text-sm font-medium text-white">{c.nom}</p>
                  <p className="text-[10px] text-zinc-400">{c.capacite} pers · {fmtPrix(c.prix_nuit_ht)}/nuit</p>
                </div>
              ))}
            </div>
          </section>
          ) : (
            <div className="rounded-2xl border border-zinc-800 bg-zinc-900/50 p-6 text-center">
              <p className="text-3xl mb-1">🛏</p>
              <p className="text-zinc-500 italic text-sm">Aucune chambre à préparer.</p>
            </div>
          )
        )}

        {/* ═══ ONGLET SEMAINE (acomptes en retard + futures arrivées) ═══ */}
        {tab === 'semaine' && (
          <>
        {/* ACOMPTES À ENCAISSER */}
        {acomptesAttente.length > 0 && (
          <section className="rounded-lg border border-red-700 bg-red-950/30 p-3">
            <h2 className="text-red-400 font-bold text-sm uppercase tracking-wider mb-2">
              💰 Acomptes en retard ({acomptesAttente.length})
            </h2>
            <ul className="text-xs space-y-1">
              {acomptesAttente.map(r => (
                <li key={r.id} className="flex justify-between">
                  <span>{r.client_nom}</span>
                  <span className="tabular-nums">
                    {fmtPrix(Number(r.acompte_verse ?? 0))} / {fmtPrix(Number(r.montant_total ?? 0))}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* FUTURES ARRIVÉES SEMAINE */}
        {futures.length > 0 && (
          <section>
            <h2 className="text-zinc-400 font-bold text-sm uppercase tracking-wider mb-2 px-1">
              📅 {futures.length} arrivée{futures.length > 1 ? 's' : ''} cette semaine
            </h2>
            <ul className="text-xs space-y-1 px-2">
              {futures.slice(0, 10).map(r => (
                <li key={r.id} className="flex justify-between text-zinc-300">
                  <span>
                    <b className="text-white">{r.date_arrivee}</b> · {r.client_nom} · {fmtNomChambre(r)}
                  </span>
                  <span className="tabular-nums text-zinc-500">{fmtPrix(Number(r.montant_total ?? 0))}</span>
                </li>
              ))}
            </ul>
          </section>
        )}

        {acomptesAttente.length === 0 && futures.length === 0 && (
          <div className="rounded-2xl border border-zinc-800 bg-zinc-900/50 p-6 text-center">
            <p className="text-3xl mb-1">📅</p>
            <p className="text-zinc-500 italic text-sm">Aucune arrivée cette semaine, aucun acompte en retard.</p>
          </div>
        )}
          </>
        )}

        <Link href="/admin/reservations" className="block text-center mt-4 text-sm py-3 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-200 font-bold">
          Voir tous les détails dans /admin/reservations →
        </Link>
      </main>
    </div>
  )
}
