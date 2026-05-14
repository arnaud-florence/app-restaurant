// Section 4 — Suggestions du jour, top 5 par impact (urgence).
// Alimentées uniquement par Stratégique + Météorologue.

import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { AGENTS, type AgentId } from '@/lib/agents/types'
import EmptyWidget from '@/components/dashboard/EmptyWidget'

export default async function SectionSuggestions() {
  const supabase = await createClient()
  const { data } = await supabase
    .from('agent_findings')
    .select('id, agent_id, urgence, titre, message, action_label, action_url, created_at')
    .eq('resolu', false)
    .in('agent_id', ['strategique', 'meteo'])
    .order('urgence', { ascending: true })  // rouge < jaune < vert
    .order('created_at', { ascending: false })
    .limit(5)

  const suggestions = data ?? []

  return (
    <section className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm">
      <header className="flex items-center justify-between mb-3">
        <h2 className="text-base font-bold text-zinc-900">💡 Suggestions du jour</h2>
        <span className="text-xs text-zinc-400">Source : Stratégique + Météo</span>
      </header>

      {suggestions.length === 0 ? (
        <EmptyWidget
          icon="💡"
          message="Aucune action prioritaire aujourd'hui"
          hint="Le Stratégique publie son brief chaque lundi à 07h. Le Météo chaque matin à 06h."
        />
      ) : (
        <ul className="space-y-2">
          {suggestions.map((s, idx) => {
            const def = AGENTS[s.agent_id as AgentId]
            return (
              <li key={s.id} className="flex items-start gap-3 p-2.5 rounded-md hover:bg-zinc-50">
                <span className="shrink-0 inline-flex items-center justify-center w-6 h-6 rounded-full bg-emerald-100 text-emerald-900 text-xs font-bold">
                  {idx + 1}
                </span>
                <span className="text-lg shrink-0" aria-hidden>{def?.emoji ?? '🤖'}</span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-bold text-zinc-900">{s.titre}</p>
                  {s.message && <p className="text-xs text-zinc-600 line-clamp-2">{s.message}</p>}
                </div>
                {s.action_url && s.action_label && (
                  <Link href={s.action_url} className="shrink-0 text-xs font-medium text-emerald-700 hover:text-emerald-800 whitespace-nowrap">
                    {s.action_label} →
                  </Link>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
