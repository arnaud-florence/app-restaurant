// Client Component : 4 KPI cards qui se mettent à jour en live quand un agent
// Veilleur / Financier / RH / Météo termine un nouveau run.
//
// VERSION SANS FRAMER MOTION pour éviter les hydration mismatches.
// Animations via transitions CSS Tailwind uniquement (transition-all, opacity).
// Highlight des MAJ via className conditionnelle (ring-2 emerald) qui s'éteint
// en 3 sec via setTimeout côté client.

'use client'

import { useLiveAgentRuns, type AgentRun } from '@/hooks/useLiveAgentRuns'
import AgentSource from '@/components/dashboard/AgentSource'
import type { AgentId } from '@/lib/agents/types'
import { cn } from '@/lib/utils'

const WATCHED_AGENTS = ['veilleur', 'financier', 'rh', 'meteo']

export default function LiveKPICards({
  initialLatestByAgent,
}: {
  initialLatestByAgent: Record<string, AgentRun>
}) {
  const { latestByAgent, recentlyUpdated } = useLiveAgentRuns(initialLatestByAgent, {
    agentIds: WATCHED_AGENTS,
  })

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
      <KPICard
        titre="CA du jour"
        agentId="veilleur"
        run={latestByAgent['veilleur']}
        isNew={recentlyUpdated.has('veilleur')}
        valeur={extractCA}
        emptyIcon="💰"
        emptyMsg="Premier service à venir"
        emptyHint="Le Veilleur fera le bilan à 02h"
      />
      <KPICard
        titre="Food cost moyen"
        agentId="financier"
        run={latestByAgent['financier']}
        isNew={recentlyUpdated.has('financier')}
        valeur={extractFoodCost}
        emptyIcon="🍽"
        emptyMsg="Pas encore analysé"
        emptyHint="Le Financier analyse chaque heure"
      />
      <KPICard
        titre="Masse sal. vs CA"
        agentId="rh"
        run={latestByAgent['rh']}
        isNew={recentlyUpdated.has('rh')}
        valeur={extractMasseSal}
        emptyIcon="👥"
        emptyMsg="Pas encore calculé"
        emptyHint="Le Manager RH calcule chaque soir à 22h"
      />
      <KPICard
        titre="Couverts ce soir"
        agentId="meteo"
        run={latestByAgent['meteo']}
        isNew={recentlyUpdated.has('meteo')}
        valeur={extractCouverts}
        emptyIcon="🌤️"
        emptyMsg="Pas encore estimé"
        emptyHint="Le Météorologue calcule chaque matin à 06h"
      />
    </div>
  )
}

function KPICard({
  titre, agentId, run, isNew, valeur, emptyIcon, emptyMsg, emptyHint,
}: {
  titre: string
  agentId: AgentId
  run: AgentRun | undefined
  isNew: boolean
  valeur: (data: Record<string, unknown>) => { value: string; sub?: string } | null
  emptyIcon: string
  emptyMsg: string
  emptyHint: string
}) {
  const extracted = run?.data ? valeur(run.data) : null

  return (
    <div
      className={cn(
        'rounded-lg border border-zinc-200 bg-zinc-50/50 p-3 min-h-[120px] flex flex-col transition-all duration-300',
        isNew && 'ring-2 ring-emerald-400 ring-offset-1',
      )}
    >
      <h3 className="text-xs font-medium text-zinc-600 uppercase tracking-wide flex items-center justify-between gap-1">
        {titre}
        {isNew && (
          <span className="text-[9px] font-bold uppercase tracking-wide bg-emerald-500 text-white px-1.5 py-0.5 rounded">
            MAJ
          </span>
        )}
      </h3>
      <div className="flex-1 flex items-center justify-center my-1">
        {extracted ? (
          <div className="text-center">
            <p className="text-2xl font-bold text-zinc-900 tabular-nums">{extracted.value}</p>
            {extracted.sub && <p className="text-[10px] text-zinc-500 mt-0.5">{extracted.sub}</p>}
          </div>
        ) : (
          <div className="text-center px-1 py-2 text-zinc-400">
            <div className="text-xl mb-0.5 opacity-50">{emptyIcon}</div>
            <p className="text-xs font-medium">{emptyMsg}</p>
            <p className="text-[10px] mt-0.5">{emptyHint}</p>
          </div>
        )}
      </div>
      <AgentSource agentId={agentId} lastRunAt={run?.finished_at ?? null} status={(run?.status as 'success' | 'error' | null) ?? null} />
    </div>
  )
}

// ── Extracteurs (depuis agents_runs.data jsonb selon shape de chaque agent) ──

function extractCA(d: Record<string, unknown>): { value: string; sub?: string } | null {
  const ca = (d as { ca?: number; ca_jour?: number; total_ttc?: number }).ca
    ?? (d as { ca_jour?: number }).ca_jour
    ?? (d as { total_ttc?: number }).total_ttc
  if (typeof ca !== 'number') return null
  return { value: `${Math.round(ca).toLocaleString('fr-FR')} €` }
}

function extractFoodCost(d: Record<string, unknown>): { value: string; sub?: string } | null {
  const fc = (d as { foodCost?: { moyenne?: number; nbAlerte?: number; nbAnalyses?: number } }).foodCost
  if (!fc || typeof fc.moyenne !== 'number' || fc.nbAnalyses === 0) return null
  return {
    value: `${fc.moyenne.toFixed(1)} %`,
    sub: fc.nbAlerte ? `${fc.nbAlerte} plat(s) > 30%` : 'tous plats OK',
  }
}

function extractMasseSal(d: Record<string, unknown>): { value: string; sub?: string } | null {
  const ms = (d as { masseSal?: { ratio?: number; ca?: number } }).masseSal
  if (!ms || typeof ms.ratio !== 'number' || ms.ratio === 0) return null
  return {
    value: `${ms.ratio.toFixed(1)} %`,
    sub: ms.ratio > 35 ? '⚠ au-dessus du seuil 35%' : 'sous le seuil 35%',
  }
}

function extractCouverts(d: Record<string, unknown>): { value: string; sub?: string } | null {
  const prev = (d as { previsionCouverts?: number; couverts?: number }).previsionCouverts
    ?? (d as { couverts?: number }).couverts
  if (typeof prev !== 'number') return null
  return { value: String(prev), sub: 'couverts prévus' }
}
