// Journal d'une journée de vente — la page « retraçable ».
// Tout ce qu'un comptable ou un contrôle peut demander sur ce jour : tickets
// un à un, ventilation TVA, paiements, marge par produit, casse du soir.

import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getJourStats } from '@/lib/jour-stats'
import { cn } from '@/lib/utils'

export const dynamic = 'force-dynamic'

const eur = (n: number, d = 2) =>
  new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', minimumFractionDigits: d, maximumFractionDigits: d }).format(n)

const SOURCE_EMOJI: Record<string, string> = {
  CAISSE: '🧾', ONLINE: '🌐', COMPTOIR: '🛒', TABLE: '🪑', BORNE: '🖥',
}

export default async function JourPage({ params }: { params: { date: string } }) {
  const s = await getJourStats(params.date)
  if (!s) notFound()

  const dateLisible = new Date(s.date + 'T12:00:00Z')
    .toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
  const maxHeure = Math.max(...s.parHeure.map(h => h.ca), 1)

  const veille = new Date(new Date(s.date + 'T12:00:00Z').getTime() - 86_400_000).toISOString().slice(0, 10)
  const lendemain = new Date(new Date(s.date + 'T12:00:00Z').getTime() + 86_400_000).toISOString().slice(0, 10)
  const aujourdhui = new Intl.DateTimeFormat('fr-CA', { timeZone: 'Europe/Paris' }).format(new Date())

  return (
    <div className="min-h-screen bg-zinc-50">
      <div className="max-w-4xl mx-auto px-4 py-6 space-y-5">
        <header className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <Link href="/admin/ventes" className="text-sm text-zinc-500 hover:text-zinc-800">← Ventes</Link>
            <h1 className="text-2xl font-black text-zinc-900 capitalize">{dateLisible}</h1>
          </div>
          <div className="flex gap-2">
            <Link href={`/admin/ventes/${veille}`}
              className="min-h-[40px] px-3 inline-flex items-center rounded-md border border-zinc-300 bg-white text-sm font-bold hover:border-zinc-500">← Veille</Link>
            {lendemain <= aujourdhui && (
              <Link href={`/admin/ventes/${lendemain}`}
                className="min-h-[40px] px-3 inline-flex items-center rounded-md border border-zinc-300 bg-white text-sm font-bold hover:border-zinc-500">Lendemain →</Link>
            )}
          </div>
        </header>

        {s.tickets === 0 ? (
          <p className="text-center text-zinc-500 py-16">Aucune vente encaissée ce jour-là.</p>
        ) : (
          <>
            {/* ── KPIs du jour ─────────────────────────────────────────── */}
            <section className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {[
                ['CA TTC', eur(s.caTTC)],
                ['Tickets', String(s.tickets)],
                ['Panier moyen', eur(s.panierMoyen)],
                ['CA HT', eur(s.caHT)],
              ].map(([l, v]) => (
                <div key={l} className="bg-white rounded-lg border border-zinc-200 px-4 py-3">
                  <p className="text-[11px] uppercase tracking-wider text-zinc-500 font-bold">{l}</p>
                  <p className="text-xl font-black tabular-nums text-zinc-900">{v}</p>
                </div>
              ))}
            </section>

            {/* ── Marge & casse du jour ────────────────────────────────── */}
            <section className="bg-white rounded-lg border border-zinc-200 px-4 py-3">
              <div className="flex flex-wrap items-baseline gap-x-6 gap-y-1">
                <p className="text-sm text-zinc-700">
                  Marge brute <b className="text-emerald-700 tabular-nums">{eur(s.marge.brute)}</b>
                  <span className="text-zinc-400"> (coût {eur(s.marge.cout)})</span>
                </p>
                <p className="text-sm text-zinc-700">
                  Food cost <b className={cn('tabular-nums',
                    (s.marge.foodCostPct ?? 0) > 33 ? 'text-red-600'
                    : (s.marge.foodCostPct ?? 0) >= 28 ? 'text-amber-600' : 'text-emerald-700')}>
                    {s.marge.foodCostPct != null ? `${s.marge.foodCostPct.toLocaleString('fr-FR')} %` : '—'}
                  </b>
                  <span className="text-zinc-400"> · couverture {s.marge.couverturePct} %</span>
                </p>
                {s.casse.total > 0 && (
                  <p className="text-sm text-zinc-700">
                    🗑 Casse <b className="text-red-600 tabular-nums">{eur(s.casse.total)}</b>
                    {' '}→ marge nette <b className="tabular-nums">{eur(s.marge.brute - s.casse.total)}</b>
                  </p>
                )}
              </div>
              {s.casse.lignes.length > 0 && (
                <p className="mt-1 text-xs text-zinc-500 truncate">
                  {s.casse.lignes.map(l => `${l.quantite}× ${l.nom}`).join(' · ')}
                </p>
              )}
            </section>

            {/* ── CA par heure ─────────────────────────────────────────── */}
            <section className="bg-white rounded-lg border border-zinc-200 p-4">
              <h2 className="text-sm font-bold text-zinc-700 mb-3">CA par heure</h2>
              <div className="flex items-end gap-1" style={{ height: 110 }}>
                {s.parHeure.map(h => (
                  <div key={h.heure} className="flex-1 flex flex-col items-center justify-end gap-1 min-w-0">
                    {h.ca === maxHeure && (
                      <span className="text-[10px] font-black tabular-nums text-zinc-700">{eur(h.ca, 0)}</span>
                    )}
                    <div className={cn('w-full rounded-t-[4px]', h.ca === maxHeure ? 'bg-emerald-600' : 'bg-emerald-500/35')}
                      style={{ height: Math.max(3, (h.ca / maxHeure) * 76) }}
                      title={`${h.heure} h : ${eur(h.ca)} — ${h.tickets} ticket(s)`} />
                    <span className="text-[10px] text-zinc-500 tabular-nums">{h.heure}h</span>
                  </div>
                ))}
              </div>
            </section>

            {/* ── Produits du jour ─────────────────────────────────────── */}
            <section className="bg-white rounded-lg border border-zinc-200 overflow-hidden">
              <h2 className="px-4 py-3 text-sm font-bold text-zinc-700 border-b border-zinc-200">
                Ventes par produit · {s.produits.length}
              </h2>
              <div className="overflow-x-auto">
                <table className="w-full text-sm min-w-[560px]">
                  <thead className="text-[11px] uppercase tracking-wider text-zinc-500 bg-zinc-50">
                    <tr>
                      <th className="text-left px-4 py-2 font-bold">Produit</th>
                      <th className="text-right px-3 py-2 font-bold">Qté</th>
                      <th className="text-right px-3 py-2 font-bold">CA TTC</th>
                      <th className="text-right px-3 py-2 font-bold">Marge HT</th>
                      <th className="text-right px-4 py-2 font-bold">FC</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-100">
                    {s.produits.map(p => (
                      <tr key={p.nom}>
                        <td className="px-4 py-1.5">
                          <span className="font-medium text-zinc-800">{p.nom}</span>
                          <span className="ml-2 text-[11px] text-zinc-400">{p.categorie}</span>
                        </td>
                        <td className="px-3 py-1.5 text-right tabular-nums">{p.quantite}</td>
                        <td className="px-3 py-1.5 text-right tabular-nums font-bold">{eur(p.caTTC)}</td>
                        <td className="px-3 py-1.5 text-right tabular-nums">{p.marge != null ? eur(p.marge) : '—'}</td>
                        <td className={cn('px-4 py-1.5 text-right tabular-nums font-bold',
                          p.fc == null ? 'text-zinc-300'
                          : p.fc > 33 ? 'text-red-600' : p.fc >= 28 ? 'text-amber-600' : 'text-emerald-700')}>
                          {p.fc != null ? `${p.fc.toLocaleString('fr-FR')} %` : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            {/* ── Paiements & TVA — le technique comptable ─────────────── */}
            <div className="grid gap-4 sm:grid-cols-2">
              <section className="bg-white rounded-lg border border-zinc-200 p-4">
                <h2 className="text-sm font-bold text-zinc-700 mb-2">Encaissements</h2>
                <ul className="space-y-1">
                  {s.paiements.map(p => (
                    <li key={p.nom} className="flex justify-between text-sm">
                      <span className="text-zinc-600">{p.nom} <span className="text-zinc-400">({p.n})</span></span>
                      <b className="tabular-nums">{eur(p.ca)}</b>
                    </li>
                  ))}
                </ul>
              </section>
              <section className="bg-white rounded-lg border border-zinc-200 p-4">
                <h2 className="text-sm font-bold text-zinc-700 mb-2">TVA collectée</h2>
                <ul className="space-y-1">
                  {s.tva.length === 0 && <li className="text-sm text-zinc-400">Pas de ventilation enregistrée</li>}
                  {s.tva.map(t => (
                    <li key={t.taux} className="flex justify-between text-sm">
                      <span className="text-zinc-600">{Number(t.taux).toLocaleString('fr-FR')} %</span>
                      <b className="tabular-nums">{eur(t.montant)}</b>
                    </li>
                  ))}
                </ul>
              </section>
            </div>

            {/* ── Tickets un à un — la traçabilité fine ────────────────── */}
            <section className="bg-white rounded-lg border border-zinc-200 overflow-hidden">
              <h2 className="px-4 py-3 text-sm font-bold text-zinc-700 border-b border-zinc-200">
                Tickets du jour · {s.ticketsListe.length}
              </h2>
              <div className="overflow-x-auto max-h-[60vh] overflow-y-auto">
                <table className="w-full text-sm min-w-[560px]">
                  <thead className="text-[11px] uppercase tracking-wider text-zinc-500 bg-zinc-50 sticky top-0">
                    <tr>
                      <th className="text-left px-4 py-2 font-bold">Heure</th>
                      <th className="text-left px-3 py-2 font-bold">N°</th>
                      <th className="text-left px-3 py-2 font-bold">Source</th>
                      <th className="text-right px-3 py-2 font-bold">Articles</th>
                      <th className="text-left px-3 py-2 font-bold">Paiement</th>
                      <th className="text-right px-4 py-2 font-bold">Montant</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-100">
                    {s.ticketsListe.map(t => (
                      <tr key={t.numero}>
                        <td className="px-4 py-1.5 tabular-nums text-zinc-600">{t.heure}</td>
                        <td className="px-3 py-1.5 font-mono text-xs text-zinc-500">{t.numero}</td>
                        <td className="px-3 py-1.5">{SOURCE_EMOJI[t.source] ?? ''} {t.source}</td>
                        <td className="px-3 py-1.5 text-right tabular-nums">{t.nbArticles}</td>
                        <td className="px-3 py-1.5 text-zinc-600">{t.paiement}</td>
                        <td className="px-4 py-1.5 text-right tabular-nums font-bold">{eur(t.montant)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          </>
        )}
      </div>
    </div>
  )
}
