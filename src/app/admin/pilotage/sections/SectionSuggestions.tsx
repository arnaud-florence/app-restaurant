// Section 4 — Suggestions du jour, top 5 par impact (urgence).
// Server Component : query initiale + délégation à LiveSuggestionsList.

import { createClient } from '@/lib/supabase/server'
import EmptyWidget from '@/components/dashboard/EmptyWidget'
import LiveSuggestionsList from './LiveSuggestionsList'
import type { Finding } from '@/hooks/useLiveFindings'

export default async function SectionSuggestions() {
  const supabase = await createClient()
  const { data } = await supabase
    .from('agent_findings')
    .select('id, agent_id, urgence, titre, message, action_label, action_url, created_at')
    .eq('resolu', false)
    .in('agent_id', ['strategique', 'meteo'])
    .order('urgence', { ascending: true })
    .order('created_at', { ascending: false })
    .limit(20)

  const initial = (data ?? []) as Finding[]

  return (
    <section className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm">
      <header className="flex items-center justify-between mb-3">
        <h2 className="text-base font-bold text-zinc-900">💡 Suggestions du jour</h2>
        <span className="text-xs text-zinc-400 flex items-center gap-1.5">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
          </span>
          Live · Stratégique + Météo
        </span>
      </header>

      {initial.length === 0 ? (
        <EmptyWidget
          icon="💡"
          message="Aucune action prioritaire aujourd'hui"
          hint="Le Stratégique publie son brief chaque lundi à 07h. Le Météo chaque matin à 06h."
        />
      ) : (
        <LiveSuggestionsList initialFindings={initial} />
      )}
    </section>
  )
}
