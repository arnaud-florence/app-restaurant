// Hook réutilisable : souscription Realtime aux runs des agents.
//
// Reçoit `initialLatestByAgent` (dernier run par agent_id, rendu serveur)
// puis écoute les INSERT/UPDATE sur `agents_runs`. Pour chaque event qui
// concerne un des agents filtrés et qui est plus récent que ce qu'on a,
// remplace le run et flagge l'agent comme "récemment mis à jour" pour
// le highlight UI.
//
// Migration 0088 active la publication realtime sur agents_runs.

'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

export type AgentRun = {
  agent_id: string
  status: string
  finished_at: string | null
  summary: string | null
  data: Record<string, unknown> | null
}

export function useLiveAgentRuns(
  initialLatestByAgent: Record<string, AgentRun>,
  options: {
    agentIds?: string[]
    /** Durée du highlight en ms. Défaut 3000. */
    highlightDurationMs?: number
  } = {},
) {
  const [latestByAgent, setLatestByAgent] = useState<Record<string, AgentRun>>(initialLatestByAgent)
  const [recentlyUpdated, setRecentlyUpdated] = useState<Set<string>>(new Set())
  const highlightMs = options.highlightDurationMs ?? 3000

  const agentIdsKey = options.agentIds?.sort().join(',') ?? ''

  useEffect(() => {
    const sb = createClient()
    const channel = sb
      .channel(`agents_runs_live_${agentIdsKey}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'agents_runs' },
        (payload) => handleRun(payload.new as AgentRun),
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'agents_runs' },
        (payload) => handleRun(payload.new as AgentRun),
      )
      .subscribe()

    function handleRun(r: AgentRun) {
      if (options.agentIds && !options.agentIds.includes(r.agent_id)) return
      if (r.status !== 'success') return  // on ignore les runs en cours / en erreur ici

      setLatestByAgent(prev => {
        const current = prev[r.agent_id]
        if (!current || (r.finished_at && (!current.finished_at || r.finished_at > current.finished_at))) {
          return { ...prev, [r.agent_id]: r }
        }
        return prev
      })

      setRecentlyUpdated(prev => new Set(prev).add(r.agent_id))
      setTimeout(() => {
        setRecentlyUpdated(prev => {
          const n = new Set(prev)
          n.delete(r.agent_id)
          return n
        })
      }, highlightMs)
    }

    return () => {
      sb.removeChannel(channel)
    }
  }, [agentIdsKey, highlightMs, options.agentIds])

  return { latestByAgent, recentlyUpdated }
}
