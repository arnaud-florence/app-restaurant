// Petit texte gris en bas d'un widget : "Mis à jour par Agent X il y a Y min".
// Source visible pour que le gérant sache d'où vient chaque chiffre.

import { AGENTS, type AgentId } from '@/lib/agents/types'

export default function AgentSource({
  agentId, lastRunAt, status,
}: {
  agentId: AgentId
  lastRunAt: string | null
  status?: 'success' | 'error' | 'running' | null
}) {
  const def = AGENTS[agentId]
  if (!def) return null

  const label = lastRunAt
    ? `Mis à jour par ${def.emoji} ${def.nom} ${timeAgo(lastRunAt)}`
    : `${def.emoji} ${def.nom} — ${def.scheduleHuman}`

  return (
    <p className="mt-2 text-[10px] text-zinc-400 font-normal">
      {label}
      {status === 'error' && <span className="text-red-600 font-medium ml-1">⚠ dernière exécution en erreur</span>}
    </p>
  )
}

function timeAgo(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime()
  const minutes = Math.floor(diffMs / 60_000)
  if (minutes < 1) return 'à l\'instant'
  if (minutes < 60) return `il y a ${minutes} min`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `il y a ${hours} h`
  const days = Math.floor(hours / 24)
  return `il y a ${days} j`
}
