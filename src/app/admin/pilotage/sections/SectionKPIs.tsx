// Section 3 — KPI du jour alimentés UNIQUEMENT par les agents.
//   - CA du jour       : Veilleur (run quotidien à 02h Paris)
//   - Food cost moyen  : Financier (run horaire)
//   - Masse sal vs CA  : RH (run quotidien à 22h Paris)
//   - Couverts ce soir : Météorologue (run quotidien à 06h Paris)
//
// Server Component : query initiale (dernier run par agent) puis délégation
// à LiveKPICards qui s'abonne Realtime sur agents_runs (sans Framer Motion,
// transitions CSS pures pour éviter les hydration mismatches).

import { createClient } from '@/lib/supabase/server'
import LiveKPICards from './LiveKPICards'
import type { AgentRun } from '@/hooks/useLiveAgentRuns'

export default async function SectionKPIs() {
  const supabase = await createClient()
  const { data: runs } = await supabase
    .from('agents_runs')
    .select('agent_id, status, finished_at, summary, data')
    .in('agent_id', ['veilleur', 'financier', 'rh', 'meteo'])
    .eq('status', 'success')
    .order('finished_at', { ascending: false })
    .limit(50)

  // Garde uniquement le dernier run par agent (premier rencontré, car triés desc)
  const latestByAgent: Record<string, AgentRun> = {}
  for (const r of (runs ?? []) as AgentRun[]) {
    if (!latestByAgent[r.agent_id]) latestByAgent[r.agent_id] = r
  }

  return (
    <section className="rounded-2xl ring-1 ring-zinc-200 bg-white p-4 sm:p-5 shadow-sm">
      <header className="flex items-center justify-between mb-4 gap-3">
        <div className="min-w-0">
          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-emerald-600">Indicateurs · Live</p>
          <h2 className="font-display italic text-xl sm:text-2xl font-medium text-zinc-900 tracking-[-0.02em] leading-none mt-1">KPI du jour</h2>
        </div>
        <span className="text-[10px] text-zinc-400 flex items-center gap-1.5 font-bold uppercase tracking-[0.15em] whitespace-nowrap shrink-0">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
          </span>
          Veilleur · Financier · RH · Météo
        </span>
      </header>

      <LiveKPICards initialLatestByAgent={latestByAgent} />
    </section>
  )
}
