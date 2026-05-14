// "Mes agents au travail" — bloc en haut du dashboard /admin/pilotage.
// Server Component : query initiale puis délégation à LiveAgentsAuTravailList
// pour la mise à jour live des runs et findings via Supabase Realtime
// (sans Framer Motion, transitions CSS pures pour éviter les hydration mismatches).

import { getLatestRunPerAgent, getFindingsActifs } from '@/lib/agents/runner'
import LiveAgentsAuTravailList from './LiveAgentsAuTravailList'
import type { AgentRun } from '@/hooks/useLiveAgentRuns'
import type { Finding } from '@/hooks/useLiveFindings'

export default async function AgentsAuTravail() {
  const [runs, findings] = await Promise.all([
    getLatestRunPerAgent(),
    getFindingsActifs(),
  ])

  // Index runs par agent_id
  const initialLatestByAgent: Record<string, AgentRun> = {}
  for (const r of runs) {
    initialLatestByAgent[r.agent_id] = r as unknown as AgentRun
  }

  return (
    <section className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm">
      <LiveAgentsAuTravailList
        initialLatestByAgent={initialLatestByAgent}
        initialFindings={findings as unknown as Finding[]}
      />
    </section>
  )
}
