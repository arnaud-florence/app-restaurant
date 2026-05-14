// Client Component : suggestions du jour avec souscription Realtime.
// Filtre les findings par agents Stratégique + Météo. CSS-only.

'use client'

import Link from 'next/link'
import { AGENTS, type AgentId } from '@/lib/agents/types'
import { useLiveFindings, type Finding } from '@/hooks/useLiveFindings'
import { cn } from '@/lib/utils'

export default function LiveSuggestionsList({ initialFindings }: { initialFindings: Finding[] }) {
  const { findings, newIds } = useLiveFindings(initialFindings, {
    agentIds: ['strategique', 'meteo'],
  })

  const sorted = [...findings]
    .sort((a, b) => {
      if (a.urgence !== b.urgence) return a.urgence.localeCompare(b.urgence)
      return b.created_at.localeCompare(a.created_at)
    })
    .slice(0, 5)

  if (sorted.length === 0) return null

  return (
    <ul className="space-y-2">
      {sorted.map((s, idx) => {
        const def = AGENTS[s.agent_id as AgentId]
        const isNew = newIds.has(s.id)
        return (
          <li
            key={s.id}
            className={cn(
              'flex items-start gap-3 p-2.5 rounded-md transition-all duration-300 hover:bg-zinc-50',
              isNew && 'ring-2 ring-emerald-400 ring-offset-1',
            )}
          >
            <span className="shrink-0 inline-flex items-center justify-center w-6 h-6 rounded-full bg-emerald-100 text-emerald-900 text-xs font-bold">
              {idx + 1}
            </span>
            <span className="text-lg shrink-0" aria-hidden>{def?.emoji ?? '🤖'}</span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-bold text-zinc-900 flex items-center gap-1.5">
                {s.titre}
                {isNew && (
                  <span className="text-[9px] font-bold uppercase tracking-wide bg-emerald-500 text-white px-1.5 py-0.5 rounded">
                    Nouveau
                  </span>
                )}
              </p>
              {s.message && <p className="text-xs text-zinc-600 line-clamp-2">{s.message}</p>}
            </div>
            {s.action_url && s.action_label && (
              <Link href={s.action_url} className="shrink-0 text-xs font-medium text-emerald-700 hover:text-emerald-800 whitespace-nowrap">
                {s.action_label} →
              </Link>
            )}
          </li>
        )
      })}
    </ul>
  )
}
