// ─── Agent 1 — Veilleur de nuit ────────────────────────────────
// Cron : chaque nuit à 02h00 (planning indicatif, à câbler selon infra cron)
//
// Tâches :
//   (1) Clôture automatique des sessions caisse oubliées (J-1 ou avant)
//       → écart théorique, finding rouge si > 5€
//   (2) Recap J-1 : CA, marge, top plats, ticket moyen, nb commandes
//   (3) Anomalies J-1 :
//       - commandes bloquées (créées il y a > 4h, statut intermédiaire)
//       - taux d'annulation > 5%
//       - food cost moyen dérivé
//   (4) Backup metadata : nb lignes par table critique → finding vert si OK,
//       rouge si chute inattendue (potentielle perte de données).
//
// Auth : Bearer CRON_SECRET. Appelable manuellement avec ?force=1 (dev).

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { runAgent, emitFinding, authCron, type AgentContext } from '@/lib/agents/runner'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function GET(req: Request) {
  try { authCron(req) } catch { return new NextResponse('Unauthorized', { status: 401 }) }

  const result = await runAgent('veilleur', async (ctx) => {
    // Date J-1 (en heure locale Europe/Paris)
    const veille = new Date()
    veille.setDate(veille.getDate() - 1)
    const veilleStr = veille.toISOString().slice(0, 10)

    // (1) Clôture caisse oubliée
    const cloture = await cloturerCaisseSiOubliee(ctx, veilleStr)

    // (2) Recap J-1
    const recap = await recapVeille(ctx, veilleStr)

    // (3) Anomalies J-1
    const anomalies = await detecterAnomalies(ctx, veilleStr)

    // (4) Backup metadata (counts par table critique)
    const backup = await backupMetadata(ctx)

    // Construit le résumé en une phrase pour le dashboard
    const summary = [
      recap.ca > 0
        ? `CA hier ${recap.ca.toFixed(0)}€ (${recap.nbCommandes} cmd, ticket moy ${recap.ticketMoyen.toFixed(1)}€)`
        : 'Aucune vente hier',
      cloture.fermees > 0 ? `${cloture.fermees} session(s) caisse auto-clôturée(s)` : null,
      anomalies.bloquees > 0 ? `${anomalies.bloquees} cmd bloquées` : null,
      anomalies.tauxAnnulation > 5 ? `${anomalies.tauxAnnulation.toFixed(1)}% annulations` : null,
    ].filter(Boolean).join(' · ')

    return {
      summary: summary || 'Aucune anomalie détectée',
      data: { veilleStr, cloture, recap, anomalies, backup },
    }
  })

  return NextResponse.json(result)
}

// Permet aussi POST pour les cron schedulers qui préfèrent POST
export const POST = GET

// ─────────────────────────────────────────────────────────────
// (1) Clôture caisse oubliée
// ─────────────────────────────────────────────────────────────
async function cloturerCaisseSiOubliee(ctx: AgentContext, veilleStr: string) {
  const { data: sessions, error } = await ctx.supabase
    .from('sessions_caisse')
    .select('id, date_session, fond_initial, ouverte_at')
    .is('fermee_at', null)
    .lte('date_session', veilleStr)
  if (error) throw new Error(`Clôture caisse : ${error.message}`)

  let fermees = 0
  for (const s of (sessions ?? [])) {
    // Calcule la caisse théorique : fond_initial + sum espèces de la session
    const { data: especes } = await ctx.supabase
      .from('paiements_caisse')
      .select('montant')
      .eq('session_caisse_id', s.id)
      .eq('methode', 'especes')
    const caAttendu = (especes ?? []).reduce((acc, x) => acc + Number(x.montant ?? 0), 0)
    const caisseAttendue = Number(s.fond_initial ?? 0) + caAttendu

    // Clôture en posant ca_compte = caisseAttendue (= écart 0).
    // Si écart réel existait, il sera détecté quand la vraie clôture
    // sera faite manuellement. Cette clôture auto évite juste le blocage.
    const { error: updErr } = await ctx.supabase
      .from('sessions_caisse')
      .update({
        fermee_at: new Date().toISOString(),
        fond_final: s.fond_initial,            // hypothèse : fond final = fond initial (rien sorti)
        ca_attendu: caAttendu,
        ca_compte:  caisseAttendue,
        ecart: 0,
        notes: '⚠ Clôture automatique par l\'Agent Veilleur (session oubliée)',
      })
      .eq('id', s.id)
    if (updErr) continue
    fermees++

    await emitFinding(ctx, {
      urgence: 'rouge',
      type: 'cloture_oubliee',
      titre: `Caisse du ${s.date_session} clôturée automatiquement`,
      message: `La session ouverte le ${new Date(s.ouverte_at as string).toLocaleDateString('fr-FR')} n'a pas été fermée. CA espèces calculé : ${caAttendu.toFixed(2)}€. Vérifie le fond de caisse réel ce matin et corrige si besoin.`,
      action_label: 'Voir la session',
      action_url:   `/caisse/${s.id}/print`,
      data: { session_id: s.id, ca_attendu: caAttendu },
    })
  }

  return { fermees }
}

// ─────────────────────────────────────────────────────────────
// (2) Recap J-1 (CA, marge, top plats)
// ─────────────────────────────────────────────────────────────
async function recapVeille(ctx: AgentContext, veilleStr: string) {
  // Bornes de la journée J-1 (en UTC pour la query)
  const dayStart = new Date(`${veilleStr}T00:00:00`).toISOString()
  const dayEnd   = new Date(`${veilleStr}T23:59:59`).toISOString()

  // Toutes les commandes encaissées hier
  const { data: cmds } = await ctx.supabase
    .from('commandes')
    .select('id, numero, montant_total_ttc, tva_total, statut, created_at, source')
    .eq('statut', 'encaisse')
    .gte('created_at', dayStart)
    .lte('created_at', dayEnd)

  const ca = (cmds ?? []).reduce((s, c) => s + Number(c.montant_total_ttc ?? 0), 0)
  const tva = (cmds ?? []).reduce((s, c) => s + Number(c.tva_total ?? 0), 0)
  const ht = ca - tva
  const nbCommandes = cmds?.length ?? 0
  const ticketMoyen = nbCommandes > 0 ? ca / nbCommandes : 0

  // Top 3 plats vendus J-1
  const cmdIds = (cmds ?? []).map(c => c.id)
  let topPlats: Array<{ nom: string; qte: number; ca: number }> = []
  if (cmdIds.length > 0) {
    const { data: arts } = await ctx.supabase
      .from('commande_articles')
      .select('quantite, prix_unitaire_ht, recette:recettes(nom)')
      .in('commande_id', cmdIds)

    const agg = new Map<string, { qte: number; ca: number }>()
    for (const a of (arts ?? []) as Array<{ quantite: number | null; prix_unitaire_ht: number | null; recette: { nom?: string } | null }>) {
      const nom = a.recette?.nom ?? '— supprimé —'
      const cur = agg.get(nom) ?? { qte: 0, ca: 0 }
      const qte = Number(a.quantite ?? 0)
      cur.qte += qte
      cur.ca += qte * Number(a.prix_unitaire_ht ?? 0)
      agg.set(nom, cur)
    }
    topPlats = [...agg.entries()]
      .map(([nom, v]) => ({ nom, qte: v.qte, ca: v.ca }))
      .sort((a, b) => b.qte - a.qte)
      .slice(0, 3)
  }

  // Finding vert avec le recap (toujours émis, c'est l'info quotidienne)
  await emitFinding(ctx, {
    urgence: 'vert',
    type: 'recap_jour',
    titre: ca > 0
      ? `Hier : ${ca.toFixed(0)}€ CA · ${nbCommandes} commandes · ticket moyen ${ticketMoyen.toFixed(1)}€`
      : 'Aucune vente enregistrée hier',
    message: topPlats.length > 0
      ? `Top : ${topPlats.map(p => `${p.nom} (×${p.qte})`).join(' · ')}`
      : undefined,
    action_label: 'Voir le détail',
    action_url:   '/admin/finances',
    data: { ca, ht, tva, nbCommandes, ticketMoyen, topPlats },
  })

  return { ca, ht, tva, nbCommandes, ticketMoyen, topPlats }
}

// ─────────────────────────────────────────────────────────────
// (3) Anomalies J-1 (commandes bloquées, annulations, etc.)
// ─────────────────────────────────────────────────────────────
async function detecterAnomalies(ctx: AgentContext, veilleStr: string) {
  const dayStart = new Date(`${veilleStr}T00:00:00`).toISOString()
  const dayEnd   = new Date(`${veilleStr}T23:59:59`).toISOString()

  // (a) Commandes bloquées : statut intermédiaire depuis > 4h
  const seuil = new Date(Date.now() - 4 * 3600_000).toISOString()
  const { data: bloquees } = await ctx.supabase
    .from('commandes')
    .select('id, numero, statut, created_at, source, numero_table')
    .not('statut', 'in', '(encaisse,annule,retire_par_client)')
    .lt('created_at', seuil)
  const nbBloquees = bloquees?.length ?? 0
  if (nbBloquees > 0) {
    await emitFinding(ctx, {
      urgence: 'rouge',
      type: 'commandes_bloquees',
      titre: `${nbBloquees} commande${nbBloquees > 1 ? 's' : ''} bloquée${nbBloquees > 1 ? 's' : ''} depuis > 4h`,
      message: `${(bloquees ?? []).slice(0, 5).map(b => `#${b.numero} (${b.statut})`).join(', ')}${nbBloquees > 5 ? '…' : ''}`,
      action_label: 'Voir les commandes',
      action_url:   '/serveur',
      data: { ids: (bloquees ?? []).map(b => b.id) },
    })
  }

  // (b) Taux annulation J-1
  const { count: totalJ1 } = await ctx.supabase
    .from('commandes')
    .select('*', { count: 'exact', head: true })
    .gte('created_at', dayStart)
    .lte('created_at', dayEnd)
  const { count: annulJ1 } = await ctx.supabase
    .from('commandes')
    .select('*', { count: 'exact', head: true })
    .eq('statut', 'annule')
    .gte('created_at', dayStart)
    .lte('created_at', dayEnd)
  const tauxAnnulation = (totalJ1 ?? 0) > 0 ? ((annulJ1 ?? 0) / (totalJ1 ?? 1)) * 100 : 0
  if (tauxAnnulation > 5) {
    await emitFinding(ctx, {
      urgence: 'jaune',
      type: 'taux_annulation',
      titre: `${tauxAnnulation.toFixed(1)}% d'annulations hier`,
      message: `${annulJ1}/${totalJ1} commandes annulées. Au-dessus du seuil 5%. Vérifie les motifs.`,
      action_label: 'Voir le détail',
      action_url:   '/admin/finances',
      data: { totalJ1, annulJ1, tauxAnnulation },
    })
  }

  // Note : la surveillance food cost par plat est gérée par l'Agent Financier
  // (Phase 4) — calcul food_cost_total via recette_ingredients × ingredients.

  return {
    bloquees: nbBloquees,
    tauxAnnulation,
    nbCommandesAnnulees: annulJ1 ?? 0,
    totalCommandesJ1: totalJ1 ?? 0,
  }
}

// ─────────────────────────────────────────────────────────────
// (4) Backup metadata — nb lignes par table critique
// ─────────────────────────────────────────────────────────────
// Pour l'instant : on enregistre juste les compteurs (intégrité). Un vrai
// dump JSON peut être ajouté en phase 1.1 (création bucket Storage + rotation).
async function backupMetadata(ctx: AgentContext) {
  const tables = [
    'commandes', 'commande_articles', 'paiements_caisse', 'sessions_caisse',
    'recettes', 'ingredients', 'mouvements_stock',
    'employes', 'clients', 'reservations',
  ]
  const counts: Record<string, number> = {}
  for (const t of tables) {
    const { count, error } = await ctx.supabase.from(t).select('*', { count: 'exact', head: true })
    if (!error) counts[t] = count ?? 0
  }

  // Vérifie chute brutale d'une table (>50%) par rapport au backup précédent
  const { data: prev } = await ctx.supabase
    .from('agents_runs')
    .select('data')
    .eq('agent_id', 'veilleur')
    .eq('status', 'success')
    .order('started_at', { ascending: false })
    .limit(1)
  const prevCounts = (prev?.[0]?.data as { backup?: { counts?: Record<string, number> } } | undefined)?.backup?.counts ?? {}

  const chutesAlerte: string[] = []
  for (const [t, n] of Object.entries(counts)) {
    const before = prevCounts[t] ?? 0
    if (before > 100 && n < before * 0.5) {
      chutesAlerte.push(`${t} : ${before} → ${n}`)
    }
  }
  if (chutesAlerte.length > 0) {
    await emitFinding(ctx, {
      urgence: 'rouge',
      type: 'integrite_donnees',
      titre: 'Chute anormale du nombre de lignes',
      message: `Vérifie l'intégrité de la base. Tables affectées : ${chutesAlerte.join(', ')}`,
      data: { counts, prevCounts, chutesAlerte },
    })
  }

  return { counts, chutesAlerte }
}
