// ─── Agents temps réel par poste — cuisine, serveur, bar, snack ─────
//
// Une SEULE route dynamique pour 4 agents. Le poste est passé en path.
//   GET /api/cron/agents/realtime/cuisine
//   GET /api/cron/agents/realtime/serveur
//   GET /api/cron/agents/realtime/bar
//   GET /api/cron/agents/realtime/snack
//
// Chacun tourne toutes les 15 minutes (pendant le service). Détecte les
// situations urgentes propres au poste, émet des findings + push notifs
// rate-limitées (max 3/h par employé) aux employés pointés du poste.
//
// Auth : Bearer CRON_SECRET. Manuel : appel direct au navigateur en dev.

import { NextResponse } from 'next/server'
import { runAgent, emitFinding, authCron, agentEnVeille, type AgentContext } from '@/lib/agents/runner'
import { sendPushToEmployeRateLimited } from '@/lib/push'
import type { AgentId } from '@/lib/agents/types'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

type PosteRT = 'cuisine' | 'serveur' | 'bar' | 'snack'

const POSTE_TO_AGENT: Record<PosteRT, AgentId> = {
  cuisine: 'cuisine_rt',
  serveur: 'serveur_rt',
  bar:     'bar_rt',
  snack:   'snack_rt',
}

const POSTE_TO_EMPLOYES: Record<PosteRT, string[]> = {
  cuisine: ['cuisinier', 'second', 'pizzaiolo'],
  serveur: ['serveur', 'salle'],
  bar:     ['barman'],
  snack:   ['snacking', 'caisse_snacking', 'caisse'],
}

export async function GET(req: Request, { params }: { params: { poste: string } }) {
  try { authCron(req) } catch { return new NextResponse('Unauthorized', { status: 401 }) }

  const poste = params.poste as PosteRT
  if (!POSTE_TO_AGENT[poste]) {
    return NextResponse.json({ ok: false, error: 'poste invalide (cuisine|serveur|bar|snack)' }, { status: 400 })
  }
  const agentId = POSTE_TO_AGENT[poste]

  // Activité fermée → l'agent ne tourne pas. On répond 200 : un code d'erreur
  // serait compté comme une panne par le monitoring des agents.
  if (await agentEnVeille(agentId)) {
    return NextResponse.json({
      ok: true, skipped: true, agent: agentId,
      raison: `activité fermée — agent en veille (à rallumer depuis /admin/etablissements)`,
    })
  }

  const result = await runAgent(agentId, async (ctx) => {
    // Récupère les employés pointés actuellement pour ce poste (pour push notif ciblée)
    const employesActifs = await getEmployesActifsParPostes(ctx, POSTE_TO_EMPLOYES[poste])
    let nbAlertes = 0

    switch (poste) {
      case 'cuisine':
        nbAlertes = await detecterCuisine(ctx, employesActifs)
        break
      case 'serveur':
        nbAlertes = await detecterServeur(ctx, employesActifs)
        break
      case 'bar':
        nbAlertes = await detecterBar(ctx, employesActifs)
        break
      case 'snack':
        nbAlertes = await detecterSnack(ctx, employesActifs)
        break
    }

    return {
      summary: nbAlertes > 0
        ? `${nbAlertes} alerte(s) ${poste} temps réel`
        : `Service ${poste} sous contrôle`,
      data: { poste, nbAlertes, employesActifs: employesActifs.length },
    }
  })

  return NextResponse.json(result)
}

export const POST = GET

// ─────────────────────────────────────────────────────────────
// Helpers : employés pointés + push rate-limité
// ─────────────────────────────────────────────────────────────
async function getEmployesActifsParPostes(ctx: AgentContext, postes: string[]): Promise<string[]> {
  const today = new Date().toISOString().slice(0, 10)
  const { data } = await ctx.supabase
    .from('pointage')
    .select('employe_id, employe:employes!inner(poste, actif)')
    .eq('date_pointage', today)
    .is('heure_depart', null)
  type PointageRow = { employe_id: string; employe: { poste: string; actif: boolean } | Array<{ poste: string; actif: boolean }> | null }
  const ids = new Set<string>()
  for (const p of (data ?? []) as PointageRow[]) {
    const emp = Array.isArray(p.employe) ? p.employe[0] : p.employe
    if (!emp?.actif) continue
    if (postes.includes(emp.poste)) ids.add(p.employe_id)
  }
  return [...ids]
}

async function pushAuxEmployes(employeIds: string[], payload: { title: string; body: string; url?: string }) {
  for (const id of employeIds) {
    await sendPushToEmployeRateLimited(id, payload).catch(() => { /* silencieux */ })
  }
}

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

// ─────────────────────────────────────────────────────────────
// CUISINE temps réel : articles CUISINE/PIZZA en_preparation > 20min
// ─────────────────────────────────────────────────────────────
async function detecterCuisine(ctx: AgentContext, employesActifs: string[]): Promise<number> {
  const seuil = new Date(Date.now() - 20 * 60_000).toISOString()
  const { data: cmds } = await ctx.supabase
    .from('commandes')
    .select('id, numero, created_at, source, numero_table, commande_articles!inner(id, recette_nom:recettes(nom), tag_destination, statut)')
    .not('statut', 'in', '(encaisse,annule)')
    .lt('created_at', seuil)
    .limit(30)
  let nb = 0
  type Cmd = { id: string; numero: string; created_at: string; source: string; numero_table: string | null; commande_articles: Array<{ id: string; tag_destination: string; statut: string; recette_nom: { nom: string } | Array<{ nom: string }> | null }> }
  for (const c of (cmds ?? []) as Cmd[]) {
    const enRetard = c.commande_articles.filter(a =>
      (a.tag_destination === 'CUISINE' || a.tag_destination === 'PIZZA')
      && a.statut === 'en_preparation'
    )
    if (enRetard.length === 0) continue
    if (await findingDejaActif(ctx, 'cuisine_retard_prep', { commande_id: c.id })) continue
    const ageMin = Math.floor((Date.now() - new Date(c.created_at).getTime()) / 60_000)
    const noms = enRetard.map(a => {
      const r = Array.isArray(a.recette_nom) ? a.recette_nom[0] : a.recette_nom
      return r?.nom ?? '—'
    }).join(', ')
    await emitFinding(ctx, {
      urgence: 'rouge',
      type: 'cuisine_retard_prep',
      titre: `Cmd #${c.numero} en prép depuis ${ageMin} min`,
      message: `${enRetard.length} article(s) bloqué(s) : ${noms}${c.numero_table ? ` · Table ${c.numero_table}` : ''}.`,
      action_label: 'Voir cuisine',
      action_url:   '/cuisine',
      data: { commande_id: c.id, numero: c.numero, age_min: ageMin, articles: enRetard.length },
    })
    nb++
    await pushAuxEmployes(employesActifs, {
      title: `⏰ Retard prép cuisine`,
      body:  `Cmd #${c.numero} en prep depuis ${ageMin} min · ${enRetard.length} plat(s) bloqué(s)`,
      url:   '/cuisine',
    })
  }
  return nb
}

// ─────────────────────────────────────────────────────────────
// SERVEUR temps réel : table sans cmd > 10min, plat prêt > 5min, addition > 2h
// ─────────────────────────────────────────────────────────────
async function detecterServeur(ctx: AgentContext, employesActifs: string[]): Promise<number> {
  let nb = 0

  // (a) Tables 'occupee' sans commande associée — détecté via tables_restaurant.commande_active_id IS NULL
  const { data: tables } = await ctx.supabase
    .from('tables_restaurant')
    .select('id, numero, statut, commande_active_id, updated_at')
    .eq('statut', 'occupee')
    .is('commande_active_id', null)
  // Heuristique : si la table est 'occupee' sans commande_active_id ET que updated_at > 10 min, alerte
  type Table = { id: string; numero: string; statut: string; commande_active_id: string | null; updated_at: string | null }
  for (const t of (tables ?? []) as Table[]) {
    if (!t.updated_at) continue
    const ageMin = Math.floor((Date.now() - new Date(t.updated_at).getTime()) / 60_000)
    if (ageMin < 10) continue
    if (await findingDejaActif(ctx, 'serveur_table_sans_cmd', { table_id: t.id })) continue
    await emitFinding(ctx, {
      urgence: 'jaune',
      type: 'serveur_table_sans_cmd',
      titre: `Table ${t.numero} occupée depuis ${ageMin} min sans commande`,
      message: 'Les clients attendent — passer prendre leur commande.',
      action_label: 'Voir le plan de salle',
      action_url:   '/serveur',
      data: { table_id: t.id, numero: t.numero, age_min: ageMin },
    })
    nb++
    await pushAuxEmployes(employesActifs, {
      title: `🪑 Table ${t.numero} sans commande`,
      body:  `Occupée depuis ${ageMin} min — prendre la commande`,
      url:   '/serveur',
    })
  }

  // (b) Articles 'pret' depuis > 5 min mais non servis (le serveur doit aller chercher en cuisine)
  const seuil5 = new Date(Date.now() - 5 * 60_000).toISOString()
  const { data: arts } = await ctx.supabase
    .from('commande_articles')
    .select('id, commande:commandes!inner(id, numero, numero_table, statut), tag_destination, statut, updated_at')
    .eq('statut', 'pret')
    .lt('updated_at', seuil5)
    .limit(20)
  type Art = { id: string; commande: { id: string; numero: string; numero_table: string | null; statut: string } | Array<{ id: string; numero: string; numero_table: string | null; statut: string }>; tag_destination: string; statut: string; updated_at: string | null }
  for (const a of (arts ?? []) as Art[]) {
    const cmd = Array.isArray(a.commande) ? a.commande[0] : a.commande
    if (!cmd || cmd.statut === 'encaisse' || cmd.statut === 'annule') continue
    if (!a.updated_at) continue
    const ageMin = Math.floor((Date.now() - new Date(a.updated_at).getTime()) / 60_000)
    if (await findingDejaActif(ctx, 'serveur_plat_pret', { article_id: a.id })) continue
    await emitFinding(ctx, {
      urgence: 'rouge',
      type: 'serveur_plat_pret',
      titre: `Plat prêt en cuisine depuis ${ageMin} min`,
      message: `Cmd #${cmd.numero}${cmd.numero_table ? ` · Table ${cmd.numero_table}` : ''}. Aller le chercher en cuisine MAINTENANT.`,
      action_label: 'Voir',
      action_url:   '/serveur',
      data: { article_id: a.id, commande_id: cmd.id, table: cmd.numero_table, age_min: ageMin },
    })
    nb++
    await pushAuxEmployes(employesActifs, {
      title: `🍽 Plat prêt depuis ${ageMin}min`,
      body:  `Cmd #${cmd.numero}${cmd.numero_table ? ` · Table ${cmd.numero_table}` : ''}`,
      url:   '/serveur',
    })
  }

  // (c) Addition ouverte > 2h (commande 'servi' ou 'pret' depuis > 2h)
  const seuil2h = new Date(Date.now() - 2 * 3600_000).toISOString()
  const { data: long } = await ctx.supabase
    .from('commandes')
    .select('id, numero, numero_table, statut, created_at')
    .eq('source', 'TABLE')
    .in('statut', ['pret', 'servi'])
    .lt('created_at', seuil2h)
  for (const c of (long ?? []) as Array<{ id: string; numero: string; numero_table: string | null; statut: string; created_at: string }>) {
    if (await findingDejaActif(ctx, 'serveur_addition_longue', { commande_id: c.id })) continue
    const heures = Math.floor((Date.now() - new Date(c.created_at).getTime()) / 3600_000)
    await emitFinding(ctx, {
      urgence: 'jaune',
      type: 'serveur_addition_longue',
      titre: `Addition ouverte depuis ${heures}h · Table ${c.numero_table ?? '?'}`,
      message: `Cmd #${c.numero} statut ${c.statut}. Encaisser ou libérer la table.`,
      action_label: 'Encaisser',
      action_url:   '/serveur',
      data: { commande_id: c.id, heures, table: c.numero_table },
    })
    nb++
  }

  return nb
}

// ─────────────────────────────────────────────────────────────
// BAR temps réel : articles BAR en_attente > 5min
// ─────────────────────────────────────────────────────────────
async function detecterBar(ctx: AgentContext, employesActifs: string[]): Promise<number> {
  const seuil = new Date(Date.now() - 5 * 60_000).toISOString()
  const { data: arts } = await ctx.supabase
    .from('commande_articles')
    .select('id, commande:commandes!inner(id, numero, statut, created_at), recette_nom:recettes(nom), tag_destination, statut')
    .eq('tag_destination', 'BAR')
    .eq('statut', 'en_attente')
    .lt('created_at', seuil)
    .limit(20)
  type Art = { id: string; commande: { id: string; numero: string; statut: string; created_at: string } | Array<{ id: string; numero: string; statut: string; created_at: string }>; recette_nom: { nom: string } | Array<{ nom: string }> | null; tag_destination: string; statut: string }
  let nb = 0
  for (const a of (arts ?? []) as Art[]) {
    const cmd = Array.isArray(a.commande) ? a.commande[0] : a.commande
    if (!cmd || cmd.statut === 'encaisse' || cmd.statut === 'annule') continue
    const rec = Array.isArray(a.recette_nom) ? a.recette_nom[0] : a.recette_nom
    if (await findingDejaActif(ctx, 'bar_attente', { article_id: a.id })) continue
    const ageMin = Math.floor((Date.now() - new Date(cmd.created_at).getTime()) / 60_000)
    await emitFinding(ctx, {
      urgence: 'rouge',
      type: 'bar_attente',
      titre: `${rec?.nom ?? 'Boisson'} en attente depuis ${ageMin} min`,
      message: `Cmd #${cmd.numero}. Préparer maintenant.`,
      action_label: 'Voir le bar',
      action_url:   '/bar',
      data: { article_id: a.id, commande_id: cmd.id, age_min: ageMin },
    })
    nb++
  }
  if (nb > 0) {
    await pushAuxEmployes(employesActifs, {
      title: `🍷 ${nb} boisson${nb > 1 ? 's' : ''} en attente >5min`,
      body:  'Préparer les commandes bar maintenant',
      url:   '/bar',
    })
  }
  return nb
}

// ─────────────────────────────────────────────────────────────
// SNACK temps réel : cmd ONLINE en_attente > 5min sans prise en charge
// ─────────────────────────────────────────────────────────────
async function detecterSnack(ctx: AgentContext, employesActifs: string[]): Promise<number> {
  const seuil = new Date(Date.now() - 5 * 60_000).toISOString()
  const { data: cmds } = await ctx.supabase
    .from('commandes')
    .select('id, numero, statut, created_at, client_nom')
    .eq('source', 'ONLINE')
    .eq('statut', 'en_attente')
    .lt('created_at', seuil)
    .limit(20)
  let nb = 0
  for (const c of (cmds ?? []) as Array<{ id: string; numero: string; statut: string; created_at: string; client_nom: string | null }>) {
    if (await findingDejaActif(ctx, 'snack_online_attente', { commande_id: c.id })) continue
    const ageMin = Math.floor((Date.now() - new Date(c.created_at).getTime()) / 60_000)
    await emitFinding(ctx, {
      urgence: 'rouge',
      type: 'snack_online_attente',
      titre: `Cmd ONLINE #${c.numero} non prise depuis ${ageMin} min`,
      message: `${c.client_nom ?? 'Client'} a commandé en ligne. Confirmer la prise en charge.`,
      action_label: 'Voir /emporter',
      action_url:   '/emporter',
      data: { commande_id: c.id, numero: c.numero, age_min: ageMin },
    })
    nb++
  }
  if (nb > 0) {
    await pushAuxEmployes(employesActifs, {
      title: `📦 ${nb} cmd online en attente`,
      body:  `${nb} commande${nb > 1 ? 's' : ''} non prise${nb > 1 ? 's' : ''} en charge depuis >5min`,
      url:   '/emporter',
    })
  }
  return nb
}
