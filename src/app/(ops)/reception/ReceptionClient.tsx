'use client'

import { useMemo } from 'react'
import Link from 'next/link'
import { cn } from '@/lib/utils'
import OpsBottomNav, { type OpsBottomNavProfil } from '@/components/OpsBottomNav'
import type { Reservation, Chambre } from './page'

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
  arrivees, departs, demandes, futures, chambres, navProfil,
}: {
  arrivees: Reservation[]
  departs: Reservation[]
  demandes: Reservation[]
  futures: Reservation[]
  chambres: Chambre[]
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

  return (
    <div className="bg-[#0D0D0D] text-zinc-100 min-h-screen pb-32">
      {/* Header */}
      <header className="sticky top-0 z-20 bg-zinc-900/95 backdrop-blur border-b border-zinc-800" style={{ paddingTop: 'env(safe-area-inset-top)' }}>
        <div className="px-4 py-3 flex items-center justify-between gap-3 flex-wrap">
          <div>
            <p className="text-xs font-bold uppercase tracking-wider text-blue-400">Service — Réception</p>
            <h1 className="text-2xl sm:text-3xl font-bold text-white">🛏 Réception</h1>
          </div>
          <div className="flex items-center gap-2">
            <KPI label="Arrivées" value={arrivees.length} accent={arrivees.length > 0 ? 'blue' : 'default'} />
            <KPI label="Départs" value={departs.length} />
            <KPI label="Demandes" value={demandes.length} accent={demandes.length > 0 ? 'red' : 'default'} pulse={demandes.length > 0} />
            <KPI label="Revenu jour" value={fmtPrix(revenuAttenduJour)} />
          </div>
        </div>
      </header>

      <main className="p-3 space-y-4">
        {/* DEMANDES À TRAITER (priorité 1) */}
        {demandes.length > 0 && (
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
        )}

        {/* ARRIVÉES DU JOUR */}
        <section>
          <h2 className="text-emerald-400 font-bold text-sm uppercase tracking-wider mb-2 px-1">
            🛬 {arrivees.length} arrivée{arrivees.length > 1 ? 's' : ''} aujourd'hui
          </h2>
          {arrivees.length === 0 ? (
            <p className="text-zinc-500 italic text-sm px-2">Aucune arrivée prévue aujourd'hui.</p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
              {arrivees.map(r => {
                const sty = STATUT_BADGE[r.statut] ?? { label: r.statut, cls: 'bg-zinc-700 text-white' }
                const acompte = Number(r.acompte_verse ?? 0)
                const total = Number(r.montant_total ?? 0)
                const acompteOk = total > 0 ? acompte >= total * 0.3 : true
                return (
                  <article key={r.id} className={cn('rounded-md border p-3 space-y-1.5', sty.cls.includes('blue') ? 'border-blue-500 bg-blue-950/30' : 'border-zinc-700 bg-zinc-900')}>
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="font-bold text-white truncate">{r.client_nom}</p>
                        <p className="text-xs text-zinc-400">{fmtNomChambre(r)} · {r.nb_personnes} pers.</p>
                      </div>
                      <span className={cn('text-[10px] px-2 py-0.5 rounded font-bold uppercase', sty.cls)}>{sty.label}</span>
                    </div>
                    {r.notes && <p className="text-xs text-amber-300 italic">📝 {r.notes}</p>}
                    {!acompteOk && (
                      <p className="text-xs text-red-400 font-bold">
                        ⚠ Acompte {fmtPrix(acompte)}/{fmtPrix(total)} ({Math.round((acompte / total) * 100)}%)
                      </p>
                    )}
                    {r.client_telephone && (
                      <a href={`tel:${r.client_telephone}`} className="text-xs text-blue-400 underline">📞 {r.client_telephone}</a>
                    )}
                  </article>
                )
              })}
            </div>
          )}
        </section>

        {/* DÉPARTS DU JOUR */}
        {departs.length > 0 && (
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
        )}

        {/* CHAMBRES À PRÉPARER */}
        {chambresAPreparer.length > 0 && (
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
        )}

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

        <Link href="/admin/reservations" className="block text-center mt-4 text-sm py-3 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-200 font-bold">
          Voir tous les détails dans /admin/reservations →
        </Link>
      </main>

      {navProfil && <OpsBottomNav profil={navProfil} />}
    </div>
  )
}

function KPI({ label, value, accent = 'default', pulse }: { label: string; value: string | number; accent?: 'default' | 'red' | 'blue'; pulse?: boolean }) {
  const cls = { default: 'bg-zinc-800 text-zinc-100', red: 'bg-red-600 text-white', blue: 'bg-blue-500 text-white' }[accent]
  return (
    <div className={cn('rounded-md px-3 py-1.5 text-center min-w-20', cls, pulse && 'animate-pulse')}>
      <p className="text-[10px] uppercase tracking-wider opacity-80">{label}</p>
      <p className="text-base font-bold tabular-nums leading-tight">{value}</p>
    </div>
  )
}
