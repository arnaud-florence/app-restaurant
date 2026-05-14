'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { resoudreFinding, ignorerFinding, declencherAgent } from './actions'
import type { AgentId } from '@/lib/agents/types'

export default function AgentActions({ agentId }: { agentId: AgentId }) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [msg, setMsg] = useState<string | null>(null)

  function lancer() {
    setMsg(null)
    startTransition(async () => {
      const r = await declencherAgent(agentId)
      if (r.ok) {
        setMsg(`✓ Exécuté · ${r.summary ?? ''}`)
        router.refresh()
      } else {
        setMsg(`⚠ ${r.error ?? 'Échec'}`)
      }
    })
  }

  return (
    <div className="flex items-center gap-2">
      {msg && <span className="text-xs text-zinc-600">{msg}</span>}
      <button
        onClick={lancer}
        disabled={isPending}
        className="text-xs px-3 py-1.5 rounded bg-emerald-600 text-white font-bold hover:bg-emerald-500 disabled:bg-zinc-400"
      >
        {isPending ? '⏳ Exécution…' : '▶ Lancer maintenant'}
      </button>
    </div>
  )
}

// Sous-composant exporté séparément (et non comme propriété de AgentActions)
// pour franchir proprement la frontière Server Component → Client Component
// en Next.js RSC. Les références client n'autorisent pas l'accès à des
// propriétés sur les fonctions exportées (.FindingActions échouerait).
export function FindingActions({ findingId }: { findingId: string }) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  function resoudre() {
    startTransition(async () => {
      try { await resoudreFinding(findingId); router.refresh() }
      catch { /* silencieux : UI affichera la persistance via refresh */ }
    })
  }
  function ignorer() {
    startTransition(async () => {
      try { await ignorerFinding(findingId); router.refresh() }
      catch { /* silencieux */ }
    })
  }
  return (
    <div className="flex gap-1">
      <button
        onClick={resoudre}
        disabled={isPending}
        className="text-[11px] px-2 py-0.5 rounded bg-emerald-500 text-white font-bold hover:bg-emerald-400 disabled:opacity-50"
        title="Marquer comme traité"
      >✓ Résoudre</button>
      <button
        onClick={ignorer}
        disabled={isPending}
        className="text-[11px] px-2 py-0.5 rounded bg-zinc-200 text-zinc-700 hover:bg-zinc-300 disabled:opacity-50"
        title="Ignorer (faux positif)"
      >Ignorer</button>
    </div>
  )
}
