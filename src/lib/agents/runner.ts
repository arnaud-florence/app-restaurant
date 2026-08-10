// Helper partagé : exécute un agent, gère le timing, les erreurs, et persiste
// l'exécution dans agents_runs + les findings dans agent_findings.
//
// Usage typique côté route API cron :
//
//   import { runAgent, emitFinding } from '@/lib/agents/runner'
//
//   export async function GET(req: Request) {
//     authCron(req)  // vérifie Bearer CRON_SECRET
//     const result = await runAgent('veilleur', async (ctx) => {
//       // ... logique métier ...
//       await emitFinding(ctx, { urgence: 'rouge', titre: '...', ... })
//       return { summary: 'CA hier 1847€, marge 68%', data: { ca: 1847 } }
//     })
//     return Response.json(result)
//   }

import { createClient } from '@/lib/supabase/server'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { AgentId, Urgence } from './types'

// ─── Auth des routes cron ────────────────────────────────────
// Vercel cron passe `Authorization: Bearer ${CRON_SECRET}` automatiquement
// si la variable est configurée. En dev local, on tolère l'absence pour
// pouvoir tester manuellement via curl ou navigateur.
export function authCron(req: Request): void {
  const auth = req.headers.get('authorization') ?? ''
  const expected = process.env.CRON_SECRET
  if (!expected) {
    // Pas de secret configuré → mode dev permissif (mais log un warn)
    console.warn('[agents] CRON_SECRET non configuré — auth cron désactivée')
    return
  }
  if (auth !== `Bearer ${expected}`) {
    throw new Error('Unauthorized')
  }
}

// ─── Contexte passé à la fonction métier de chaque agent ─────
export type AgentContext = {
  runId: string
  agentId: AgentId
  supabase: SupabaseClient
  // Findings accumulés pendant l'exécution (compteurs mis à jour à la fin du run)
  _findingsCounts: { rouge: number; jaune: number; vert: number }
}

export type AgentRunResult<T = unknown> = {
  /** Résumé une phrase affichée dans le dashboard ("CA hier 1847€, marge 68%") */
  summary: string
  /** Données structurées libres (KPIs, métriques) persistées dans agents_runs.data */
  data?: T
}

// ─── runAgent : wrap timing + error handling + log dans agents_runs ───
export async function runAgent<T = unknown>(
  agentId: AgentId,
  fn: (ctx: AgentContext) => Promise<AgentRunResult<T>>,
): Promise<{ ok: true; runId: string; summary: string; durationMs: number } | { ok: false; runId: string; error: string }> {
  const supabase = await createClient()

  // ─── Mode formation : agents EN PAUSE ──────────────────────────────
  // Pendant la phase de prise en main par les équipes, on ne veut ni
  // exécution (qui lirait des données d'exercice), ni findings, ni push.
  // Flag global stocké dans parametres (cle='mode_formation', valeur='true').
  try {
    const { data: flag } = await supabase
      .from('parametres').select('valeur').eq('cle', 'mode_formation').maybeSingle()
    if (flag?.valeur === 'true') {
      return { ok: true as const, runId: 'skip-formation', summary: '⏸️ Mode formation actif — agent en pause', durationMs: 0 }
    }
  } catch { /* lecture du flag impossible → on continue normalement */ }

  // Crée le run en "running"
  const { data: run, error: runErr } = await supabase
    .from('agents_runs')
    .insert({ agent_id: agentId, status: 'running' })
    .select('id')
    .single()
  if (runErr || !run) {
    throw new Error(`Impossible de créer agents_runs : ${runErr?.message}`)
  }
  const runId = run.id as string
  const startMs = Date.now()

  const ctx: AgentContext = {
    runId,
    agentId,
    supabase,
    _findingsCounts: { rouge: 0, jaune: 0, vert: 0 },
  }

  try {
    const result = await fn(ctx)
    const durationMs = Date.now() - startMs
    await supabase
      .from('agents_runs')
      .update({
        status: 'success',
        finished_at: new Date().toISOString(),
        duration_ms: durationMs,
        summary: result.summary,
        data: result.data ?? {},
        count_rouge: ctx._findingsCounts.rouge,
        count_jaune: ctx._findingsCounts.jaune,
        count_vert: ctx._findingsCounts.vert,
      })
      .eq('id', runId)
    return { ok: true as const, runId, summary: result.summary, durationMs }
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    const durationMs = Date.now() - startMs
    await supabase
      .from('agents_runs')
      .update({
        status: 'error',
        finished_at: new Date().toISOString(),
        duration_ms: durationMs,
        error_message: message,
        count_rouge: ctx._findingsCounts.rouge,
        count_jaune: ctx._findingsCounts.jaune,
        count_vert: ctx._findingsCounts.vert,
      })
      .eq('id', runId)
    console.error(`[agents/${agentId}] échec : ${message}`)
    return { ok: false as const, runId, error: message }
  }
}

// ─── emitFinding : enregistre une alerte/suggestion + push si rouge ───
type EmitFindingInput = {
  urgence: Urgence
  titre: string
  message?: string
  type?: string
  action_label?: string
  action_url?: string
  data?: Record<string, unknown>
}

export async function emitFinding(ctx: AgentContext, input: EmitFindingInput): Promise<void> {
  const { error } = await ctx.supabase.from('agent_findings').insert({
    agent_id:     ctx.agentId,
    run_id:       ctx.runId,
    urgence:      input.urgence,
    type:         input.type ?? null,
    titre:        input.titre,
    message:      input.message ?? null,
    action_label: input.action_label ?? null,
    action_url:   input.action_url ?? null,
    data:         input.data ?? {},
  })
  if (error) {
    console.error(`[agents/${ctx.agentId}] emitFinding error : ${error.message}`)
    return
  }
  ctx._findingsCounts[input.urgence]++

  // Findings rouges → push notif immédiate au gérant
  if (input.urgence === 'rouge') {
    try {
      const { sendPushToPostes } = await import('@/lib/push')
      await sendPushToPostes(['manager'], {
        title: `🔴 ${input.titre}`,
        body:  input.message ?? '',
        url:   input.action_url ?? '/admin/pilotage',
      })
    } catch (e) {
      console.warn(`[agents/${ctx.agentId}] push notif échec (non bloquant)`, e)
    }
  }

  // 👨‍🍳 Agents temps réel par poste → push AUSSI les salariés du poste concerné
  // (coup de main en service). Findings dédupliqués → pas de spam à chaque cycle.
  const POSTES_RT: Record<string, string[]> = {
    cuisine_rt: ['cuisinier', 'cuisine', 'second', 'pizzaiolo', 'cuisinier_snacking', 'polyvalent'],
    serveur_rt: ['serveur', 'salle', 'polyvalent'],
    bar_rt:     ['barman', 'bar', 'polyvalent'],
    snack_rt:   ['cuisinier_snacking', 'snack', 'polyvalent'],
  }
  const postesRT = POSTES_RT[ctx.agentId]
  if (postesRT && (input.urgence === 'rouge' || input.urgence === 'jaune')) {
    try {
      const { sendPushToPostes } = await import('@/lib/push')
      await sendPushToPostes(postesRT, {
        title: `👨‍🍳 Arnaud : ${input.titre}`,
        body:  input.message ?? '',
        url:   input.action_url ?? '/mon-espace',
      })
    } catch (e) {
      console.warn(`[agents/${ctx.agentId}] push poste échec (non bloquant)`, e)
    }
  }
}

// ─── Helper : récupère le dernier run de chaque agent (pour le dashboard) ───
export async function getLatestRunPerAgent() {
  const supabase = await createClient()
  // Utilise DISTINCT ON via une query SQL native pour avoir 1 ligne max par agent
  const { data, error } = await supabase
    .from('agents_runs')
    .select('agent_id, started_at, finished_at, duration_ms, status, summary, count_rouge, count_jaune, count_vert, data')
    .order('started_at', { ascending: false })
    .limit(200)
  if (error) {
    console.error('[agents] getLatestRunPerAgent error', error.message)
    return []
  }
  // Côté JS : garde le 1er (= plus récent) par agent_id
  const seen = new Set<string>()
  const out: typeof data = []
  for (const r of (data ?? [])) {
    if (seen.has(r.agent_id as string)) continue
    seen.add(r.agent_id as string)
    out.push(r)
  }
  return out
}

// ─── Helper : récupère les findings actifs (non résolus) groupés par agent ───
export async function getFindingsActifs() {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('agent_findings')
    .select('id, agent_id, urgence, type, titre, message, action_label, action_url, data, created_at')
    .eq('resolu', false)
    .order('urgence', { ascending: true })   // rouge avant jaune avant vert
    .order('created_at', { ascending: false })
    .limit(200)
  if (error) {
    console.error('[agents] getFindingsActifs error', error.message)
    return []
  }
  return data ?? []
}
