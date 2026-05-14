// Bandeau d'alertes agents pour les écrans postes (thème sombre #0D0D0D).
// Pour chaque écran, on filtre les findings par agents pertinents.
//
// Usage :
//   <AlertesAgentsOps agentIds={['commercial', 'strategique']} />
//
// Affichage :
//   - Max 3 alertes (rouges en priorité, puis jaunes, puis vertes)
//   - Compact : 1 ligne par alerte, urgence + agent + titre + action
//   - État vide : message discret "Aucune alerte en cours" (pas trop bruyant)

import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { AGENTS, URGENCE_STYLE, type AgentId } from '@/lib/agents/types'

type Finding = {
  id: string
  agent_id: string
  urgence: 'rouge' | 'jaune' | 'vert'
  titre: string
  message: string | null
  action_label: string | null
  action_url: string | null
  created_at: string
}

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
    .order('urgence', { ascending: true })  // rouge < jaune < vert (alphabétique)
    .order('created_at', { ascending: false })
    .limit(3)

  const findings = (data ?? []) as Finding[]

  if (findings.length === 0) {
    return null  // Pas de bandeau visible quand tout va bien
  }

  return (
    <section className="mx-3 mt-2 rounded-lg border border-zinc-800 bg-zinc-900/80 p-2.5 space-y-1.5">
      <header className="flex items-center justify-between">
        <h2 className="text-xs font-bold text-zinc-300 uppercase tracking-wide">{titre}</h2>
        <span className="text-[10px] text-zinc-500">{findings.length} en cours</span>
      </header>

      <ul className="space-y-1">
        {findings.map(f => {
          const def = AGENTS[f.agent_id as AgentId]
          const sty = URGENCE_STYLE[f.urgence]
          // Versions sombres des couleurs
          const bgDark =
            f.urgence === 'rouge' ? 'bg-red-950/60 border-red-900/60' :
            f.urgence === 'jaune' ? 'bg-amber-950/60 border-amber-900/60' :
            'bg-emerald-950/60 border-emerald-900/60'
          const textDark =
            f.urgence === 'rouge' ? 'text-red-200' :
            f.urgence === 'jaune' ? 'text-amber-200' :
            'text-emerald-200'

          return (
            <li key={f.id} className={`flex items-center gap-2 p-2 rounded-md border ${bgDark}`}>
              <span className="text-sm shrink-0" aria-hidden>{sty.emoji}</span>
              <span className="text-sm shrink-0" aria-hidden>{def?.emoji ?? '🤖'}</span>
              <p className={`text-xs font-medium ${textDark} truncate flex-1`}>{f.titre}</p>
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
