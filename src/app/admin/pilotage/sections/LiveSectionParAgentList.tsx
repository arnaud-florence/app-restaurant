// Client Component : liste live des findings pour UN agent (Stock / RH / HACCP).
// CSS-only.

'use client'

import Link from 'next/link'
import { URGENCE_STYLE } from '@/lib/agents/types'
import { useLiveFindings, type Finding } from '@/hooks/useLiveFindings'
import { cn } from '@/lib/utils'

export default function LiveSectionParAgentList({
  initialFindings, agentId,
}: {
  initialFindings: Finding[]
  agentId: string
}) {
  const { findings, newIds } = useLiveFindings(initialFindings, {
    agentIds: [agentId],
  })

  if (findings.length === 0) return null

  const sorted = [...findings]
    .sort((a, b) => {
      if (a.urgence !== b.urgence) return a.urgence.localeCompare(b.urgence)
      return b.created_at.localeCompare(a.created_at)
    })
    .slice(0, 5)

  return (
    <ul className="space-y-1.5">
      {sorted.map(f => {
        const sty = URGENCE_STYLE[f.urgence]
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
            <span className="text-base shrink-0" aria-hidden>{sty.emoji}</span>
            <div className="min-w-0 flex-1">
              <p className={`text-sm font-bold ${sty.text} flex items-center gap-1.5`}>
                {f.titre}
                {isNew && (
                  <span className="text-[9px] font-bold uppercase tracking-wide bg-emerald-500 text-white px-1.5 py-0.5 rounded">
                    Nouveau
                  </span>
                )}
              </p>
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
  )
}
