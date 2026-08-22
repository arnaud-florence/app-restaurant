// ─── Agents temps réel par poste ────────────────────────────────────
//
// Une SEULE route dynamique pour 5 agents. Le poste est passé en path.
//   GET /api/cron/agents/realtime/cuisine
//   GET /api/cron/agents/realtime/serveur
//   GET /api/cron/agents/realtime/bar
//   GET /api/cron/agents/realtime/snack
//   GET /api/cron/agents/realtime/fournil
//
// Chaque agent est rattaché à un module d'activation (migration 0110) :
// si son activité est fermée, la route répond 200 { skipped: true } sans
// rien exécuter. Pendant la période « Fournil d'abord », seul `fournil`
// travaille réellement.
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

type PosteRT = 'cuisine' | 'serveur' | 'bar' | 'snack' | 'fournil'

const POSTE_TO_AGENT: Record<PosteRT, AgentId> = {
  cuisine: 'cuisine_rt',
  serveur: 'serveur_rt',
  bar:     'bar_rt',
  snack:   'snack_rt',
  fournil: 'fournil_rt',
}

const POSTE_TO_EMPLOYES: Record<PosteRT, string[]> = {
  cuisine: ['cuisinier', 'second', 'pizzaiolo'],
  serveur: ['serveur', 'salle'],
  bar:     ['barman'],
  snack:   ['snacking', 'caisse_snacking', 'caisse'],
  // Postes susceptibles de tenir le comptoir du fournil. 'polyvalent' est
  // inclus : en petite équipe, c'est souvent lui qui ouvre à 6h.
  fournil: ['fournil', 'boulanger', 'snack', 'polyvalent'],
}

export async function GET(req: Request, { params }: { params: { poste: string } }) {
  try { authCron(req) } catch { return new NextResponse('Unauthorized', { status: 401 }) }

  const poste = params.poste as PosteRT
  if (!POSTE_TO_AGENT[poste]) {
    return NextResponse.json({ ok: false, error: 'poste invalide (cuisine|serveur|bar|snack|fournil)' }, { status: 400 })
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
      case 'fournil':
        nbAlertes = await detecterFournil(ctx, employesActifs)
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

// ─────────────────────────────────────────────────────────────
// FOURNIL temps réel
// ─────────────────────────────────────────────────────────────
// Le fournil est le seul point de vente ouvert pendant la période
// « Fournil d'abord ». Trois situations coûtent réellement de l'argent ou
// des clients, et sont invisibles depuis le comptoir quand ça enchaîne :
//
//   1. une commande web arrivée et non prise en charge ;
//   2. la tournée de livraison qui n'est pas partie à l'heure ;
//   3. une commande prête que le client n'est jamais venu chercher.
async function detecterFournil(ctx: AgentContext, employesActifs: string[]): Promise<number> {
  let nb = 0
  const maintenant = Date.now()

  // ─── 1. Commandes web FOURNIL non prises en charge depuis > 10 min ───
  // 10 min et non 5 comme au snack : à 6h du matin, une seule personne tient
  // le comptoir et la fournée. Alerter trop tôt, c'est faire du bruit.
  const seuilWeb = new Date(maintenant - 10 * 60_000).toISOString()
  const { data: enAttente } = await ctx.supabase
    .from('commandes')
    .select('id, numero, created_at, client_nom, mode_retrait, commande_articles!inner(tag_destination)')
    .eq('source', 'ONLINE')
    .eq('statut', 'en_attente')
    .lt('created_at', seuilWeb)
    .limit(20)

  type CmdWeb = {
    id: string; numero: string; created_at: string; client_nom: string | null
    mode_retrait: string | null
    commande_articles: Array<{ tag_destination: string }>
  }
  for (const c of (enAttente ?? []) as CmdWeb[]) {
    if (!c.commande_articles.some(a => a.tag_destination === 'FOURNIL')) continue
    if (await findingDejaActif(ctx, 'fournil_web_attente', { commande_id: c.id })) continue
    const ageMin = Math.floor((maintenant - new Date(c.created_at).getTime()) / 60_000)
    await emitFinding(ctx, {
      urgence: 'rouge',
      type: 'fournil_web_attente',
      titre: `Commande web #${c.numero} en attente depuis ${ageMin} min`,
      message: `${c.client_nom ?? 'Un client'} attend une confirmation${c.mode_retrait === 'livraison' ? ' (à livrer)' : ''}.`,
      action_label: 'Voir le comptoir',
      action_url:   '/comptoir/fournil/kds',
      data: { commande_id: c.id, numero: c.numero, age_min: ageMin },
    })
    nb++
  }

  // ─── 2. Tournée de livraison en retard ───────────────────────────────
  // Une commande dont l'heure de tournée est dépassée de 30 min et qui n'est
  // toujours pas partie : le client attend son pain devant sa porte.
  const seuilTournee = new Date(maintenant - 30 * 60_000).toISOString()
  const { data: tournee } = await ctx.supabase
    .from('commandes')
    .select('id, numero, creneau_retrait, adresse_livraison, client_nom, livraison_depart_at, statut')
    .eq('mode_retrait', 'livraison')
    .not('statut', 'in', '(encaisse,annule,retire_par_client)')
    .is('livraison_depart_at', null)
    .lt('creneau_retrait', seuilTournee)
    .limit(20)

  type CmdLiv = {
    id: string; numero: string; creneau_retrait: string | null
    adresse_livraison: string | null; client_nom: string | null
  }
  const enRetard = (tournee ?? []) as CmdLiv[]
  for (const c of enRetard) {
    if (await findingDejaActif(ctx, 'fournil_tournee_retard', { commande_id: c.id })) continue
    const retardMin = c.creneau_retrait
      ? Math.floor((maintenant - new Date(c.creneau_retrait).getTime()) / 60_000)
      : 0
    await emitFinding(ctx, {
      urgence: 'rouge',
      type: 'fournil_tournee_retard',
      titre: `Livraison #${c.numero} en retard de ${retardMin} min`,
      message: `${c.client_nom ?? 'Client'} — ${c.adresse_livraison ?? 'adresse non renseignée'}. La tournée n'est pas partie.`,
      action_label: 'Voir la tournée',
      action_url:   '/livreur',
      data: { commande_id: c.id, numero: c.numero, retard_min: retardMin },
    })
    nb++
  }

  // ─── 3. Retraits oubliés ─────────────────────────────────────────────
  // Commande prête dont l'heure de retrait est dépassée de plus d'une heure.
  // En boulangerie ça se périme : mieux vaut rappeler le client que jeter.
  const seuilRetrait = new Date(maintenant - 60 * 60_000).toISOString()
  const { data: oublis } = await ctx.supabase
    .from('commandes')
    .select('id, numero, creneau_retrait, client_nom, client_telephone')
    .eq('source', 'ONLINE')
    .eq('mode_retrait', 'a_emporter')
    .in('statut', ['pret', 'servi'])
    .lt('creneau_retrait', seuilRetrait)
    .limit(20)

  type CmdOubli = {
    id: string; numero: string; creneau_retrait: string | null
    client_nom: string | null; client_telephone: string | null
  }
  for (const c of (oublis ?? []) as CmdOubli[]) {
    if (await findingDejaActif(ctx, 'fournil_retrait_oublie', { commande_id: c.id })) continue
    await emitFinding(ctx, {
      urgence: 'jaune',
      type: 'fournil_retrait_oublie',
      titre: `Commande #${c.numero} pas récupérée`,
      message: `${c.client_nom ?? 'Client'}${c.client_telephone ? ` · ${c.client_telephone}` : ''} — prête depuis plus d'une heure. Rappeler avant que ça ne se perde.`,
      action_label: 'Voir le comptoir',
      action_url:   '/comptoir/fournil/kds',
      data: { commande_id: c.id, numero: c.numero },
    })
    nb++
  }

  // ─── 4. Écarts de prix caisse ↔ outil ────────────────────────────────
  // SumUp n'expose pas son catalogue par API : un prix changé en caisse ne
  // peut se détecter qu'en le voyant passer dans les ventes. Quand le miroir
  // encaisse un produit à un prix qui ne correspond plus à la fiche, le site
  // affiche — et facture — un prix différent du comptoir. On compare le prix
  // DOMINANT des 2 dernières heures au TTC attendu de la fiche, et on exige
  // au moins 2 ventes au prix divergent : une vente isolée est plus souvent
  // un geste commercial qu'un changement de tarif.
  const seuilPrix = new Date(maintenant - 2 * 60 * 60_000).toISOString()
  const { data: ventesCaisse } = await ctx.supabase
    .from('commande_articles')
    .select('recette_id, prix_unitaire_ttc, commande:commandes!inner(source, created_at)')
    .eq('commande.source', 'CAISSE')
    .gte('commande.created_at', seuilPrix)
    .not('recette_id', 'is', null)
    .neq('statut', 'annule')
    .limit(500)

  type VenteLigne = { recette_id: string; prix_unitaire_ttc: number | string }
  const parProduit = new Map<string, Map<number, number>>() // recette → prix → occurrences
  for (const v of (ventesCaisse ?? []) as VenteLigne[]) {
    const prix = Math.round(Number(v.prix_unitaire_ttc) * 100) / 100
    if (!(prix > 0)) continue // ligne offerte : pas un tarif
    const m = parProduit.get(v.recette_id) ?? new Map<number, number>()
    m.set(prix, (m.get(prix) ?? 0) + 1)
    parProduit.set(v.recette_id, m)
  }

  if (parProduit.size > 0) {
    const { data: fiches } = await ctx.supabase
      .from('recettes')
      .select('id, nom, prix_vente_ht, tva')
      .in('id', Array.from(parProduit.keys()))
    for (const f of fiches ?? []) {
      const attendu = Math.round(Number(f.prix_vente_ht) * (1 + Number(f.tva ?? 0) / 100) * 100) / 100
      if (!(attendu > 0)) continue
      // Prix dominant observé en caisse sur la fenêtre
      let domine = 0, occurrences = 0
      for (const [prix, n] of parProduit.get(f.id as string)!) {
        if (n > occurrences) { domine = prix; occurrences = n }
      }
      if (occurrences < 2) continue
      if (Math.abs(domine - attendu) <= 0.011) continue // au centime près : arrondi, pas écart
      if (await findingDejaActif(ctx, 'fournil_ecart_prix', { recette_id: String(f.id), prix_caisse: domine.toFixed(2) })) continue
      await emitFinding(ctx, {
        urgence: 'jaune',
        type: 'fournil_ecart_prix',
        titre: `Écart de prix : ${f.nom} à ${domine.toFixed(2).replace('.', ',')} € en caisse`,
        message: `La fiche produit (et donc le site) est à ${attendu.toFixed(2).replace('.', ',')} € TTC, la caisse encaisse ${domine.toFixed(2).replace('.', ',')} € (${occurrences} vente(s) sur 2 h). Aligner l'un ou l'autre : un client web ne doit pas payer un autre prix que le comptoir.`,
        action_label: 'Ouvrir la fiche produit',
        action_url:   '/admin/recettes',
        data: { recette_id: String(f.id), prix_caisse: domine.toFixed(2), prix_fiche: attendu.toFixed(2), occurrences: String(occurrences) },
      })
      nb++
    }
  }

  // Un seul push groupé : le rate-limit plafonne déjà à 3/h par employé,
  // autant ne pas le consommer en notifications séparées.
  if (nb > 0) {
    await pushAuxEmployes(employesActifs, {
      title: `🥖 ${nb} alerte${nb > 1 ? 's' : ''} fournil`,
      body:  enRetard.length > 0
        ? `Dont ${enRetard.length} livraison${enRetard.length > 1 ? 's' : ''} en retard`
        : 'Commandes web ou retraits à traiter',
      url:   '/comptoir/fournil/kds',
    })
  }

  return nb
}
