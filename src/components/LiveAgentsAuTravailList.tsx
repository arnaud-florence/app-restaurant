// Client Component : 15 lignes d'agents qui passent rouge/jaune/vert en live
// selon les findings actifs + dernier run reçu.
//
// VERSION SANS FRAMER MOTION pour éviter les hydration mismatches.
// Animations via transitions CSS Tailwind uniquement.

'use client'

import Link from 'next/link'
import { AGENTS, AGENT_IDS, URGENCE_STYLE, type AgentId, type Urgence } from '@/lib/agents/types'
import { useLiveAgentRuns, type AgentRun } from '@/hooks/useLiveAgentRuns'
import { useLiveFindings, type Finding } from '@/hooks/useLiveFindings'
import { cn } from '@/lib/utils'

export default function LiveAgentsAuTravailList({
  initialLatestByAgent, initialFindings,
}: {
  initialLatestByAgent: Record<string, AgentRun>
  initialFindings: Finding[]
}) {
  const { latestByAgent, recentlyUpdated } = useLiveAgentRuns(initialLatestByAgent)
  const { findings } = useLiveFindings(initialFindings)

  // Findings groupés par agent
  const findingsByAgent = new Map<AgentId, Finding[]>()
  for (const f of findings) {
    const k = f.agent_id as AgentId
    if (!findingsByAgent.has(k)) findingsByAgent.set(k, [])
    findingsByAgent.get(k)!.push(f)
  }

  const totalRouge = findings.filter(f => f.urgence === 'rouge').length
  const totalJaune = findings.filter(f => f.urgence === 'jaune').length

  return (
    <>
      <header className="flex items-center justify-between mb-3 gap-2 flex-wrap">
        <div>
          <h2 className="text-base font-bold text-zinc-900 flex items-center gap-1.5">
            🤖 Mes agents au travail
            <span className="relative inline-flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
            </span>
          </h2>
          <p className="text-xs text-zinc-500">15 agents qui surveillent et suggèrent en continu — mise à jour live</p>
        </div>
        <div className="flex items-center gap-2 text-xs">
          {totalRouge > 0 && (
            <span className="inline-flex items-center gap-1 px-2 py-1 rounded bg-red-100 text-red-900 font-bold tabular-nums">
              🔴 {totalRouge} urgent{totalRouge > 1 ? 's' : ''}
            </span>
          )}
          {totalJaune > 0 && (
            <span className="inline-flex items-center gap-1 px-2 py-1 rounded bg-amber-100 text-amber-900 font-bold tabular-nums">
              🟡 {totalJaune} à surveiller
            </span>
          )}
          {totalRouge === 0 && totalJaune === 0 && (
            <span className="inline-flex items-center gap-1 px-2 py-1 rounded bg-emerald-100 text-emerald-900 font-bold">
              🟢 Tout est calme
            </span>
          )}
        </div>
      </header>

      <ul className="divide-y divide-zinc-100">
        {AGENT_IDS.map(id => {
          const def = AGENTS[id]
          const run = latestByAgent[id]
          const myFindings = findingsByAgent.get(id) ?? []
          const urgence: Urgence = myFindings.find(f => f.urgence === 'rouge')
            ? 'rouge'
            : myFindings.find(f => f.urgence === 'jaune')
              ? 'jaune'
              : 'vert'
          const sty = URGENCE_STYLE[urgence]
          const isUpdated = recentlyUpdated.has(id)

          return (
            <li
              key={id}
              className={cn(
                'py-2.5 px-2 flex items-center justify-between gap-3 rounded-md transition-colors duration-500',
                isUpdated && 'bg-emerald-50',
              )}
            >
              <div className="flex items-center gap-3 min-w-0 flex-1">
                <span className="text-lg transition-transform duration-200" aria-hidden>{sty.emoji}</span>
                <span className="text-xl" aria-hidden>{def.emoji}</span>
                <div className="min-w-0">
                  <p className="text-sm font-bold text-zinc-900 truncate flex items-center gap-1.5">
                    {def.nom}
                    <span className="text-[10px] font-normal text-zinc-400">· {def.scheduleHuman}</span>
                    {isUpdated && (
                      <span className="text-[9px] font-bold uppercase tracking-wide bg-emerald-500 text-white px-1.5 py-0.5 rounded">
                        MAJ
                      </span>
                    )}
                  </p>
                  <p className="text-xs text-zinc-600 truncate transition-opacity duration-300">
                    {run?.summary ?? <span className="italic text-zinc-400">Jamais exécuté</span>}
                  </p>
                </div>
              </div>

              {myFindings.length > 0 ? (
                <Link
                  href={`/admin/pilotage/agents/${id}`}
                  className={cn(
                    'shrink-0 px-2.5 py-1 rounded-md text-xs font-bold border whitespace-nowrap',
                    sty.bg, sty.text, sty.border,
                    'hover:opacity-80 transition-opacity',
                  )}
                >
                  {myFindings.length} {myFindings.length > 1 ? 'alertes' : 'alerte'} →
                </Link>
              ) : run?.status === 'success' ? (
                <span className="shrink-0 text-[10px] text-zinc-400">
                  {timeAgo(run.finished_at as string | null)}
                </span>
              ) : run?.status === 'error' ? (
                <span className="shrink-0 text-[10px] font-bold text-red-600">⚠ erreur</span>
              ) : null}
            </li>
          )
        })}
      </ul>

      {findings.length === 0 && (
        <p className="mt-3 text-center text-xs text-zinc-500 italic">
          Aucune alerte active. Les agents tournent en arrière-plan selon leur planning.
        </p>
      )}
    </>
  )
}

function timeAgo(iso: string | null): string {
  if (!iso) return ''
  const diffMs = Date.now() - new Date(iso).getTime()
  const minutes = Math.floor(diffMs / 60_000)
  if (minutes < 1) return 'à l\'instant'
  if (minutes < 60) return `il y a ${minutes} min`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `il y a ${hours} h`
  const days = Math.floor(hours / 24)
  return `il y a ${days} j`
}
