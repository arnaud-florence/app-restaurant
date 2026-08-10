'use server'

// Actions serveur pour la page drill-down d'un agent :
//   - résoudre un finding (l'utilisateur l'a traité)
//   - ignorer un finding (faux positif, à archiver sans action)
//   - déclencher manuellement un agent (utile en dev avant cron infra prête)

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { getProfile } from '@/lib/auth'
import { AGENTS, type AgentId } from '@/lib/agents/types'

async function authManager(): Promise<{ employe_id: string | null }> {
  const profil = await getProfile()
  if (!profil) throw new Error('Non authentifié')
  if (profil.role !== 'manager') throw new Error('Accès manager requis')
  return { employe_id: profil.employe_id ?? null }
}

export async function resoudreFinding(findingId: string, note: string | null = null) {
  const { employe_id } = await authManager()
  const supabase = await createClient()
  const { error } = await supabase
    .from('agent_findings')
    .update({
      resolu: true,
      resolu_at: new Date().toISOString(),
      resolu_par: employe_id,
      resolu_note: note,
    })
    .eq('id', findingId)
  if (error) throw new Error(error.message)
  revalidatePath('/admin/pilotage')
  revalidatePath('/admin/pilotage/agents/[id]', 'page')
  return { ok: true as const }
}

export async function ignorerFinding(findingId: string) {
  return resoudreFinding(findingId, '(ignoré par le gérant)')
}

// Déclenche manuellement l'agent via fetch interne (utile en dev avant cron)
export async function declencherAgent(agentId: AgentId): Promise<{ ok: boolean; summary?: string; error?: string }> {
  await authManager()
  if (!AGENTS[agentId]) return { ok: false, error: 'Agent inconnu' }
  if (agentId === 'scanner') return { ok: false, error: 'Scanner est event-driven : utilise le bouton Scanner dans /admin/fournisseurs' }

  // Construit l'URL de la route cron de l'agent en restant local (same-origin).
  // Les agents temps réel vivent sous /realtime/<poste> (cuisine_rt → realtime/cuisine).
  const route = agentId.endsWith('_rt') ? `realtime/${agentId.replace('_rt', '')}` : agentId
  const url = `${process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000'}/api/cron/agents/${route}`
  const cronSecret = process.env.CRON_SECRET

  try {
    const r = await fetch(url, {
      method: 'GET',
      headers: cronSecret ? { Authorization: `Bearer ${cronSecret}` } : {},
      cache: 'no-store',
    })
    const json = await r.json().catch(() => ({}))
    if (!r.ok) return { ok: false, error: json.error ?? `HTTP ${r.status}` }
    revalidatePath('/admin/pilotage')
    revalidatePath(`/admin/pilotage/agents/${agentId}`)
    return { ok: true, summary: json.summary as string | undefined }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Échec déclenchement' }
  }
}
