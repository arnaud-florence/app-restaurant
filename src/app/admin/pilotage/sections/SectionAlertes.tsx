// Section 2 — Alertes prioritaires alimentées uniquement par les agents.
// Server Component : fait la query initiale puis délègue le rendu (et la
// souscription Realtime pour les nouvelles alertes live) à LiveAlertesList.

import { createClient } from '@/lib/supabase/server'
import EmptyWidget from '@/components/dashboard/EmptyWidget'
import LiveAlertesList, { type Finding } from './LiveAlertesList'

export default async function SectionAlertes() {
  const supabase = await createClient()
  const { data } = await supabase
    .from('agent_findings')
    .select('id, agent_id, urgence, titre, message, action_label, action_url, created_at')
    .eq('resolu', false)
    .order('created_at', { ascending: false })
    .limit(30)

  const findings = (data ?? []) as Finding[]

  return (
    <section className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm">
      <header className="flex items-center justify-between mb-3">
        <h2 className="text-base font-bold text-zinc-900">🔔 Alertes prioritaires</h2>
        <span className="text-xs text-zinc-400 flex items-center gap-1.5">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
          </span>
          Live · tous agents
        </span>
      </header>

      {findings.length === 0 ? (
        <EmptyWidget
          icon="✓"
          message="Tout va bien — aucune alerte en cours"
          hint="Les agents surveillent en continu. Tu seras prévenu ici dès qu'une action est nécessaire."
        />
      ) : (
        <LiveAlertesList initialFindings={findings} />
      )}
    </section>
  )
}
