// Client Component : bandeau d'alertes pour les écrans postes (thème sombre)
// avec souscription Realtime. CSS-only.
// Disparaît totalement si findings.length === 0 (return null).

'use client'

import Link from 'next/link'
import { AGENTS, URGENCE_STYLE, type AgentId } from '@/lib/agents/types'
import { useLiveFindings, type Finding } from '@/hooks/useLiveFindings'
import { cn } from '@/lib/utils'

export default function LiveAlertesAgentsOps({
  initialFindings, agentIds, titre = '🤖 Alertes des agents',
}: {
  initialFindings: Finding[]
  agentIds: string[]
  titre?: string
}) {
  const { findings, newIds } = useLiveFindings(initialFindings, { agentIds })

  const sorted = [...findings]
    .sort((a, b) => {
      if (a.urgence !== b.urgence) return a.urgence.localeCompare(b.urgence)
      return b.created_at.localeCompare(a.created_at)
    })
    .slice(0, 3)

  if (sorted.length === 0) return null

  return (
    <section className="mx-3 mt-2 rounded-lg border border-zinc-800 bg-zinc-900/80 p-2.5 space-y-1.5">
      <header className="flex items-center justify-between">
        <h2 className="text-xs font-bold text-zinc-300 uppercase tracking-wide flex items-center gap-1.5">
          {titre}
          <span className="relative inline-flex h-1.5 w-1.5">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-500"></span>
          </span>
        </h2>
        <span className="text-[10px] text-zinc-500">{sorted.length} en cours</span>
      </header>

      <ul className="space-y-1">
        {sorted.map(f => {
          const def = AGENTS[f.agent_id as AgentId]
          const sty = URGENCE_STYLE[f.urgence]
          const isNew = newIds.has(f.id)
          const bgDark =
            f.urgence === 'rouge' ? 'bg-red-950/60 border-red-900/60' :
            f.urgence === 'jaune' ? 'bg-amber-950/60 border-amber-900/60' :
            'bg-emerald-950/60 border-emerald-900/60'
          const textDark =
            f.urgence === 'rouge' ? 'text-red-200' :
            f.urgence === 'jaune' ? 'text-amber-200' :
            'text-emerald-200'

          return (
            <li
              key={f.id}
              className={cn(
                'flex items-center gap-2 p-2 rounded-md border transition-all duration-300',
                bgDark,
                isNew && 'ring-2 ring-emerald-400',
              )}
            >
              <span className="text-sm shrink-0" aria-hidden>{sty.emoji}</span>
              <span className="text-sm shrink-0" aria-hidden>{def?.emoji ?? '🤖'}</span>
              <p className={`text-xs font-medium ${textDark} truncate flex-1 flex items-center gap-1.5`}>
                {f.titre}
                {isNew && (
                  <span className="text-[8px] font-bold uppercase tracking-wide bg-emerald-500 text-white px-1 py-0.5 rounded">
                    Nouveau
                  </span>
                )}
              </p>
              {f.action_url && f.action_label && (
                <Link
                  href={f.action_url}
                  className="shrink-0 text-[10px] font-bold text-zinc-300 hover:text-white underline-offset-2 hover:underline whitespace-nowrap"
                >
                  {f.action_label}
                </Link>
              )}
            </li>
          )
        })}
      </ul>
    </section>
  )
}
