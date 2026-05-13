// ─── Agent 10 — Vigile sécurité ────────────────────────────────
// Cron : toutes les 15 minutes.
//
// Tâches :
//   (1) Commandes bloquées > 2h en statut intermédiaire → rouge
//   (2) Anomalies caisse : écart > 5€ détecté à la dernière clôture
//   (3) Tentatives login échouées (table connexions, succès=false)
//   (4) Connexions marquées inhabituelles
//   (5) Health-check des autres agents (run en erreur dans les 24h)
//
// Auth : Bearer CRON_SECRET. Manuel : GET /api/cron/agents/securite

import { NextResponse } from 'next/server'
import { runAgent, emitFinding, authCron, type AgentContext } from '@/lib/agents/runner'

export const dynamic = 'force-dynamic'
export const maxDuration = 30

export async function GET(req: Request) {
  try { authCron(req) } catch { return new NextResponse('Unauthorized', { status: 401 }) }

  const result = await runAgent('securite', async (ctx) => {
    const bloquees = await detecterCommandesBloquees(ctx)
    const caisse   = await detecterEcartsCaisse(ctx)
    const auth     = await detecterAnomaliesAuth(ctx)
    const agents   = await detecterAgentsEnErreur(ctx)

    const summary = [
      bloquees.nb > 0 ? `${bloquees.nb} cmd bloquée(s) > 2h` : null,
      caisse.nbAnomalies > 0 ? `${caisse.nbAnomalies} écart(s) caisse` : null,
      auth.nbEchecs > 0 ? `${auth.nbEchecs} login(s) échoué(s)` : null,
      auth.nbInhabituelles > 0 ? `${auth.nbInhabituelles} connexion(s) inhabituelle(s)` : null,
      agents.nbErreurs > 0 ? `${agents.nbErreurs} agent(s) en erreur` : null,
    ].filter(Boolean).join(' · ')

    return {
      summary: summary || 'RAS — système OK',
      data: { bloquees, caisse, auth, agents },
    }
  })

  return NextResponse.json(result)
}

export const POST = GET

// ─────────────────────────────────────────────────────────────
// (1) Commandes bloquées > 2h en statut intermédiaire
// ─────────────────────────────────────────────────────────────
async function detecterCommandesBloquees(ctx: AgentContext) {
  const seuil = new Date(Date.now() - 2 * 3600_000)
  const { data: cmds } = await ctx.supabase
    .from('commandes')
    .select('id, numero, statut, created_at, source, numero_table')
    .not('statut', 'in', '(encaisse,annule,retire_par_client)')
    .lt('created_at', seuil.toISOString())
    .limit(20)
  const liste = (cmds ?? []) as Array<{ id: string; numero: string; statut: string; created_at: string; source: string; numero_table: string | null }>

  for (const c of liste) {
    if (await findingDejaActif(ctx, 'commande_bloquee', { commande_id: c.id })) continue
    const ageMin = Math.floor((Date.now() - new Date(c.created_at).getTime()) / 60_000)
    await emitFinding(ctx, {
      urgence: 'rouge',
      type: 'commande_bloquee',
      titre: `Commande #${c.numero} bloquée depuis ${Math.floor(ageMin / 60)}h${ageMin % 60}min`,
      message: `Statut ${c.statut} · Source ${c.source}${c.numero_table ? ' · Table ' + c.numero_table : ''}. Vérifie le poste concerné.`,
      action_label: 'Voir la commande',
      action_url:   c.source === 'TABLE' ? '/serveur' : c.source === 'COMPTOIR' ? '/bar' : '/emporter',
      data: { commande_id: c.id, numero: c.numero, statut: c.statut, age_min: ageMin },
    })
  }
  return { nb: liste.length }
}

// ─────────────────────────────────────────────────────────────
// (2) Anomalies caisse : sessions fermées avec écart |ecart| > 5€
// ─────────────────────────────────────────────────────────────
async function detecterEcartsCaisse(ctx: AgentContext) {
  // On regarde les sessions fermées dans les 24h
  const il24h = new Date(Date.now() - 24 * 3600_000)
  const { data: sessions } = await ctx.supabase
    .from('sessions_caisse')
    .select('id, date_session, ecart, fermee_at, notes')
    .not('fermee_at', 'is', null)
    .gte('fermee_at', il24h.toISOString())
    .not('ecart', 'is', null)

  type SessionRow = { id: string; date_session: string; ecart: number | null; fermee_at: string; notes: string | null }
  const liste = (sessions ?? []) as SessionRow[]
  let nbAnomalies = 0
  for (const s of liste) {
    const ecart = Math.abs(Number(s.ecart ?? 0))
    if (ecart <= 5) continue   // tolérance acceptable
    // Ignore les clôtures auto (notes contient "Agent Veilleur") car écart = 0 forcé
    if (s.notes && s.notes.includes('Agent Veilleur')) continue
    nbAnomalies++
    if (await findingDejaActif(ctx, 'ecart_caisse', { session_id: s.id })) continue
    await emitFinding(ctx, {
      urgence: ecart > 20 ? 'rouge' : 'jaune',
      type: 'ecart_caisse',
      titre: `Écart caisse ${ecart.toFixed(2)}€ — session ${s.date_session}`,
      message: `Différence entre CA attendu et compté physiquement. Vérifie : oublis de paiement, monnaie rendue, prélèvements personnels.`,
      action_label: 'Voir la session',
      action_url:   `/caisse/${s.id}/print`,
      data: { session_id: s.id, date: s.date_session, ecart: Number(s.ecart) },
    })
  }
  return { nbAnomalies }
}

// ─────────────────────────────────────────────────────────────
// (3) Tentatives login échouées + connexions inhabituelles
// ─────────────────────────────────────────────────────────────
async function detecterAnomaliesAuth(ctx: AgentContext) {
  const il24h = new Date(Date.now() - 24 * 3600_000)
  const { data: conn } = await ctx.supabase
    .from('connexions')
    .select('id, email, succes, ip, inhabituelle, created_at')
    .gte('created_at', il24h.toISOString())

  type ConnRow = { id: string; email: string | null; succes: boolean | null; ip: string | null; inhabituelle: boolean | null; created_at: string }
  const liste = (conn ?? []) as ConnRow[]
  const echecs = liste.filter(c => c.succes === false)
  const inhabituelles = liste.filter(c => c.inhabituelle === true && c.succes === true)

  // Brute force suspect : > 5 échecs sur 24h depuis le même email
  const echecsParEmail = new Map<string, number>()
  for (const e of echecs) {
    if (!e.email) continue
    echecsParEmail.set(e.email, (echecsParEmail.get(e.email) ?? 0) + 1)
  }
  for (const [email, n] of echecsParEmail) {
    if (n < 5) continue
    if (await findingDejaActif(ctx, 'login_brute_force', { email })) continue
    await emitFinding(ctx, {
      urgence: 'rouge',
      type: 'login_brute_force',
      titre: `${n} tentatives de connexion échouées : ${email}`,
      message: `Sur les dernières 24h. Vérifie qu'il ne s'agit pas d'une tentative d'intrusion. Considère un changement de mot de passe.`,
      action_label: 'Voir le journal',
      action_url:   '/admin/securite',
      data: { email, nb_echecs: n },
    })
  }

  // Connexions marquées inhabituelles
  for (const c of inhabituelles) {
    if (!c.email) continue
    if (await findingDejaActif(ctx, 'connexion_inhabituelle', { connexion_id: c.id })) continue
    await emitFinding(ctx, {
      urgence: 'jaune',
      type: 'connexion_inhabituelle',
      titre: `Connexion inhabituelle : ${c.email}`,
      message: `Depuis IP ${c.ip ?? 'inconnue'}. Vérifie que c'est bien légitime.`,
      action_label: 'Voir les connexions',
      action_url:   '/admin/securite',
      data: { connexion_id: c.id, email: c.email, ip: c.ip },
    })
  }

  return { nbEchecs: echecs.length, nbInhabituelles: inhabituelles.length }
}

// ─────────────────────────────────────────────────────────────
// (4) Health-check : agents en erreur dans les 24h
// ─────────────────────────────────────────────────────────────
async function detecterAgentsEnErreur(ctx: AgentContext) {
  const il24h = new Date(Date.now() - 24 * 3600_000)
  // Récupère le dernier run de chaque agent (DISTINCT ON via tri + dédup JS)
  const { data: runs } = await ctx.supabase
    .from('agents_runs')
    .select('agent_id, status, started_at, error_message')
    .gte('started_at', il24h.toISOString())
    .order('started_at', { ascending: false })
  type RunRow = { agent_id: string; status: string; started_at: string; error_message: string | null }
  const seen = new Set<string>()
  const dernierParAgent: RunRow[] = []
  for (const r of (runs ?? []) as RunRow[]) {
    if (seen.has(r.agent_id)) continue
    seen.add(r.agent_id)
    dernierParAgent.push(r)
  }
  const enErreur = dernierParAgent.filter(r => r.status === 'error' && r.agent_id !== 'securite')
  for (const r of enErreur) {
    const dateCle = r.started_at.slice(0, 10)
    if (await findingDejaActif(ctx, 'agent_en_erreur', { agent_id_date: `${r.agent_id}|${dateCle}` })) continue
    await emitFinding(ctx, {
      urgence: 'rouge',
      type: 'agent_en_erreur',
      titre: `Agent ${r.agent_id} en erreur`,
      message: r.error_message ?? 'Échec à la dernière exécution. Vérifie les logs.',
      action_label: 'Voir le détail',
      action_url:   `/admin/pilotage/agents/${r.agent_id}`,
      data: { agent_id_date: `${r.agent_id}|${dateCle}`, agent_id: r.agent_id, started_at: r.started_at, error: r.error_message },
    })
  }
  return { nbErreurs: enErreur.length }
}

// ─────────────────────────────────────────────────────────────
async function findingDejaActif(ctx: AgentContext, type: string, data: Record<string, string>): Promise<boolean> {
  const [key, val] = Object.entries(data)[0] ?? []
  if (!key || !val) return false
  const jsonPath = `data->>${key}` as unknown as 'id'
  const { count } = await ctx.supabase
    .from('agent_findings')
    .select('*', { count: 'exact', head: true })
    .eq('agent_id', ctx.agentId)
    .eq('type', type)
    .eq('resolu', false)
    .eq(jsonPath, val)
  return (count ?? 0) > 0
}
