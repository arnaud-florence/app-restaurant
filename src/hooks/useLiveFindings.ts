// Hook réutilisable : reçoit des findings initiaux (rendus côté serveur)
// puis écoute les INSERT/UPDATE/DELETE en temps réel sur agent_findings.
//
// Filtres en option :
//   - agentIds : ne garde que les findings dont agent_id ∈ liste
//   - urgences : ne garde que les findings dont urgence ∈ liste
//
// Retourne :
//   - findings : liste live triée par created_at desc, filtrée
//   - newIds : Set des IDs récemment ajoutés (utiliser pour le highlight UI)
//
// Pattern : usage uniquement dans Client Components ('use client').

'use client'

import { useEffect, useState, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'

export type Finding = {
  id: string
  agent_id: string
  urgence: 'rouge' | 'jaune' | 'vert'
  titre: string
  message: string | null
  action_label: string | null
  action_url: string | null
  created_at: string
}

export function useLiveFindings(
  initialFindings: Finding[],
  options: {
    agentIds?: string[]
    urgences?: ('rouge' | 'jaune' | 'vert')[]
    /** Durée du highlight "Nouveau" en ms. Défaut 4000. */
    highlightDurationMs?: number
  } = {},
) {
  const [findings, setFindings] = useState<Finding[]>(initialFindings)
  const [newIds, setNewIds] = useState<Set<string>>(new Set())
  const highlightMs = options.highlightDurationMs ?? 4000

  // Stabiliser les filtres pour le useEffect
  const agentIdsKey = options.agentIds?.sort().join(',') ?? ''
  const urgencesKey = options.urgences?.sort().join(',') ?? ''

  useEffect(() => {
    const sb = createClient()
    const channel = sb
      .channel(`agent_findings_live_${agentIdsKey}_${urgencesKey}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'agent_findings' },
        (payload) => {
          const f = payload.new as Finding & { resolu: boolean }
          if (f.resolu) return

          // Application des filtres côté client
          if (options.agentIds && !options.agentIds.includes(f.agent_id)) return
          if (options.urgences && !options.urgences.includes(f.urgence)) return

          setFindings(prev => {
            if (prev.some(x => x.id === f.id)) return prev
            return [f, ...prev]
          })
          setNewIds(prev => new Set(prev).add(f.id))
          setTimeout(() => {
            setNewIds(prev => {
              const n = new Set(prev)
              n.delete(f.id)
              return n
            })
          }, highlightMs)
        },
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'agent_findings' },
        (payload) => {
          const f = payload.new as Finding & { resolu: boolean }
          if (f.resolu) {
            setFindings(prev => prev.filter(x => x.id !== f.id))
          }
        },
      )
      .on(
        'postgres_changes',
        { event: 'DELETE', schema: 'public', table: 'agent_findings' },
        (payload) => {
          const id = (payload.old as { id: string }).id
          setFindings(prev => prev.filter(x => x.id !== id))
        },
      )
      .subscribe()

    return () => {
      sb.removeChannel(channel)
    }
  }, [agentIdsKey, urgencesKey, highlightMs, options.agentIds, options.urgences])

  return { findings, newIds }
}
