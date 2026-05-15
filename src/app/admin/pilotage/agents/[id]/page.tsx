// Drill-down d'un agent : findings actifs, historique runs, déclenchement manuel.

import { notFound } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { AGENTS, AGENT_IDS, URGENCE_STYLE, type AgentId, type Urgence } from '@/lib/agents/types'
import AgentActions, { FindingActions } from './AgentActions'

export const dynamic = 'force-dynamic'

export default async function AgentDrilldownPage({ params }: { params: { id: string } }) {
  const agentId = params.id as AgentId
  if (!AGENT_IDS.includes(agentId)) notFound()
  const def = AGENTS[agentId]
  const supabase = await createClient()

  const [findingsActifsRes, findingsResolusRes, runsRes] = await Promise.all([
    supabase
      .from('agent_findings')
      .select('id, urgence, type, titre, message, action_label, action_url, data, created_at')
      .eq('agent_id', agentId)
      .eq('resolu', false)
      .order('urgence', { ascending: true })
      .order('created_at', { ascending: false }),
    supabase
      .from('agent_findings')
      .select('id, urgence, titre, resolu_at, resolu_note')
      .eq('agent_id', agentId)
      .eq('resolu', true)
      .order('resolu_at', { ascending: false })
      .limit(20),
    supabase
      .from('agents_runs')
      .select('id, status, started_at, finished_at, duration_ms, summary, count_rouge, count_jaune, count_vert, error_message')
      .eq('agent_id', agentId)
      .order('started_at', { ascending: false })
      .limit(10),
  ])

  const findingsActifs = findingsActifsRes.data ?? []
  const findingsResolus = findingsResolusRes.data ?? []
  const runs = runsRes.data ?? []

  const totalParUrgence = {
    rouge: findingsActifs.filter(f => f.urgence === 'rouge').length,
    jaune: findingsActifs.filter(f => f.urgence === 'jaune').length,
    vert:  findingsActifs.filter(f => f.urgence === 'vert').length,
  }

  return (
    <div className="max-w-5xl mx-auto p-4 sm:p-6 space-y-6 bg-[#FAFAFA] min-h-screen">
      {/* Header premium */}
      <header className="space-y-3">
        <Link href="/admin/pilotage" className="text-xs text-zinc-500 hover:text-zinc-900 inline-flex items-center gap-1">← Retour au pilotage</Link>
        <div className="flex items-center gap-3">
          <span className="inline-flex items-center justify-center w-12 h-12 rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-600 text-white text-2xl shadow-lg shadow-emerald-500/30 shrink-0">
            {def.emoji}
          </span>
          <div className="min-w-0">
            <p className="text-[10px] font-bold uppercase tracking-widest text-emerald-600">Agent IA · Live</p>
            <h1 className="text-xl sm:text-2xl font-black text-zinc-900 tracking-tight leading-none mt-0.5">{def.nom}</h1>
            <p className="text-xs text-zinc-500 mt-1">{def.description}</p>
            <p className="text-[10px] text-zinc-400 mt-0.5">{def.scheduleHuman}</p>
          </div>
        </div>
      </header>

      {/* Compteurs urgence + bouton déclencher */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex gap-2 text-xs">
          {totalParUrgence.rouge > 0 && (
            <span className="inline-flex items-center gap-1 px-2 py-1 rounded bg-red-100 text-red-900 font-bold">
              🔴 {totalParUrgence.rouge} urgent{totalParUrgence.rouge > 1 ? 's' : ''}
            </span>
          )}
          {totalParUrgence.jaune > 0 && (
            <span className="inline-flex items-center gap-1 px-2 py-1 rounded bg-amber-100 text-amber-900 font-bold">
              🟡 {totalParUrgence.jaune} à surveiller
            </span>
          )}
          {findingsActifs.length === 0 && (
            <span className="inline-flex items-center gap-1 px-2 py-1 rounded bg-emerald-100 text-emerald-900 font-bold">
              🟢 Aucune alerte
            </span>
          )}
        </div>
        <AgentActions agentId={agentId} />
      </div>

      {/* Findings actifs */}
      <section className="space-y-3">
        <h2 className="font-bold text-zinc-900">📋 Alertes & suggestions actives ({findingsActifs.length})</h2>
        {findingsActifs.length === 0 ? (
          <p className="text-sm text-zinc-500 italic border border-dashed rounded-md p-6 text-center">
            Aucune alerte active. {runs[0]?.status === 'success' ? '✓ Dernier run OK.' : 'L\'agent n\'a peut-être pas encore tourné.'}
          </p>
        ) : (
          <ul className="space-y-2">
            {findingsActifs.map(f => {
              const sty = URGENCE_STYLE[f.urgence as Urgence]
              return (
                <li key={f.id} className={`rounded-md border ${sty.border} ${sty.bg} p-3`}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <p className={`font-bold ${sty.text} text-sm`}>
                        <span className="mr-1">{sty.emoji}</span>
                        {f.titre}
                      </p>
                      {f.message && <p className="text-xs text-zinc-700 mt-1 whitespace-pre-wrap">{f.message}</p>}
                      <p className="text-[10px] text-zinc-500 mt-1">
                        {f.type && <span className="font-mono">{f.type}</span>} · {new Date(f.created_at as string).toLocaleString('fr-FR')}
                      </p>
                    </div>
                    <div className="flex flex-col gap-1 shrink-0">
                      {f.action_url && (
                        <Link
                          href={f.action_url as string}
                          className="text-xs px-2 py-1 rounded bg-white border border-zinc-300 hover:bg-zinc-50 text-center font-bold"
                        >
                          {f.action_label ?? 'Voir →'}
                        </Link>
                      )}
                      <FindingActions findingId={f.id as string} />
                    </div>
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </section>

      {/* Historique runs */}
      <section className="space-y-2">
        <h2 className="font-bold text-zinc-900">⚙️ Derniers passages</h2>
        {runs.length === 0 ? (
          <p className="text-sm text-zinc-500 italic">Aucun run enregistré.</p>
        ) : (
          <div className="border rounded-md divide-y bg-white">
            {runs.map(r => (
              <div key={r.id} className="p-2.5 flex items-center justify-between gap-2 text-xs">
                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-2">
                    {r.status === 'success' && <span className="text-emerald-600">✓</span>}
                    {r.status === 'error' && <span className="text-red-600">⚠</span>}
                    {r.status === 'running' && <span className="text-blue-500">⏳</span>}
                    <span className="font-medium truncate">{r.summary ?? '—'}</span>
                  </p>
                  {r.error_message && <p className="text-red-700 mt-0.5 truncate">{r.error_message}</p>}
                </div>
                <div className="text-zinc-500 text-right shrink-0">
                  <p>{new Date(r.started_at as string).toLocaleString('fr-FR')}</p>
                  <p className="tabular-nums">
                    {r.duration_ms ? `${(r.duration_ms / 1000).toFixed(1)}s` : ''} ·
                    🔴{r.count_rouge} 🟡{r.count_jaune} 🟢{r.count_vert}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Historique findings résolus */}
      {findingsResolus.length > 0 && (
        <section className="space-y-2">
          <h2 className="font-bold text-zinc-900">✓ Alertes résolues récemment ({findingsResolus.length})</h2>
          <div className="border rounded-md divide-y bg-zinc-50">
            {findingsResolus.map(f => {
              const sty = URGENCE_STYLE[f.urgence as Urgence]
              return (
                <div key={f.id} className="p-2 text-xs flex items-center justify-between gap-2">
                  <span className="truncate">
                    <span className="opacity-50">{sty.emoji}</span> {f.titre}
                  </span>
                  <span className="text-zinc-500 shrink-0">
                    {f.resolu_at ? new Date(f.resolu_at as string).toLocaleDateString('fr-FR') : ''}
                    {f.resolu_note && <span className="ml-1 italic">— {f.resolu_note}</span>}
                  </span>
                </div>
              )
            })}
          </div>
        </section>
      )}
    </div>
  )
}
