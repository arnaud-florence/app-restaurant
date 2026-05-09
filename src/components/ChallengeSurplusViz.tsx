'use client'

// Visualisation gamifiée du challenge « CA mensuel surplus point mort ».
// 2 donuts côte à côte :
//   - Avancement % vers le point mort (sans afficher le CA absolu côté employé)
//   - Surplus généré + part employé pondérée heures
//
// Pas d'info chiffrée sensible côté employé : le CA et le seuil restent cachés.
// Le manager voit la même viz mais peut consulter les chiffres ailleurs.

import { PieChart, Pie, Cell, ResponsiveContainer } from 'recharts'
import { cn } from '@/lib/utils'
import { Card } from '@/components/ui/card'
import { Trophy, Target, Sparkles } from 'lucide-react'

export default function ChallengeSurplusViz({
  pctSeuilAtteint,         // 0-200 (peut dépasser 100 si surplus)
  surplusTotal,            // €
  maPart,                  // €
  mesHeures,               // h ce mois
  totalHeures,             // h équipe ce mois
  pctRedistribution,       // ex 30
  recompenseTitre,
}: {
  pctSeuilAtteint: number
  surplusTotal: number
  maPart: number
  mesHeures: number
  totalHeures: number
  pctRedistribution: number
  recompenseTitre?: string
}) {
  const atteint = pctSeuilAtteint >= 100
  const pctClamp = Math.min(100, Math.round(pctSeuilAtteint))
  const restant  = 100 - pctClamp

  const dataAvancement = [
    { name: 'Atteint', value: pctClamp },
    { name: 'Restant', value: restant },
  ]

  return (
    <Card className={cn(
      'p-5 transition-colors',
      atteint
        ? 'bg-gradient-to-br from-emerald-50 to-amber-50 border-emerald-300'
        : 'bg-gradient-to-br from-stone-50 to-emerald-50 border-emerald-200',
    )}>
      <div className="flex items-start gap-2 mb-3">
        <Trophy className={cn('h-5 w-5 shrink-0', atteint ? 'text-amber-600' : 'text-emerald-600')} />
        <div className="flex-1">
          <h3 className="font-bold flex items-center gap-2 flex-wrap">
            {recompenseTitre ?? 'CA mensuel — restaurant'}
            {atteint && <span className="text-base">🎉</span>}
          </h3>
          <p className="text-xs text-zinc-600 mt-0.5">
            {atteint
              ? 'Point mort dépassé. Le surplus est partagé entre l\'équipe.'
              : 'On vise ensemble le point mort. Au-delà, le surplus est partagé.'
            }
          </p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        {/* Donut 1 — Avancement */}
        <div className="flex flex-col items-center">
          <div className="relative w-full aspect-square max-w-[160px]">
            <ResponsiveContainer>
              <PieChart>
                <Pie
                  data={dataAvancement}
                  innerRadius="68%"
                  outerRadius="92%"
                  startAngle={90}
                  endAngle={-270}
                  dataKey="value"
                  stroke="none"
                >
                  <Cell fill={atteint ? '#10b981' : '#10b981'} />
                  <Cell fill="#e4e4e7" />
                </Pie>
              </PieChart>
            </ResponsiveContainer>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              {atteint ? (
                <>
                  <span className="text-3xl">✅</span>
                  <span className="text-xs font-bold text-emerald-700 mt-1">ATTEINT</span>
                </>
              ) : (
                <>
                  <span className="text-3xl font-bold tabular-nums text-emerald-700">{pctClamp}%</span>
                  <span className="text-[10px] uppercase tracking-wider text-zinc-500">du seuil</span>
                </>
              )}
            </div>
          </div>
          <p className="mt-2 text-xs font-medium flex items-center gap-1">
            <Target className="h-3 w-3" />
            {atteint ? 'Point mort dépassé' : `Reste ${100 - pctClamp}% à faire`}
          </p>
        </div>

        {/* Donut 2 — Surplus partagé / ma part */}
        <div className="flex flex-col items-center">
          <div className="relative w-full aspect-square max-w-[160px]">
            <SurplusDonut surplusTotal={surplusTotal} maPart={maPart} pctRedistribution={pctRedistribution} />
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              {surplusTotal > 0 ? (
                <>
                  <span className="text-2xl font-bold tabular-nums text-amber-700">+{maPart.toFixed(0)} €</span>
                  <span className="text-[10px] uppercase tracking-wider text-zinc-500">ma part</span>
                </>
              ) : (
                <>
                  <span className="text-3xl">💰</span>
                  <span className="text-[10px] uppercase tracking-wider text-zinc-500 mt-1">en attente</span>
                </>
              )}
            </div>
          </div>
          <p className="mt-2 text-xs font-medium flex items-center gap-1">
            <Sparkles className="h-3 w-3" />
            {surplusTotal > 0
              ? `Pool équipe : ${(surplusTotal * pctRedistribution / 100).toFixed(0)} €`
              : 'Surplus = 0 € (atteins d\'abord le point mort)'
            }
          </p>
        </div>
      </div>

      {/* Détails employé */}
      {totalHeures > 0 && (
        <div className="mt-4 pt-3 border-t border-current/10 grid grid-cols-3 gap-2 text-xs text-center">
          <div>
            <p className="text-zinc-500">Tes heures ce mois</p>
            <p className="font-bold tabular-nums">{mesHeures.toFixed(1)} h</p>
          </div>
          <div>
            <p className="text-zinc-500">Heures équipe</p>
            <p className="font-bold tabular-nums">{totalHeures.toFixed(0)} h</p>
          </div>
          <div>
            <p className="text-zinc-500">Ta quote-part</p>
            <p className="font-bold tabular-nums">
              {totalHeures > 0 ? ((mesHeures / totalHeures) * 100).toFixed(1) : '0'} %
            </p>
          </div>
        </div>
      )}

      <p className="mt-3 text-[11px] text-zinc-500 italic text-center">
        🎯 Plus l'équipe vend, plus chacun touche. Pondéré par tes heures travaillées ({pctRedistribution}% du surplus partagé).
      </p>
    </Card>
  )
}

function SurplusDonut({ surplusTotal, maPart, pctRedistribution }: { surplusTotal: number; maPart: number; pctRedistribution: number }) {
  // Si pas de surplus, donut gris
  if (surplusTotal <= 0) {
    return (
      <ResponsiveContainer>
        <PieChart>
          <Pie data={[{ value: 100 }]} innerRadius="68%" outerRadius="92%" dataKey="value" stroke="none">
            <Cell fill="#e4e4e7" />
          </Pie>
        </PieChart>
      </ResponsiveContainer>
    )
  }
  // Pool équipe = surplus × pct. Ma part dans le pool.
  const pool = surplusTotal * pctRedistribution / 100
  const pctMaPart = pool > 0 ? Math.min(100, (maPart / pool) * 100) : 0
  const pctAutres = 100 - pctMaPart
  const data = [
    { name: 'Ma part',    value: pctMaPart },
    { name: 'Reste équipe', value: pctAutres },
  ]
  return (
    <ResponsiveContainer>
      <PieChart>
        <Pie data={data} innerRadius="68%" outerRadius="92%" startAngle={90} endAngle={-270} dataKey="value" stroke="none">
          <Cell fill="#f59e0b" />
          <Cell fill="#fde68a" />
        </Pie>
      </PieChart>
    </ResponsiveContainer>
  )
}
