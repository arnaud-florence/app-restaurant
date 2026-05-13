// ─── Agent 7 — Commercial client ────────────────────────────────
// Cron : chaque soir à 20h00.
//
// Tâches :
//   (1) Clients dormants > 60j → suggestion campagne réactivation
//   (2) Anniversaires de la semaine → suggestion campagne -10%
//   (3) Avis publics non répondus (brouillon IA déjà prêt si dispo)
//   (4) Réservations chambres à venir (J+0 et J+1) sans confirmation envoyée
//   (5) Réclamations en attente > 48h → finding rouge
//
// Auth : Bearer CRON_SECRET. Manuel : GET /api/cron/agents/commercial

import { NextResponse } from 'next/server'
import { runAgent, emitFinding, authCron, type AgentContext } from '@/lib/agents/runner'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

const SEUIL_DORMANT_JOURS = 60
const SEUIL_RECLAMATION_HEURES = 48

export async function GET(req: Request) {
  try { authCron(req) } catch { return new NextResponse('Unauthorized', { status: 401 }) }

  const result = await runAgent('commercial', async (ctx) => {
    const dormants     = await detecterDormants(ctx)
    const anniversaires = await detecterAnniversaires(ctx)
    const avis          = await detecterAvisNonRepondus(ctx)
    const resaJ01       = await detecterReservationsImminentes(ctx)
    const reclam        = await detecterReclamationsAttente(ctx)

    const summary = [
      dormants.nbDormants > 0 ? `${dormants.nbDormants} client(s) dormant(s) > ${SEUIL_DORMANT_JOURS}j` : null,
      anniversaires.nbCetteSemaine > 0 ? `${anniversaires.nbCetteSemaine} anniversaire(s) cette semaine` : null,
      avis.nbNonRepondus > 0 ? `${avis.nbNonRepondus} avis à répondre` : null,
      resaJ01.nb > 0 ? `${resaJ01.nb} réservation(s) chambre J+0/J+1` : null,
      reclam.nbAttente > 0 ? `${reclam.nbAttente} réclamation(s) > 48h` : null,
    ].filter(Boolean).join(' · ')

    return {
      summary: summary || 'Aucune action commerciale urgente',
      data: { dormants, anniversaires, avis, resaJ01, reclam },
    }
  })

  return NextResponse.json(result)
}

export const POST = GET

// ─────────────────────────────────────────────────────────────
// (1) Clients dormants — pas commande depuis > 60j
// ─────────────────────────────────────────────────────────────
async function detecterDormants(ctx: AgentContext) {
  // Liste clients opt_in marketing avec dernière commande > 60j (ou jamais)
  const seuil = new Date(); seuil.setDate(seuil.getDate() - SEUIL_DORMANT_JOURS)
  const seuilIso = seuil.toISOString()

  // Clients opt-in
  const { data: clients } = await ctx.supabase
    .from('clients')
    .select('id, prenom, nom, email')
    .eq('opt_in_marketing', true)
    .not('email', 'is', null)
  if (!clients || clients.length === 0) return { nbDormants: 0, exemples: [] }

  // Dernière commande par client (récupère toutes les commandes de ces clients dans 6 mois)
  const il6mois = new Date(); il6mois.setDate(il6mois.getDate() - 180)
  const { data: cmds } = await ctx.supabase
    .from('commandes')
    .select('client_id, created_at')
    .in('client_id', clients.map(c => c.id))
    .gte('created_at', il6mois.toISOString())
    .order('created_at', { ascending: false })
  const derniereByClient = new Map<string, string>()
  for (const c of (cmds ?? []) as Array<{ client_id: string; created_at: string }>) {
    if (!derniereByClient.has(c.client_id)) derniereByClient.set(c.client_id, c.created_at)
  }

  const dormants = clients.filter(c => {
    const derniere = derniereByClient.get(c.id as string)
    if (!derniere) return true   // jamais commandé → dormant
    return derniere < seuilIso
  })

  if (dormants.length > 0) {
    if (!(await findingDejaActif(ctx, 'clients_dormants', { date: new Date().toISOString().slice(0, 10) }))) {
      await emitFinding(ctx, {
        urgence: 'jaune',
        type: 'clients_dormants',
        titre: `${dormants.length} client(s) dormant(s) à réactiver`,
        message: `Pas commandé depuis ${SEUIL_DORMANT_JOURS} jours. Lance une campagne email avec un avantage (-10%, plat offert…) pour les faire revenir.`,
        action_label: 'Créer une campagne',
        action_url:   '/admin/clients/campagnes',
        data: { date: new Date().toISOString().slice(0, 10), nb: dormants.length, ids: dormants.slice(0, 50).map(d => d.id) },
      })
    }
  }
  return { nbDormants: dormants.length, exemples: dormants.slice(0, 5).map(d => `${d.prenom} ${d.nom}`) }
}

// ─────────────────────────────────────────────────────────────
// (2) Anniversaires des 7 prochains jours
// ─────────────────────────────────────────────────────────────
async function detecterAnniversaires(ctx: AgentContext) {
  const today = new Date()
  const dans7j = new Date(); dans7j.setDate(dans7j.getDate() + 7)

  // On ne peut pas filtrer SQL sur EXTRACT(month/day) facilement via PostgREST.
  // Approche : on charge tous les clients opt-in avec date_naissance et filtre côté JS.
  const { data: clients } = await ctx.supabase
    .from('clients')
    .select('id, prenom, nom, email, date_naissance')
    .eq('opt_in_marketing', true)
    .not('date_naissance', 'is', null)
    .not('email', 'is', null)

  type ClientAnniv = { id: string; prenom: string; nom: string; email: string; date_naissance: string }
  const aSouhaiter: Array<{ client: ClientAnniv; date: string; age: number }> = []
  for (const c of (clients ?? []) as ClientAnniv[]) {
    const dn = new Date(c.date_naissance)
    // Date d'anniversaire cette année
    const anniv = new Date(today.getFullYear(), dn.getMonth(), dn.getDate())
    if (anniv < today) anniv.setFullYear(today.getFullYear() + 1)
    if (anniv >= today && anniv <= dans7j) {
      aSouhaiter.push({ client: c, date: anniv.toISOString().slice(0, 10), age: anniv.getFullYear() - dn.getFullYear() })
    }
  }

  if (aSouhaiter.length > 0) {
    if (!(await findingDejaActif(ctx, 'anniversaires', { date: today.toISOString().slice(0, 10) }))) {
      await emitFinding(ctx, {
        urgence: 'jaune',
        type: 'anniversaires',
        titre: `${aSouhaiter.length} anniversaire(s) cette semaine`,
        message: aSouhaiter.slice(0, 5).map(a => `${a.client.prenom} ${a.client.nom} (${a.date} - ${a.age} ans)`).join(' · ') + (aSouhaiter.length > 5 ? '…' : ''),
        action_label: 'Lancer la campagne',
        action_url:   '/admin/clients/campagnes',
        data: { date: today.toISOString().slice(0, 10), nb: aSouhaiter.length, clients: aSouhaiter.slice(0, 20).map(a => a.client.id) },
      })
    }
  }
  return { nbCetteSemaine: aSouhaiter.length, exemples: aSouhaiter.slice(0, 5) }
}

// ─────────────────────────────────────────────────────────────
// (3) Avis publics non répondus (avis_publics statut=publie, reponse vide)
// ─────────────────────────────────────────────────────────────
async function detecterAvisNonRepondus(ctx: AgentContext) {
  const { data: avis } = await ctx.supabase
    .from('avis_publics')
    .select('id, source, note, titre, contenu, brouillon_reponse_ia, reponse, statut, created_at')
    .eq('statut', 'publie')
    .is('reponse', null)
    .order('created_at', { ascending: false })
  const liste = (avis ?? []) as Array<{ id: string; source: string; note: number; titre: string | null; contenu: string | null; brouillon_reponse_ia: string | null; reponse: string | null; statut: string; created_at: string }>
  for (const a of liste) {
    if (await findingDejaActif(ctx, 'avis_non_repondu', { avis_id: a.id })) continue
    const urgence: 'rouge' | 'jaune' = a.note <= 2 ? 'rouge' : 'jaune'
    await emitFinding(ctx, {
      urgence,
      type: 'avis_non_repondu',
      titre: `Avis ${a.source} non répondu (${a.note}/5)${a.titre ? ' — ' + a.titre.slice(0, 40) : ''}`,
      message: `${a.contenu ? a.contenu.slice(0, 200) + (a.contenu.length > 200 ? '…' : '') : ''}${a.brouillon_reponse_ia ? '\n\n📝 Brouillon IA prêt à valider.' : ''}`,
      action_label: a.brouillon_reponse_ia ? 'Valider la réponse' : 'Répondre',
      action_url:   '/admin/clients/avis',
      data: { avis_id: a.id, source: a.source, note: a.note, brouillon_pret: !!a.brouillon_reponse_ia },
    })
  }
  return { nbNonRepondus: liste.length }
}

// ─────────────────────────────────────────────────────────────
// (4) Réservations chambres imminentes sans confirmation envoyée
// ─────────────────────────────────────────────────────────────
async function detecterReservationsImminentes(ctx: AgentContext) {
  const today = new Date(); today.setHours(0, 0, 0, 0)
  const dans1j = new Date(today); dans1j.setDate(dans1j.getDate() + 1)
  const { data: resas } = await ctx.supabase
    .from('reservations_chambres')
    .select('id, client_nom, client_email, date_arrivee, statut, notes')
    .gte('date_arrivee', today.toISOString().slice(0, 10))
    .lte('date_arrivee', dans1j.toISOString().slice(0, 10))
    .not('statut', 'in', '(annule,non_honoree)')
  const liste = (resas ?? []) as Array<{ id: string; client_nom: string; client_email: string | null; date_arrivee: string; statut: string; notes: string | null }>

  let nb = 0
  for (const r of liste) {
    // Heuristique : on suppose qu'une confirmation a été envoyée si notes contient "confirmation"
    const dejaEnvoyee = r.notes && r.notes.toLowerCase().includes('confirmation')
    if (dejaEnvoyee) continue
    nb++
    if (await findingDejaActif(ctx, 'resa_sans_confirmation', { resa_id: r.id })) continue
    await emitFinding(ctx, {
      urgence: 'jaune',
      type: 'resa_sans_confirmation',
      titre: `Réservation ${r.client_nom} — arrivée ${r.date_arrivee} sans confirmation envoyée`,
      message: `Envoie un email/SMS de confirmation au client avec les infos d'accès et le rappel des règles.`,
      action_label: 'Voir la réservation',
      action_url:   '/admin/reservations',
      data: { resa_id: r.id, client: r.client_nom, date: r.date_arrivee },
    })
  }
  return { nb }
}

// ─────────────────────────────────────────────────────────────
// (5) Réclamations en attente > 48h
// ─────────────────────────────────────────────────────────────
async function detecterReclamationsAttente(ctx: AgentContext) {
  const seuil = new Date(Date.now() - SEUIL_RECLAMATION_HEURES * 3600_000)
  const { data: reclam } = await ctx.supabase
    .from('reclamations')
    .select('id, client_id, client:clients(prenom, nom), categorie, severite, statut, created_at')
    .not('statut', 'in', '(resolu,classe_sans_suite)')
    .lte('created_at', seuil.toISOString())

  type ReclamRow = { id: string; client_id: string | null; client: { prenom: string; nom: string } | Array<{ prenom: string; nom: string }> | null; categorie: string | null; severite: string | null; statut: string; created_at: string }
  const liste = (reclam ?? []) as ReclamRow[]
  for (const r of liste) {
    if (await findingDejaActif(ctx, 'reclamation_en_attente', { reclam_id: r.id })) continue
    const cl = Array.isArray(r.client) ? r.client[0] : r.client
    const clientNom = cl ? `${cl.prenom} ${cl.nom}` : 'Client'
    await emitFinding(ctx, {
      urgence: r.severite === 'grave' ? 'rouge' : 'jaune',
      type: 'reclamation_en_attente',
      titre: `Réclamation ${clientNom} sans réponse depuis > ${SEUIL_RECLAMATION_HEURES}h`,
      message: `Catégorie : ${r.categorie ?? '?'} · Sévérité : ${r.severite ?? '?'}. Réponds rapidement pour préserver la relation client.`,
      action_label: 'Voir la réclamation',
      action_url:   '/admin/clients/reclamations',
      data: { reclam_id: r.id, client: clientNom, severite: r.severite },
    })
  }
  return { nbAttente: liste.length }
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
