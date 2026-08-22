// /admin/ventes — Statistiques de vente.
//
// Reprend ce que montre la caisse (CA, tickets, panier moyen, top produits,
// modes de paiement) et y ajoute ce qu'elle ne montre pas : la comparaison
// systématique à la période précédente, les heures de pointe, et surtout les
// produits qui ne se vendent PAS — la caisse ne connaît que ce qui passe.

import Link from 'next/link'
import { getVentesStats, PERIODES, type Periode, type Delta } from '@/lib/ventes-stats'
import { cn } from '@/lib/utils'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Statistiques de vente' }

const eur = (n: number, d = 0) =>
  n.toLocaleString('fr-FR', { minimumFractionDigits: d, maximumFractionDigits: d }) + ' €'

export default async function VentesPage({
  searchParams,
}: { searchParams: Promise<{ p?: string }> }) {
  const sp = await searchParams
  const periode: Periode = (['jour', 'semaine', 'mois'] as const).includes(sp.p as Periode)
    ? (sp.p as Periode) : 'semaine'
  const s = await getVentesStats(periode)

  const maxJour = Math.max(...s.parJour.map(j => j.ca), 1)
  const maxHeure = Math.max(...s.parHeure.map(h => h.ca), 1)

  return (
    <div className="max-w-5xl mx-auto px-4 py-6 sm:py-8">
      <div className="flex items-baseline justify-between gap-3 flex-wrap mb-4">
        <h1 className="text-2xl sm:text-3xl font-black text-zinc-900">Statistiques de vente</h1>
        <Link href="/admin/cat" className="text-sm text-zinc-500 hover:text-zinc-900">← Accueil</Link>
      </div>

      {/* Sélecteur de période — des liens, pas du JavaScript : la page est
          rendue côté serveur et se partage par son URL. */}
      <div className="flex gap-2 mb-6">
        {(Object.keys(PERIODES) as Periode[]).map(p => (
          <Link
            key={p}
            href={`/admin/ventes?p=${p}`}
            className={cn(
              'px-4 min-h-[48px] inline-flex items-center rounded-xl font-bold text-sm transition',
              p === periode ? 'bg-zinc-900 text-white' : 'bg-white ring-1 ring-zinc-200 text-zinc-600 hover:ring-zinc-300',
            )}
          >
            {PERIODES[p].label}
          </Link>
        ))}
      </div>

      {/* ── Les trois chiffres, chacun face au précédent ──────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-6">
        <Chiffre titre="Chiffre d'affaires" d={s.ca} format={v => eur(v)} />
        <Chiffre titre="Tickets" d={s.tickets} format={v => String(Math.round(v))} />
        <Chiffre titre="Panier moyen" d={s.panierMoyen} format={v => eur(v, 2)} />
      </div>

      {/* ── Marge & casse ─────────────────────────────────────────────── */}
      {/* Les marges de l'audit, mais VIVANTES : recalculées à chaque visite
          depuis les ventes et les coûts d'achat (0126). La casse (invendus
          du soir, 0129) vient en déduction — un croissant jeté coûte autant
          qu'un croissant vendu. */}
      {s.marge.caHTCouvert > 0 && (
        <Bloc titre="Marge brute"
              aide={`Calculée sur ${s.marge.couverturePct} % du CA HT (produits au coût d'achat connu). Scanne les factures manquantes pour élargir.`}>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div>
              <p className="text-[11px] uppercase tracking-wider text-zinc-500 font-bold">CA HT couvert</p>
              <p className="text-xl font-black tabular-nums text-zinc-800">{eur(s.marge.caHTCouvert, 2)}</p>
            </div>
            <div>
              <p className="text-[11px] uppercase tracking-wider text-zinc-500 font-bold">Coût d'achat</p>
              <p className="text-xl font-black tabular-nums text-zinc-800">{eur(s.marge.cout, 2)}</p>
            </div>
            <div>
              <p className="text-[11px] uppercase tracking-wider text-zinc-500 font-bold">Marge brute</p>
              <p className="text-xl font-black tabular-nums text-emerald-700">{eur(s.marge.brute, 2)}</p>
            </div>
            <div>
              <p className="text-[11px] uppercase tracking-wider text-zinc-500 font-bold">Food cost</p>
              <p className={cn('text-xl font-black tabular-nums',
                (s.marge.foodCostPct ?? 0) > 33 ? 'text-red-600'
                : (s.marge.foodCostPct ?? 0) >= 28 ? 'text-amber-600' : 'text-emerald-700')}>
                {s.marge.foodCostPct != null ? `${s.marge.foodCostPct.toLocaleString('fr-FR')} %` : '—'}
              </p>
              <p className="text-[10px] text-zinc-400">cible 28–33 %</p>
            </div>
          </div>
          {s.casse.total > 0 && (
            <div className="mt-3 pt-3 border-t border-zinc-100 flex flex-wrap items-baseline gap-x-4 gap-y-1">
              <p className="text-sm text-zinc-700">
                🗑 Casse : <b className="text-red-600 tabular-nums">{eur(s.casse.total, 2)}</b>
                {' '}({s.casse.pieces} pièce{s.casse.pieces > 1 ? 's' : ''})
                {' '}→ marge nette <b className="tabular-nums">{eur(s.marge.brute - s.casse.total, 2)}</b>
              </p>
              <p className="text-xs text-zinc-500 truncate">
                {s.casse.top.map(t => `${t.nom} ${eur(t.eur, 2)}`).join(' · ')}
              </p>
            </div>
          )}
        </Bloc>
      )}

      {/* ── CA par jour ───────────────────────────────────────────────── */}
      {s.parJour.length > 1 && (
        <Bloc titre="Chiffre d'affaires par jour">
          <div className="flex items-end gap-1.5" style={{ height: 150 }}>
            {s.parJour.map((j, i) => {
              const meilleur = j.ca === maxJour && j.ca > 0
              return (
                <div key={j.date} className="flex-1 flex flex-col items-center justify-end gap-1 min-w-0">
                  {/* Le montant n'est écrit que sur le meilleur jour et le dernier :
                      une étiquette sur chaque barre ferait un tableau, pas un graphe. */}
                  {(meilleur || i === s.parJour.length - 1) && (
                    <span className="text-[10px] font-black tabular-nums text-zinc-700 whitespace-nowrap">{eur(j.ca)}</span>
                  )}
                  <div
                    className={cn('w-full rounded-t-[4px]', meilleur ? 'bg-emerald-600' : 'bg-emerald-500/35')}
                    style={{ height: Math.max(3, (j.ca / maxJour) * 108) }}
                    title={`${j.label} : ${eur(j.ca, 2)} — ${j.tickets} ticket${j.tickets > 1 ? 's' : ''}`}
                  />
                  <span className="text-[10px] text-zinc-500 capitalize truncate w-full text-center">{j.label}</span>
                </div>
              )
            })}
          </div>
        </Bloc>
      )}

      {/* ── Heures de pointe ──────────────────────────────────────────── */}
      {s.parHeure.length > 0 && (
        <Bloc titre="Heures de pointe"
              aide="Quand produire et quand renforcer le comptoir. La caisse ne donne pas cette vue.">
          <div className="flex items-end gap-1" style={{ height: 120 }}>
            {s.parHeure.map(h => {
              const fort = h.ca === maxHeure
              return (
                <div key={h.heure} className="flex-1 flex flex-col items-center justify-end gap-1 min-w-0">
                  {fort && <span className="text-[10px] font-black tabular-nums text-zinc-700">{eur(h.ca)}</span>}
                  <div
                    className={cn('w-full rounded-t-[4px]', fort ? 'bg-emerald-600' : 'bg-emerald-500/35')}
                    style={{ height: Math.max(3, (h.ca / maxHeure) * 82) }}
                    title={`${h.heure} h : ${eur(h.ca, 2)} — ${h.tickets} ticket${h.tickets > 1 ? 's' : ''}`}
                  />
                  <span className="text-[10px] text-zinc-500 tabular-nums">{h.heure}h</span>
                </div>
              )
            })}
          </div>
        </Bloc>
      )}

      {/* ── Top produits ──────────────────────────────────────────────── */}
      {s.topProduits.length > 0 && (
        <Bloc titre="Meilleures ventes">
          <ol className="space-y-1.5">
            {s.topProduits.map((p, i) => (
              <li key={p.nom} className="flex items-center gap-3">
                <span className="w-5 text-right text-xs font-black text-zinc-400 tabular-nums shrink-0">{i + 1}</span>
                <span className="w-10 text-right text-sm font-black text-emerald-700 tabular-nums shrink-0">{p.quantite}×</span>
                <span className="flex-1 min-w-0">
                  <span className="block truncate text-sm text-zinc-800">{p.nom}</span>
                  <span className="block h-1.5 mt-1 rounded-full bg-emerald-500"
                        style={{ width: `${Math.max(2, p.part * 100)}%` }} />
                </span>
                <span className="text-sm tabular-nums text-zinc-700 font-bold shrink-0 w-20 text-right">{eur(p.ca, 2)}</span>
                {/* Food cost par produit : le prix ne dit rien sans le coût */}
                <span className={cn('text-xs tabular-nums font-bold shrink-0 w-14 text-right',
                  p.fc == null ? 'text-zinc-300'
                  : p.fc > 33 ? 'text-red-600'
                  : p.fc >= 28 ? 'text-amber-600' : 'text-emerald-700')}>
                  {p.fc != null ? `${p.fc.toLocaleString('fr-FR')} %` : '—'}
                </span>
              </li>
            ))}
          </ol>
        </Bloc>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        {s.parCategorie.length > 0 && (
          <Bloc titre="Par famille">
            <ul className="space-y-2">
              {s.parCategorie.map(c => (
                <li key={c.nom} className="text-sm">
                  <div className="flex justify-between gap-2">
                    <span className="truncate text-zinc-800">{c.nom}</span>
                    <span className="tabular-nums font-bold text-zinc-700 shrink-0">
                      {eur(c.ca, 2)} <span className="text-zinc-400 font-normal">{Math.round(c.part * 100)} %</span>
                    </span>
                  </div>
                  <span className="block h-1.5 mt-1 rounded-full bg-emerald-500"
                        style={{ width: `${Math.max(2, c.part * 100)}%` }} />
                </li>
              ))}
            </ul>
          </Bloc>
        )}

        <Bloc titre="Encaissement & TVA">
          <ul className="space-y-2 mb-4">
            {s.parPaiement.map(p => (
              <li key={p.nom} className="text-sm">
                <div className="flex justify-between gap-2">
                  <span className="text-zinc-800">{p.nom}</span>
                  <span className="tabular-nums font-bold text-zinc-700">
                    {eur(p.ca, 2)} <span className="text-zinc-400 font-normal">{Math.round(p.part * 100)} %</span>
                  </span>
                </div>
                <span className="block h-1.5 mt-1 rounded-full bg-emerald-500"
                      style={{ width: `${Math.max(2, p.part * 100)}%` }} />
              </li>
            ))}
          </ul>
          <div className="border-t border-zinc-200 pt-3">
            <p className="text-[11px] uppercase tracking-wider font-bold text-zinc-400 mb-1.5">TVA collectée</p>
            {s.tva.length === 0 ? (
              <p className="text-sm text-zinc-400">Aucune ventilation sur la période.</p>
            ) : (
              <ul className="space-y-1">
                {s.tva.map(t => (
                  <li key={t.taux} className="flex justify-between text-sm">
                    <span className="text-zinc-600">{t.taux} %</span>
                    <span className="tabular-nums font-bold text-zinc-800">{eur(t.montant, 2)}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </Bloc>
      </div>

      {/* ── Ce que la caisse ne dit pas ───────────────────────────────── */}
      <Bloc titre={`Rien vendu sur la période — ${s.dormants.length} produit${s.dormants.length > 1 ? 's' : ''}`}
            aide="La caisse ne connaît que ce qui passe. Savoir ce qui ne part pas, c'est ce qui permet d'arrêter d'en produire.">
        {s.dormants.length === 0 ? (
          <p className="text-sm text-emerald-700 font-medium">Toute la carte a trouvé preneur. Beau score.</p>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {s.dormants.map(d => (
              <span key={d.nom}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-amber-50 ring-1 ring-amber-200 px-2 py-1 text-xs">
                <span className="text-zinc-800">{d.nom}</span>
                <span className="text-amber-700">{d.categorie}</span>
              </span>
            ))}
          </div>
        )}
      </Bloc>
    </div>
  )
}

function Chiffre({ titre, d, format }: { titre: string; d: Delta; format: (v: number) => string }) {
  const hausse = d.valeur >= d.precedent
  return (
    <div className="rounded-2xl bg-white ring-1 ring-zinc-200 p-4">
      <p className="text-[11px] uppercase tracking-wider font-bold text-zinc-400">{titre}</p>
      <p className="text-3xl font-black tabular-nums text-zinc-900 mt-1 leading-none">{format(d.valeur)}</p>
      {d.precedent > 0 ? (
        <p className="mt-2 text-xs">
          <span className={cn('font-bold tabular-nums', hausse ? 'text-emerald-600' : 'text-amber-600')}>
            {hausse ? '▲' : '▼'} {d.pct !== null ? `${hausse ? '+' : '−'}${Math.abs(d.pct)} %` : '—'}
          </span>
          <span className="text-zinc-400"> vs {format(d.precedent)} avant</span>
        </p>
      ) : (
        <p className="mt-2 text-xs text-zinc-400">Pas de période précédente comparable.</p>
      )}
    </div>
  )
}

function Bloc({ titre, aide, children }: { titre: string; aide?: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl bg-white ring-1 ring-zinc-200 p-4 sm:p-5 mb-4">
      <h2 className="font-black text-zinc-900">{titre}</h2>
      {aide && <p className="text-xs text-zinc-500 mt-0.5 mb-3">{aide}</p>}
      <div className={aide ? '' : 'mt-3'}>{children}</div>
    </section>
  )
}
