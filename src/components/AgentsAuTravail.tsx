// "Mes agents au travail" — bloc en haut du dashboard /admin/pilotage.
// Liste les 10 agents avec leur dernier statut + résumé + findings urgents.
//
// Server Component : query Supabase au chargement de la page. Le rafraîchissement
// live des findings est délégué à un wrapper client (à venir Phase 6).

import { AGENTS, AGENT_IDS, URGENCE_STYLE, type AgentId, type Urgence } from '@/lib/agents/types'
import { getLatestRunPerAgent, getFindingsActifs } from '@/lib/agents/runner'
import { cn } from '@/lib/utils'
import Link from 'next/link'

export default async function AgentsAuTravail() {
  const [runs, findings] = await Promise.all([
    getLatestRunPerAgent(),
    getFindingsActifs(),
  ])

  // Index par agent_id
  const runByAgent = new Map<AgentId, typeof runs[number]>()
  for (const r of runs) runByAgent.set(r.agent_id as AgentId, r)

  // Findings groupés par agent
  const findingsByAgent = new Map<AgentId, typeof findings>()
  for (const f of findings) {
    const k = f.agent_id as AgentId
    if (!findingsByAgent.has(k)) findingsByAgent.set(k, [])
    findingsByAgent.get(k)!.push(f)
  }

  // Compte total des findings actifs par urgence (pour la barre du haut)
  const totalRouge = findings.filter(f => f.urgence === 'rouge').length
  const totalJaune = findings.filter(f => f.urgence === 'jaune').length

  return (
    <section className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm">
      <header className="flex items-center justify-between mb-3 gap-2 flex-wrap">
        <div>
          <h2 className="text-base font-bold text-zinc-900">🤖 Mes agents au travail</h2>
          <p className="text-xs text-zinc-500">10 agents permanents qui surveillent et suggèrent en continu</p>
        </div>
        <div className="flex items-center gap-2 text-xs">
          {totalRouge > 0 && (
            <span className="inline-flex items-center gap-1 px-2 py-1 rounded bg-red-100 text-red-900 font-bold">
              🔴 {totalRouge} urgent{totalRouge > 1 ? 's' : ''}
            </span>
          )}
          {totalJaune > 0 && (
            <span className="inline-flex items-center gap-1 px-2 py-1 rounded bg-amber-100 text-amber-900 font-bold">
              🟡 {totalJaune} à surveiller
            </span>
          )}
          {totalRouge === 0 && totalJaune === 0 && (
            <span className="inline-flex items-center gap-1 px-2 py-1 rounded bg-emerald-100 text-emerald-900 font-bold">
              🟢 Tout est calme
            </span>
          )}
        </div>
      </header>

      <ul className="divide-y divide-zinc-100">
        {AGENT_IDS.map(id => {
          const def = AGENTS[id]
          const run = runByAgent.get(id)
          const myFindings = findingsByAgent.get(id) ?? []
          const urgence: Urgence = myFindings.find(f => f.urgence === 'rouge')
            ? 'rouge'
            : myFindings.find(f => f.urgence === 'jaune')
              ? 'jaune'
              : 'vert'
          const sty = URGENCE_STYLE[urgence]
          return (
            <li key={id} className="py-2.5 flex items-center justify-between gap-3">
              {/* Pastille urgence + emoji agent + nom */}
              <div className="flex items-center gap-3 min-w-0 flex-1">
                <span className="text-lg" aria-hidden>{sty.emoji}</span>
                <span className="text-xl" aria-hidden>{def.emoji}</span>
                <div className="min-w-0">
                  <p className="text-sm font-bold text-zinc-900 truncate">
                    {def.nom}
                    <span className="ml-1.5 text-[10px] font-normal text-zinc-400">· {def.scheduleHuman}</span>
                  </p>
                  <p className="text-xs text-zinc-600 truncate">
                    {run?.summary ?? <span className="italic text-zinc-400">Jamais exécuté</span>}
                  </p>
                </div>
              </div>

              {/* Compteur findings actifs (cliquable) */}
              {myFindings.length > 0 ? (
                <Link
                  href={`/admin/pilotage/agents/${id}`}
                  className={cn(
                    'shrink-0 px-2.5 py-1 rounded-md text-xs font-bold border whitespace-nowrap',
                    sty.bg, sty.text, sty.border,
                    'hover:opacity-80 transition-opacity',
                  )}
                >
                  {myFindings.length} {myFindings.length > 1 ? 'alertes' : 'alerte'} →
                </Link>
              ) : run?.status === 'success' ? (
                <span className="shrink-0 text-[10px] text-zinc-400">
                  {timeAgo(run.finished_at as string | null)}
                </span>
              ) : run?.status === 'error' ? (
                <span className="shrink-0 text-[10px] font-bold text-red-600">⚠ erreur</span>
              ) : null}
            </li>
          )
        })}
      </ul>

      {findings.length === 0 && (
        <p className="mt-3 text-center text-xs text-zinc-500 italic">
          Aucune alerte active. Les agents tournent en arrière-plan selon leur planning.
        </p>
      )}
    </section>
  )
}

function timeAgo(iso: string | null): string {
  if (!iso) return ''
  const diffMs = Date.now() - new Date(iso).getTime()
  const minutes = Math.floor(diffMs / 60_000)
  if (minutes < 1) return 'à l\'instant'
  if (minutes < 60) return `il y a ${minutes} min`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `il y a ${hours} h`
  const days = Math.floor(hours / 24)
  return `il y a ${days} j`
}
