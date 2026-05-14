// Bandeau d'alertes agents pour les écrans postes (thème sombre #0D0D0D).
// Server Component : query initiale puis délégation à LiveAlertesAgentsOps.

import { createClient } from '@/lib/supabase/server'
import LiveAlertesAgentsOps from './LiveAlertesAgentsOps'
import type { AgentId } from '@/lib/agents/types'
import type { Finding } from '@/hooks/useLiveFindings'

export default async function AlertesAgentsOps({
  agentIds, titre = '🤖 Alertes des agents',
}: {
  agentIds: AgentId[]
  titre?: string
}) {
  const supabase = await createClient()
  const { data } = await supabase
    .from('agent_findings')
    .select('id, agent_id, urgence, titre, message, action_label, action_url, created_at')
    .eq('resolu', false)
    .in('agent_id', agentIds)
    .order('urgence', { ascending: true })
    .order('created_at', { ascending: false })
    .limit(20)

  const initial = (data ?? []) as Finding[]

  return (
    <LiveAlertesAgentsOps
      initialFindings={initial}
      agentIds={agentIds as string[]}
      titre={titre}
    />
  )
}
