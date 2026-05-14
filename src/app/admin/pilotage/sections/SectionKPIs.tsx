// Section 3 — KPI du jour alimentés UNIQUEMENT par les agents.
//   - CA du jour       : Veilleur (run quotidien à 02h Paris)
//   - Food cost moyen  : Financier (run horaire)
//   - Masse sal vs CA  : RH (run quotidien à 22h Paris)
//   - Couverts ce soir : Météorologue (run quotidien à 06h Paris)
//
// Si pas encore de donnée → widget grisé avec message d'attente.

import { createClient } from '@/lib/supabase/server'
import EmptyWidget from '@/components/dashboard/EmptyWidget'
import AgentSource from '@/components/dashboard/AgentSource'
import type { AgentId } from '@/lib/agents/types'

type Run = {
  agent_id: string
  status: string
  finished_at: string | null
  data: Record<string, unknown> | null
}

export default async function SectionKPIs() {
  const supabase = await createClient()
  // Derniers runs par agent — on prend ceux qui nous intéressent
  const { data: runs } = await supabase
    .from('agents_runs')
    .select('agent_id, status, finished_at, data')
    .in('agent_id', ['veilleur', 'financier', 'rh', 'meteo'])
    .eq('status', 'success')
    .order('finished_at', { ascending: false })
    .limit(50)

  // Garde uniquement le dernier run par agent
  const latest = new Map<string, Run>()
  for (const r of (runs ?? []) as Run[]) {
    if (!latest.has(r.agent_id)) latest.set(r.agent_id, r)
  }

  return (
    <section className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm">
      <header className="flex items-center justify-between mb-3">
        <h2 className="text-base font-bold text-zinc-900">📊 KPI du jour</h2>
        <span className="text-xs text-zinc-400">Source : 4 agents</span>
      </header>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <KPICard
          titre="CA du jour"
          agentId="veilleur"
          run={latest.get('veilleur')}
          valeur={(d) => extractCA(d)}
          emptyIcon="💰"
          emptyMsg="Premier service à venir"
          emptyHint="Le Veilleur fera le bilan à 02h"
        />
        <KPICard
          titre="Food cost moyen"
          agentId="financier"
          run={latest.get('financier')}
          valeur={(d) => extractFoodCost(d)}
          emptyIcon="🍽"
          emptyMsg="Pas encore analysé"
          emptyHint="Le Financier analyse chaque heure"
        />
        <KPICard
          titre="Masse sal. vs CA"
          agentId="rh"
          run={latest.get('rh')}
          valeur={(d) => extractMasseSal(d)}
          emptyIcon="👥"
          emptyMsg="Pas encore calculé"
          emptyHint="Le Manager RH calcule chaque soir à 22h"
        />
        <KPICard
          titre="Couverts ce soir"
          agentId="meteo"
          run={latest.get('meteo')}
          valeur={(d) => extractCouverts(d)}
          emptyIcon="🌤️"
          emptyMsg="Pas encore estimé"
          emptyHint="Le Météorologue calcule chaque matin à 06h"
        />
      </div>
    </section>
  )
}

function KPICard({
  titre, agentId, run, valeur, emptyIcon, emptyMsg, emptyHint,
}: {
  titre: string
  agentId: AgentId
  run: Run | undefined
  valeur: (data: Record<string, unknown>) => { value: string; sub?: string } | null
  emptyIcon: string
  emptyMsg: string
  emptyHint: string
}) {
  const extracted = run?.data ? valeur(run.data) : null

  return (
    <div className="rounded-lg border border-zinc-200 bg-zinc-50/50 p-3 min-h-[120px] flex flex-col">
      <h3 className="text-xs font-medium text-zinc-600 uppercase tracking-wide">{titre}</h3>
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

// Extracteurs spécifiques (à adapter quand on connaît mieux le shape de data) ──

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
