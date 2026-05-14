// Section générique alimentée par les findings d'UN agent spécifique.
// Utilisé pour les sections 5 (Stock), 6 (RH), 7 (HACCP).

import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { AGENTS, URGENCE_STYLE, type AgentId } from '@/lib/agents/types'
import EmptyWidget from '@/components/dashboard/EmptyWidget'
import AgentSource from '@/components/dashboard/AgentSource'

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
      .select('id, urgence, titre, message, action_label, action_url, created_at')
      .eq('agent_id', agentId)
      .eq('resolu', false)
      .order('urgence', { ascending: true })  // rouge < jaune < vert
      .order('created_at', { ascending: false })
      .limit(5),
    supabase
      .from('agents_runs')
      .select('status, finished_at, summary')
      .eq('agent_id', agentId)
      .eq('status', 'success')
      .order('finished_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
  ])

  const findings = findingsRes.data ?? []
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

      {findings.length === 0 ? (
        <EmptyWidget
          icon={def?.emoji ?? '🤖'}
          message={emptyMsg}
          hint={emptyHint}
        />
      ) : (
        <ul className="space-y-1.5">
          {findings.map(f => {
            const sty = URGENCE_STYLE[f.urgence as 'rouge' | 'jaune' | 'vert']
            return (
              <li key={f.id} className={`flex items-start gap-3 p-2.5 rounded-md border ${sty.bg} ${sty.border}`}>
                <span className="text-base shrink-0" aria-hidden>{sty.emoji}</span>
                <div className="min-w-0 flex-1">
                  <p className={`text-sm font-bold ${sty.text}`}>{f.titre}</p>
                  {f.message && <p className="text-xs text-zinc-700 line-clamp-1">{f.message}</p>}
                </div>
                {f.action_url && f.action_label && (
                  <Link href={f.action_url} className="shrink-0 text-xs font-medium text-zinc-700 hover:underline whitespace-nowrap">
                    {f.action_label} →
                  </Link>
                )}
              </li>
            )
          })}
        </ul>
      )}

      <AgentSource
        agentId={agentId}
        lastRunAt={run?.finished_at ?? null}
        status={(run?.status as 'success' | 'error' | null) ?? null}
      />
    </section>
  )
}
