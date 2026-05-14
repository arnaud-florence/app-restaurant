// Section 2 — Alertes prioritaires alimentées uniquement par les agents.
// Groupe les findings actifs par urgence (rouge / jaune / vert) et propose
// une action en 1 clic pour chacun.

import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { AGENTS, URGENCE_STYLE, type AgentId } from '@/lib/agents/types'
import EmptyWidget from '@/components/dashboard/EmptyWidget'

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

export default async function SectionAlertes() {
  const supabase = await createClient()
  const { data } = await supabase
    .from('agent_findings')
    .select('id, agent_id, urgence, titre, message, action_label, action_url, created_at')
    .eq('resolu', false)
    .order('created_at', { ascending: false })
    .limit(30)

  const findings = (data ?? []) as Finding[]
  const rouges = findings.filter(f => f.urgence === 'rouge')
  const jaunes = findings.filter(f => f.urgence === 'jaune')
  const verts = findings.filter(f => f.urgence === 'vert')

  return (
    <section className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm">
      <header className="flex items-center justify-between mb-3">
        <h2 className="text-base font-bold text-zinc-900">🔔 Alertes prioritaires</h2>
        <span className="text-xs text-zinc-400">Source : tous les agents</span>
      </header>

      {findings.length === 0 ? (
        <EmptyWidget
          icon="✓"
          message="Tout va bien — aucune alerte en cours"
          hint="Les agents surveillent en continu et préviendront ici dès qu'une action est nécessaire."
        />
      ) : (
        <div className="space-y-3">
          {rouges.length > 0 && <Bloc titre="Urgent" urgence="rouge" findings={rouges} />}
          {jaunes.length > 0 && <Bloc titre="À surveiller" urgence="jaune" findings={jaunes} />}
          {verts.length > 0 && <Bloc titre="Info" urgence="vert" findings={verts} />}
        </div>
      )}
    </section>
  )
}

function Bloc({ titre, urgence, findings }: { titre: string; urgence: 'rouge' | 'jaune' | 'vert'; findings: Finding[] }) {
  const sty = URGENCE_STYLE[urgence]
  return (
    <div>
      <h3 className="text-xs font-bold text-zinc-600 uppercase tracking-wide mb-1.5">
        {sty.emoji} {titre} ({findings.length})
      </h3>
      <ul className="space-y-1.5">
        {findings.slice(0, 6).map(f => {
          const def = AGENTS[f.agent_id as AgentId]
          return (
            <li key={f.id} className={`flex items-start gap-3 p-2.5 rounded-md border ${sty.bg} ${sty.border}`}>
              <span className="text-lg shrink-0" aria-hidden>{def?.emoji ?? '🤖'}</span>
              <div className="min-w-0 flex-1">
                <p className={`text-sm font-bold ${sty.text} truncate`}>{f.titre}</p>
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
        {findings.length > 6 && (
          <li className="text-xs text-zinc-500 italic px-2.5">
            + {findings.length - 6} autres — <Link href={`/admin/pilotage/alertes?urgence=${urgence}`} className="text-emerald-700 hover:underline">voir toutes</Link>
          </li>
        )}
      </ul>
    </div>
  )
}
