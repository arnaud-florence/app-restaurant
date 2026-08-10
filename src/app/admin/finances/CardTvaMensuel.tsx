// Card "TVA collectée du mois" — agrégat par taux + comparaison mois N-1.
// Server Component. Inclut bouton export CSV pour comptable.

import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import { Card } from '@/components/ui/card'
import { Receipt, Download, TrendingUp, TrendingDown, Minus } from 'lucide-react'
import { cn } from '@/lib/utils'

function pad2(n: number) { return n.toString().padStart(2, '0') }
function fmtMois(d: Date) { return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}` }

type LigneTaux = { taux: string; ht: number; tva: number; ttc: number; nb_articles: number }

async function calculerTvaMois(moisIso: string): Promise<{
  total_ht: number
  total_tva: number
  total_ttc: number
  par_taux: LigneTaux[]
  par_consommation: { sur_place: number; emporter: number }
  nb_commandes_encaissees: number
}> {
  const sb = await createClient()
  const debut = `${moisIso}-01T00:00:00`
  const finDate = new Date(moisIso + '-01')
  finDate.setMonth(finDate.getMonth() + 1)
  const fin = finDate.toISOString().slice(0, 10) + 'T00:00:00'

  // Récupère les commandes encaissées du mois + leurs articles
  const { data: cmds } = await sb.from('commandes')
    .select('id, statut, consommation, montant_total_ht, montant_total_ttc, tva_total, ventilation_tva')
    .eq('statut', 'encaisse')
    .gte('created_at', debut).lt('created_at', fin)

  const ids = (cmds ?? []).map(c => c.id as string)
  type CmdRow = { id: string; consommation?: string; montant_total_ht?: number; montant_total_ttc?: number; tva_total?: number; ventilation_tva?: Record<string, number> }
  const cmdsTyped = (cmds ?? []) as CmdRow[]

  let total_ht = 0, total_tva = 0, total_ttc = 0
  let surPlace = 0, emporter = 0
  for (const c of cmdsTyped) {
    total_ht  += Number(c.montant_total_ht ?? 0)
    total_tva += Number(c.tva_total ?? 0)
    total_ttc += Number(c.montant_total_ttc ?? 0)
    if (c.consommation === 'emporter') emporter += Number(c.montant_total_ttc ?? 0)
    else                                surPlace += Number(c.montant_total_ttc ?? 0)
  }

  // Articles : agrégat par taux
  let arts: Array<{ tva_taux?: number; tva_eur?: number; quantite?: number; prix_unitaire_ht?: number }> = []
  if (ids.length > 0) {
    const { data: artsData } = await sb.from('commande_articles')
      .select('tva_taux, tva_eur, quantite, prix_unitaire_ht')
      .in('commande_id', ids)
    arts = artsData ?? []
  }
  const mapTaux = new Map<string, { ht: number; tva: number; ttc: number; nb_articles: number }>()
  for (const a of arts) {
    const t = String(Number(a.tva_taux ?? 10))
    const ht = Number(a.quantite ?? 0) * Number(a.prix_unitaire_ht ?? 0)
    const tva = Number(a.tva_eur ?? 0)
    const cur = mapTaux.get(t) ?? { ht: 0, tva: 0, ttc: 0, nb_articles: 0 }
    cur.ht += ht
    cur.tva += tva
    cur.ttc += ht + tva
    cur.nb_articles += 1
    mapTaux.set(t, cur)
  }
  const par_taux: LigneTaux[] = Array.from(mapTaux.entries())
    .sort((a, b) => Number(a[0]) - Number(b[0]))
    .map(([taux, v]) => ({ taux, ht: round(v.ht), tva: round(v.tva), ttc: round(v.ttc), nb_articles: v.nb_articles }))

  return {
    total_ht: round(total_ht), total_tva: round(total_tva), total_ttc: round(total_ttc),
    par_taux,
    par_consommation: { sur_place: round(surPlace), emporter: round(emporter) },
    nb_commandes_encaissees: cmdsTyped.length,
  }
}

function round(n: number): number { return Math.round(n * 100) / 100 }

export default async function CardTvaMensuel({ moisIso }: { moisIso: string }) {
  const today = new Date()
  const moisPrec = new Date(moisIso + '-01')
  moisPrec.setMonth(moisPrec.getMonth() - 1)
  const moisPrecIso = fmtMois(moisPrec)

  const [actuel, prec] = await Promise.all([
    calculerTvaMois(moisIso),
    calculerTvaMois(moisPrecIso),
  ])

  const moisLabel = new Date(moisIso + '-01').toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })

  function delta(cur: number, p: number) {
    if (p === 0 && cur === 0) return { pct: 0, trend: 'flat' as const }
    if (p === 0) return { pct: 100, trend: 'up' as const }
    const pct = Math.round(((cur - p) / p) * 100)
    return { pct, trend: pct > 5 ? 'up' as const : pct < -5 ? 'down' as const : 'flat' as const }
  }
  const dTtc = delta(actuel.total_ttc, prec.total_ttc)
  const dTva = delta(actuel.total_tva, prec.total_tva)

  return (
    <Card className="p-5">
      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <div>
          <h3 className="text-lg font-bold flex items-center gap-2">
            <Receipt className="h-5 w-5 text-emerald-600" />
            TVA collectée — {moisLabel}
          </h3>
          <p className="text-xs text-zinc-500 mt-0.5">
            {actuel.nb_commandes_encaissees} commande{actuel.nb_commandes_encaissees > 1 ? 's' : ''} encaissée{actuel.nb_commandes_encaissees > 1 ? 's' : ''} · ventilation par taux pour le comptable.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href={`/admin/finances/bilan-mensuel?mois=${moisIso}`}
            className="inline-flex items-center gap-1.5 text-xs px-3 py-2 rounded-md bg-zinc-100 hover:bg-zinc-200 text-zinc-700 border border-zinc-300 font-medium"
          >
            📑 Bilan PDF
          </Link>
          <Link
            href={`/api/tva/export-csv?mois=${moisIso}`}
            download
            className="inline-flex items-center gap-1.5 text-xs px-3 py-2 rounded-md bg-emerald-600 hover:bg-emerald-700 text-white font-medium"
          >
            <Download className="h-3.5 w-3.5" /> Export CSV comptable
          </Link>
        </div>
      </div>

      {actuel.nb_commandes_encaissees === 0 ? (
        <p className="text-sm text-zinc-500 italic text-center py-6">
          Aucune commande encaissée ce mois.
        </p>
      ) : (
        <>
          {/* KPIs globaux + comparaison */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
            <Kpi label="HT collecté" value={fmtEur(actuel.total_ht)} sub={`vs ${fmtEur(prec.total_ht)}`} />
            <Kpi
              label="TVA collectée"
              value={fmtEur(actuel.total_tva)}
              sub={`vs ${fmtEur(prec.total_tva)}`}
              trend={dTva}
            />
            <Kpi label="TTC encaissé" value={fmtEur(actuel.total_ttc)} sub={`vs ${fmtEur(prec.total_ttc)}`} trend={dTtc} />
            <Kpi
              label="Sur place / Emporter"
              value={`${fmtEur(actuel.par_consommation.sur_place)} / ${fmtEur(actuel.par_consommation.emporter)}`}
              sub="TTC"
            />
          </div>

          {/* Détail par taux — mobile : cartes */}
          <ul className="md:hidden divide-y divide-zinc-100">
            {actuel.par_taux.map(l => (
              <li key={l.taux} className="py-3 flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <span className={cn(
                    'inline-block px-2 py-0.5 rounded-full text-xs font-bold',
                    l.taux === '20'  ? 'bg-violet-100 text-violet-900'  :
                    l.taux === '10'  ? 'bg-emerald-100 text-emerald-900' :
                    l.taux === '5.5' ? 'bg-amber-100 text-amber-900'    :
                                        'bg-zinc-100 text-zinc-700',
                  )}>
                    {l.taux} %
                  </span>
                  <span className="text-[11px] text-zinc-500 ml-2">
                    {l.taux === '20'  ? '(alcool)'    :
                     l.taux === '10'  ? '(sur place)' :
                     l.taux === '5.5' ? '(emporter)'  : ''}
                  </span>
                  <p className="text-[11px] text-zinc-500 mt-1">{l.nb_articles} article{l.nb_articles > 1 ? 's' : ''} · Base HT {fmtEur(l.ht)}</p>
                </div>
                <div className="text-right shrink-0">
                  <p className="font-bold tabular-nums text-emerald-700">{fmtEur(l.tva)}</p>
                  <p className="text-[11px] text-zinc-500 tabular-nums">TTC {fmtEur(l.ttc)}</p>
                </div>
              </li>
            ))}
            <li className="py-3 flex items-center justify-between gap-3 bg-zinc-50 -mx-2 px-2 font-bold">
              <span>TOTAL</span>
              <div className="text-right">
                <p className="tabular-nums text-emerald-700">{fmtEur(actuel.total_tva)}</p>
                <p className="text-[11px] text-zinc-500 tabular-nums">TTC {fmtEur(actuel.total_ttc)}</p>
              </div>
            </li>
          </ul>

          {/* Détail par taux — desktop : table */}
          <div className="hidden md:block overflow-x-auto -mx-2">
            <table className="w-full text-sm">
              <thead className="bg-zinc-50">
                <tr>
                  <th className="text-left px-3 py-2">Taux TVA</th>
                  <th className="text-right px-3 py-2">Articles vendus</th>
                  <th className="text-right px-3 py-2">Base HT</th>
                  <th className="text-right px-3 py-2">TVA collectée</th>
                  <th className="text-right px-3 py-2">Total TTC</th>
                </tr>
              </thead>
              <tbody>
                {actuel.par_taux.map(l => (
                  <tr key={l.taux} className="border-t hover:bg-zinc-50">
                    <td className="px-3 py-2 font-bold">
                      <span className={cn(
                        'inline-block px-2 py-0.5 rounded-full text-xs font-bold',
                        l.taux === '20'  ? 'bg-violet-100 text-violet-900'  :
                        l.taux === '10'  ? 'bg-emerald-100 text-emerald-900' :
                        l.taux === '5.5' ? 'bg-amber-100 text-amber-900'    :
                                            'bg-zinc-100 text-zinc-700',
                      )}>
                        {l.taux} %
                      </span>
                      <span className="text-[11px] text-zinc-500 ml-2">
                        {l.taux === '20'  ? '(alcool)'    :
                         l.taux === '10'  ? '(sur place)' :
                         l.taux === '5.5' ? '(emporter)'  : ''}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">{l.nb_articles}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{fmtEur(l.ht)}</td>
                    <td className="px-3 py-2 text-right tabular-nums font-bold text-emerald-700">{fmtEur(l.tva)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{fmtEur(l.ttc)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="border-t-2 bg-zinc-50">
                <tr>
                  <td className="px-3 py-2 font-bold">TOTAL</td>
                  <td></td>
                  <td className="px-3 py-2 text-right font-bold tabular-nums">{fmtEur(actuel.total_ht)}</td>
                  <td className="px-3 py-2 text-right font-bold tabular-nums text-emerald-700">{fmtEur(actuel.total_tva)}</td>
                  <td className="px-3 py-2 text-right font-bold tabular-nums">{fmtEur(actuel.total_ttc)}</td>
                </tr>
              </tfoot>
            </table>
          </div>

          <div className="mt-3 rounded-md bg-blue-50 border border-blue-200 px-3 py-2 text-xs text-blue-900">
            💡 La TVA collectée est due à l&apos;État. Tu peux déduire la TVA payée sur tes achats (factures fournisseurs).
            L&apos;export CSV contient le détail nécessaire pour ta déclaration.
          </div>
        </>
      )}
    </Card>
  )
}

function Kpi({ label, value, sub, trend }: { label: string; value: string; sub?: string; trend?: { trend: 'up' | 'down' | 'flat'; pct: number } }) {
  const Icon = trend?.trend === 'up' ? TrendingUp : trend?.trend === 'down' ? TrendingDown : Minus
  const cls  = trend?.trend === 'up' ? 'text-emerald-600' : trend?.trend === 'down' ? 'text-red-600' : 'text-zinc-400'
  const sign = trend && trend.pct > 0 ? '+' : ''
  return (
    <div className="rounded-md bg-zinc-50 p-3">
      <p className="text-xs text-zinc-500">{label}</p>
      <p className="text-lg font-bold tabular-nums mt-0.5">{value}</p>
      {trend ? (
        <p className={cn('text-[11px] flex items-center gap-1', cls)}>
          <Icon className="h-3 w-3" />{sign}{trend.pct}%
          {sub && <span className="text-zinc-400 ml-1">{sub}</span>}
        </p>
      ) : sub ? (
        <p className="text-[11px] text-zinc-400">{sub}</p>
      ) : null}
    </div>
  )
}

function fmtEur(n: number) {
  return n.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' })
}
