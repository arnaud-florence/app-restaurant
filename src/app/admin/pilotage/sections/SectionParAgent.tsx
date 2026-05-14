// Section générique alimentée par les findings d'UN agent spécifique.
// Utilisé pour les sections 5 (Stock), 6 (RH), 7 (HACCP).
//
// Server Component : query initiale + délégation à LiveSectionParAgentList.

import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { AGENTS, type AgentId } from '@/lib/agents/types'
import EmptyWidget from '@/components/dashboard/EmptyWidget'
import AgentSource from '@/components/dashboard/AgentSource'
import LiveSectionParAgentList from './LiveSectionParAgentList'
import type { Finding } from '@/hooks/useLiveFindings'

export default async function SectionParAgent({
  agentId, titre, emoji, emptyMsg, emptyHint, drilldownHref,
}: {
  agentId: AgentId
  titre: string
  emoji: string
  emptyMsg: string
  emptyHint: string
  drilldownHref?: string
}) {
  const supabase = await createClient()
  const def = AGENTS[agentId]

  const [findingsRes, runRes] = await Promise.all([
    supabase
      .from('agent_findings')
      .select('id, agent_id, urgence, titre, message, action_label, action_url, created_at')
      .eq('agent_id', agentId)
      .eq('resolu', false)
      .order('urgence', { ascending: true })
      .order('created_at', { ascending: false })
      .limit(20),
    supabase
      .from('agents_runs')
      .select('status, finished_at, summary')
      .eq('agent_id', agentId)
      .eq('status', 'success')
      .order('finished_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
  ])

  const initial = (findingsRes.data ?? []) as Finding[]
  const run = runRes.data

  return (
    <section className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm">
      <header className="flex items-center justify-between mb-3 gap-2">
        <h2 className="text-base font-bold text-zinc-900">
          {emoji} {titre}
        </h2>
        {drilldownHref && (
          <Link href={drilldownHref} className="text-xs font-medium text-emerald-700 hover:text-emerald-800 whitespace-nowrap">
            Vue détaillée →
          </Link>
        )}
      </header>

      {initial.length === 0 ? (
        <EmptyWidget
          icon={def?.emoji ?? '🤖'}
          message={emptyMsg}
          hint={emptyHint}
        />
      ) : (
        <LiveSectionParAgentList initialFindings={initial} agentId={agentId} />
      )}

      <AgentSource
        agentId={agentId}
        lastRunAt={run?.finished_at ?? null}
        status={(run?.status as 'success' | 'error' | null) ?? null}
      />
    </section>
  )
}
