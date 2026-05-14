// Client Component : alertes prioritaires avec souscription Realtime.
// Délègue la logique live au hook useLiveFindings.
//
// Animations en CSS pur (pas de Framer Motion) :
//   - Nouveau finding entrant : ring emerald + badge "Nouveau" pendant 4 sec
//     via classes Tailwind conditionnelles
//   - Apparition CSS via tailwindcss-animate "animate-in fade-in slide-in-from-top-2"

'use client'

import Link from 'next/link'
import { AGENTS, URGENCE_STYLE, type AgentId } from '@/lib/agents/types'
import { useLiveFindings, type Finding } from '@/hooks/useLiveFindings'
import { cn } from '@/lib/utils'

export type { Finding }

export default function LiveAlertesList({ initialFindings }: { initialFindings: Finding[] }) {
  const { findings, newIds } = useLiveFindings(initialFindings)

  if (findings.length === 0) return null

  const rouges = findings.filter(f => f.urgence === 'rouge')
  const jaunes = findings.filter(f => f.urgence === 'jaune')
  const verts = findings.filter(f => f.urgence === 'vert')

  return (
    <div className="space-y-3">
      {rouges.length > 0 && <Bloc titre="Urgent" urgence="rouge" findings={rouges} newIds={newIds} />}
      {jaunes.length > 0 && <Bloc titre="À surveiller" urgence="jaune" findings={jaunes} newIds={newIds} />}
      {verts.length > 0 && <Bloc titre="Info" urgence="vert" findings={verts} newIds={newIds} />}
    </div>
  )
}

function Bloc({
  titre, urgence, findings, newIds,
}: {
  titre: string
  urgence: 'rouge' | 'jaune' | 'vert'
  findings: Finding[]
  newIds: Set<string>
}) {
  const sty = URGENCE_STYLE[urgence]
  return (
    <div>
      <h3 className="text-xs font-bold text-zinc-600 uppercase tracking-wide mb-1.5">
        {sty.emoji} {titre} ({findings.length})
      </h3>
      <ul className="space-y-1.5">
        {findings.slice(0, 6).map(f => {
          const def = AGENTS[f.agent_id as AgentId]
          const isNew = newIds.has(f.id)
          return (
            <li
              key={f.id}
              className={cn(
                'flex items-start gap-3 p-2.5 rounded-md border transition-all duration-300',
                sty.bg, sty.border,
                isNew && 'ring-2 ring-emerald-400 ring-offset-1',
              )}
            >
              <span className="text-lg shrink-0" aria-hidden>{def?.emoji ?? '🤖'}</span>
              <div className="min-w-0 flex-1">
                <p className={`text-sm font-bold ${sty.text} truncate flex items-center gap-1.5`}>
                  {f.titre}
                  {isNew && (
                    <span className="text-[9px] font-bold uppercase tracking-wide bg-emerald-500 text-white px-1.5 py-0.5 rounded">
                      Nouveau
                    </span>
                  )}
                </p>
                {f.message && <p className="text-xs text-zinc-700 line-clamp-2">{f.message}</p>}
              </div>
              {f.action_url && f.action_label && (
                <Link
                  href={f.action_url}
                  className="shrink-0 text-xs font-medium text-zinc-700 hover:underline whitespace-nowrap"
                >
                  {f.action_label} →
                </Link>
              )}
            </li>
          )
        })}
      </ul>
    </div>
  )
}
