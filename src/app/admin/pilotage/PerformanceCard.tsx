// Card "Performance vs point mort" — vue manager.
// Server Component (calcul live des données).

import { Card } from '@/components/ui/card'
import { TrendingUp, Wallet, Users, Trophy, Calculator } from 'lucide-react'
import Link from 'next/link'
import { cn } from '@/lib/utils'
import { calculerPerformanceMensuelle } from '@/lib/challenges-cloture'
import { periodeMoisCourant } from '@/lib/challenges-metrics'
import ClotureMoisButton from './ClotureMoisButton'

export default async function PerformanceCard() {
  const periode = periodeMoisCourant()
  const perf = await calculerPerformanceMensuelle(periode)

  const ratioPctMort = perf.seuil > 0 ? Math.min(200, Math.round((perf.ca / perf.seuil) * 100)) : 0
  const dansLeVert = perf.ca >= perf.seuil
  const moisLabel = new Date(periode.debut).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })

  return (
    <Card className="p-5">
      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <div>
          <h3 className="text-lg font-bold flex items-center gap-2">
            <TrendingUp className="h-5 w-5 text-emerald-600" />
            Performance vs point mort — {moisLabel}
          </h3>
          <p className="text-xs text-zinc-500 mt-0.5">
            Surplus partagé : <strong>{perf.pct_redistribution.toFixed(0)}%</strong> du surplus,
            pondéré sur les <strong>{perf.total_heures.toFixed(1)} h</strong> travaillées par l'équipe.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {!perf.seuil && (
            <Link
              href="/admin/economie"
              className="text-xs px-3 py-1.5 rounded-md bg-amber-100 text-amber-900 border border-amber-300 hover:bg-amber-200"
            >
              ⚠️ Saisir le point mort
            </Link>
          )}
          <ClotureMoisButton mois={periode.debut} dejaCloture={!!perf.cloture_le} />
        </div>
      </div>

      {/* KPIs globaux */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
        <div className="rounded-md bg-zinc-50 p-3">
          <p className="text-xs text-zinc-500 flex items-center gap-1"><Wallet className="h-3 w-3" /> CA réalisé</p>
          <p className="text-xl font-bold tabular-nums">{perf.ca.toFixed(2)} €</p>
        </div>
        <div className="rounded-md bg-zinc-50 p-3">
          <p className="text-xs text-zinc-500 flex items-center gap-1"><Calculator className="h-3 w-3" /> CA seuil (point mort)</p>
          <p className="text-xl font-bold tabular-nums">{perf.seuil.toFixed(2)} €</p>
          <p className={cn('text-[10px] mt-0.5 font-medium', dansLeVert ? 'text-emerald-600' : 'text-zinc-500')}>
            {ratioPctMort}% atteint
          </p>
        </div>
        <div className={cn(
          'rounded-md p-3',
          perf.surplus > 0 ? 'bg-emerald-50' : 'bg-zinc-50',
        )}>
          <p className="text-xs text-zinc-500">Surplus disponible</p>
          <p className={cn(
            'text-xl font-bold tabular-nums',
            perf.surplus > 0 ? 'text-emerald-700' : 'text-zinc-400',
          )}>
            {perf.surplus.toFixed(2)} €
          </p>
        </div>
        <div className={cn(
          'rounded-md p-3',
          perf.pool_equipe > 0 ? 'bg-amber-50 border border-amber-200' : 'bg-zinc-50',
        )}>
          <p className="text-xs text-amber-700 flex items-center gap-1"><Trophy className="h-3 w-3" /> Pool équipe</p>
          <p className={cn(
            'text-xl font-bold tabular-nums',
            perf.pool_equipe > 0 ? 'text-amber-800' : 'text-zinc-400',
          )}>
            {perf.pool_equipe.toFixed(2)} €
          </p>
          <p className="text-[10px] text-amber-600 mt-0.5">
            ({perf.pct_redistribution.toFixed(0)}% × {perf.surplus.toFixed(0)} €)
          </p>
        </div>
      </div>

      {/* Barre point mort */}
      <div className="mb-4">
        <div className="flex justify-between text-xs text-zinc-500 mb-1">
          <span>0 €</span>
          <span className="font-medium">{perf.seuil.toFixed(0)} € (seuil)</span>
          <span>+ surplus</span>
        </div>
        <div className="relative h-3 bg-zinc-100 rounded-full overflow-hidden">
          <div
            className={cn(
              'absolute left-0 top-0 h-full transition-all',
              dansLeVert ? 'bg-emerald-500' : 'bg-amber-400',
            )}
            style={{ width: `${Math.min(100, ratioPctMort)}%` }}
          />
          {dansLeVert && (
            <div
              className="absolute top-0 h-full bg-amber-500"
              style={{ left: '50%', width: `${Math.min(50, (ratioPctMort - 100) / 2)}%` }}
            />
          )}
          <div className="absolute top-0 h-full w-0.5 bg-zinc-700" style={{ left: '50%' }} />
        </div>
      </div>

      {/* Tableau employés */}
      <div className="border-t pt-3">
        <h4 className="text-xs font-bold uppercase tracking-wider text-zinc-500 mb-2 flex items-center gap-1">
          <Users className="h-3 w-3" /> Primes prévisionnelles équipe ({perf.employes.length})
        </h4>
        <div className="overflow-x-auto -mx-2">
          <table className="w-full text-sm">
            <thead className="bg-zinc-50">
              <tr>
                <th className="text-left px-3 py-2 font-medium text-zinc-600">Employé</th>
                <th className="text-right px-3 py-2 font-medium text-zinc-600">Heures</th>
                <th className="text-right px-3 py-2 font-medium text-zinc-600">Primes fixes</th>
                <th className="text-right px-3 py-2 font-medium text-zinc-600">Bonus surplus</th>
                <th className="text-right px-3 py-2 font-medium text-zinc-600">Total prévisionnel</th>
              </tr>
            </thead>
            <tbody>
              {perf.employes.length === 0 ? (
                <tr><td colSpan={5} className="px-3 py-6 text-center text-zinc-500 italic">Aucun employé actif.</td></tr>
              ) : (
                perf.employes.map(p => (
                  <tr key={p.employe.id} className="border-t hover:bg-zinc-50">
                    <td className="px-3 py-2">
                      <p className="font-medium">{p.employe.prenom} {p.employe.nom}</p>
                      <p className="text-[11px] text-zinc-500">{p.employe.poste}</p>
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">{p.heures.toFixed(1)} h</td>
                    <td className="px-3 py-2 text-right tabular-nums text-emerald-700">
                      {p.primes_fixes > 0 ? `+${p.primes_fixes.toFixed(2)} €` : '—'}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-amber-700">
                      {p.bonus_surplus > 0 ? `+${p.bonus_surplus.toFixed(2)} €` : '—'}
                    </td>
                    <td className="px-3 py-2 text-right">
                      <strong className="tabular-nums text-zinc-900">
                        {p.total > 0 ? `${p.total.toFixed(2)} €` : '—'}
                      </strong>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
            {perf.employes.length > 0 && (
              <tfoot className="border-t bg-zinc-50">
                <tr>
                  <td className="px-3 py-2 font-bold">TOTAL</td>
                  <td className="px-3 py-2 text-right font-bold tabular-nums">
                    {perf.total_heures.toFixed(1)} h
                  </td>
                  <td className="px-3 py-2 text-right font-bold tabular-nums text-emerald-700">
                    +{perf.employes.reduce((s, p) => s + p.primes_fixes, 0).toFixed(2)} €
                  </td>
                  <td className="px-3 py-2 text-right font-bold tabular-nums text-amber-700">
                    +{perf.pool_equipe.toFixed(2)} €
                  </td>
                  <td className="px-3 py-2 text-right">
                    <strong className="tabular-nums text-emerald-700 text-base">
                      {perf.employes.reduce((s, p) => s + p.total, 0).toFixed(2)} €
                    </strong>
                  </td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>

      {perf.cloture_le && (
        <div className="mt-3 rounded-md bg-zinc-100 px-3 py-2 text-xs text-zinc-600 border">
          ✓ Mois clôturé. Re-cliquer sur « Clôturer » met à jour les résultats avec les valeurs actuelles.
        </div>
      )}
    </Card>
  )
}
