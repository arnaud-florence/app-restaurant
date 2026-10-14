// Le business en un coup d'œil, tout en haut de l'accueil du gérant.
//
// Trois partis pris :
//
//  • Le CA du jour est un NOMBRE, pas un graphique. Une valeur unique n'a pas
//    besoin d'axes : elle a besoin d'être lisible de loin.
//
//  • La comparaison se fait avec HIER À LA MÊME HEURE. Comparer une matinée à
//    une journée entière ferait paraître catastrophique tous les matins.
//
//  • Une seule teinte sur les sept barres. Pas de palette catégorielle : il n'y
//    a qu'une série, le jour se lit sous la barre, et la couleur ne sert qu'à
//    distinguer aujourd'hui du reste.

import { Fragment } from 'react'
import Link from 'next/link'
import { cn } from '@/lib/utils'
import type { BusinessLive } from '@/lib/business-live'

const eur = (n: number, dec = 0) =>
  n.toLocaleString('fr-FR', { minimumFractionDigits: dec, maximumFractionDigits: dec }) + ' €'

// Teintes du design system (§6) : emerald = encaissé, amber = en attente,
// zinc = information absente. On ne colore pas un inconnu comme un acquis.
const TEINTE_PAIEMENT: Record<string, string> = {
  true: 'bg-emerald-500',
  false: 'bg-amber-500',
  null: 'bg-zinc-600',
}

export default function BusinessHeader({ b }: { b: BusinessLive }) {
  const delta = b.caJour - b.caHierMemeHeure
  const pct = b.caHierMemeHeure > 0 ? Math.round((delta / b.caHierMemeHeure) * 100) : null
  const hausse = delta >= 0

  const maxCa = Math.max(...b.semaine.map(j => j.ca), 1)
  const H = 64          // hauteur utile du graphe, en px
  const totalPaiements = b.paiements.reduce((t, p) => t + p.ca, 0)

  return (
    <section className="rounded-3xl bg-zinc-900 text-white p-4 sm:p-6 mb-5 shadow-lg">
      <div className="flex items-center justify-between gap-2 mb-4">
        <h2 className="text-[11px] font-black uppercase tracking-[0.2em] text-emerald-400 flex items-center gap-1.5">
          <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" aria-hidden />
          Le business — en direct
        </h2>
        <Link href="/admin/ventes"
              className="text-xs font-bold text-zinc-300 hover:text-white whitespace-nowrap">
          Tout voir →
        </Link>
      </div>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
        {/* ── Le chiffre du jour ─────────────────────────────────────── */}
        <div>
          <p className="text-xs text-zinc-400 font-medium">Chiffre d&apos;affaires aujourd&apos;hui</p>
          <p className="mt-1 text-5xl sm:text-6xl font-black tabular-nums leading-none">
            {eur(b.caJour)}
          </p>

          {b.caHierMemeHeure > 0 ? (
            <p className="mt-2 text-sm">
              <span className={cn('font-bold tabular-nums', hausse ? 'text-emerald-400' : 'text-amber-400')}>
                {hausse ? '▲' : '▼'} {eur(Math.abs(delta))}
                {pct !== null && <span className="ml-1">({hausse ? '+' : '−'}{Math.abs(pct)} %)</span>}
              </span>
              <span className="text-zinc-400"> qu&apos;hier à la même heure</span>
            </p>
          ) : (
            <p className="mt-2 text-sm text-zinc-500">Pas encore de repère pour hier à cette heure.</p>
          )}

          <div className="mt-4 grid grid-cols-3 gap-2">
            <Stat libelle="Tickets" valeur={String(b.ticketsJour)} />
            <Stat libelle="Panier moyen" valeur={eur(b.ticketMoyen, 2)} />
            <Stat libelle="Sur 7 jours" valeur={eur(b.caSemaine)} />
          </div>

          {totalPaiements > 0 && (
            <div className="mt-3">
              <div className="flex h-2 rounded-full overflow-hidden bg-zinc-800" role="img"
                   aria-label={b.paiements.map(p => `${p.libelle} ${eur(p.ca, 2)}`).join(', ')}>
                {b.paiements.map((p, i) => (
                  <Fragment key={p.cle}>
                    {/* 2 px de fond entre deux remplissages : sans cet écart, les
                        segments se lisent comme un seul bloc. */}
                    {i > 0 && <div className="w-0.5 shrink-0 bg-zinc-900" />}
                    <div className={TEINTE_PAIEMENT[String(p.encaisse)]}
                         style={{ width: `${(p.ca / totalPaiements) * 100}%` }} />
                  </Fragment>
                ))}
              </div>
              <p className="mt-1.5 text-[11px] text-zinc-400 tabular-nums">
                {b.paiements.map(p => `${p.libelle} ${eur(p.ca, 2)}`).join(' · ')}
              </p>
              {/* ⚠️ On DIT ce qu'on ne sait pas. « Non ventilé » veut dire que le
                  ticket n'a pas porté son mode de règlement ; « En compte » que
                  la vente est faite et l'argent pas encore rentré. Les fondre
                  dans « Carte » — ce que faisait l'ancienne version — laissait
                  lire un total carte introuvable sur le relevé bancaire. */}
              {b.paiements.some(p => p.encaisse !== true) && (
                <p className="mt-1 text-[11px] text-zinc-500">
                  {b.paiements.filter(p => p.encaisse === false).length > 0 && 'En compte = vendu, pas encore encaissé. '}
                  {b.paiements.filter(p => p.encaisse === null).length > 0 && 'Non ventilé = le ticket ne dit pas comment il a été payé.'}
                </p>
              )}
            </div>
          )}
        </div>

        {/* ── Les sept derniers jours ────────────────────────────────── */}
        <div>
          <p className="text-xs text-zinc-400 font-medium mb-2">Sept derniers jours</p>
          <div className="flex items-end gap-1.5" style={{ height: H + 34 }}>
            {b.semaine.map(j => {
              const h = j.ca > 0 ? Math.max(3, Math.round((j.ca / maxCa) * H)) : 2
              return (
                <div key={j.date} className="flex-1 flex flex-col items-center justify-end gap-1 min-w-0">
                  {/* Le montant n'est écrit QUE sur aujourd'hui. Un nombre au-dessus
                      de chaque barre transforme un graphique en tableau illisible. */}
                  {j.aujourdhui && (
                    <span className="text-[10px] font-black tabular-nums text-emerald-300 whitespace-nowrap">
                      {eur(j.ca)}
                    </span>
                  )}
                  <div
                    className={cn('w-full rounded-t-[4px]', j.aujourdhui ? 'bg-emerald-400' : 'bg-emerald-500/30')}
                    style={{ height: h }}
                    title={`${j.jour} : ${eur(j.ca, 2)} — ${j.tickets} ticket${j.tickets > 1 ? 's' : ''}`}
                  />
                  <span className={cn('text-[10px] capitalize truncate w-full text-center',
                    j.aujourdhui ? 'text-emerald-300 font-bold' : 'text-zinc-500')}>
                    {j.jour.replace('.', '')}
                  </span>
                </div>
              )
            })}
          </div>

          {b.topJour.length > 0 && (
            <div className="mt-4">
              <p className="text-xs text-zinc-400 font-medium mb-1.5">Ce qui part aujourd&apos;hui</p>
              <ul className="space-y-1">
                {b.topJour.slice(0, 4).map(p => (
                  <li key={p.nom} className="flex items-baseline gap-2 text-sm">
                    <span className="tabular-nums font-black text-emerald-400 w-8 shrink-0">{p.quantite}×</span>
                    <span className="truncate text-zinc-200">{p.nom}</span>
                    <span className="ml-auto tabular-nums text-zinc-400 text-xs shrink-0">{eur(p.ca, 2)}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>

      {b.aClasser > 0 && (
        <Link href="/admin/recettes"
              className="mt-4 flex items-center gap-2 rounded-xl bg-amber-500/15 ring-1 ring-amber-500/30 px-3 py-2 text-sm text-amber-200 hover:bg-amber-500/20">
          <span aria-hidden>🏷</span>
          {b.aClasser} produit{b.aClasser > 1 ? 's' : ''} créé{b.aClasser > 1 ? 's' : ''} depuis la caisse
          {b.aClasser > 1 ? ' sont' : ' est'} à classer
        </Link>
      )}
    </section>
  )
}

function Stat({ libelle, valeur }: { libelle: string; valeur: string }) {
  return (
    <div className="rounded-xl bg-zinc-800/70 px-2.5 py-2">
      <p className="text-[10px] uppercase tracking-wider text-zinc-400 font-bold truncate">{libelle}</p>
      <p className="text-base sm:text-lg font-black tabular-nums leading-tight mt-0.5">{valeur}</p>
    </div>
  )
}
