// ─── Agent 9 — Conseiller stratégique ──────────────────────────
// Cron : chaque lundi à 07h00.
//
// Synthèse hebdomadaire propulsée par Claude (haiku-4-5) :
//   1. KPIs semaine écoulée (CA, marge, food cost, nb couverts, ticket moy)
//   2. Comparaison semaine N-1
//   3. Pull des findings urgents (rouges) des autres agents
//   4. Appel Claude avec données structurées → 3 opportunités prioritaires
//   5. Stocké comme finding vert + data détaillée (consultable dans dashboard)
//
// Coût : ~$0.003 par run hebdo (claude-haiku-4-5).
//
// Auth : Bearer CRON_SECRET. Manuel : GET /api/cron/agents/strategique

import { NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { runAgent, emitFinding, authCron, type AgentContext } from '@/lib/agents/runner'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

const MODEL = 'claude-haiku-4-5'

export async function GET(req: Request) {
  try { authCron(req) } catch { return new NextResponse('Unauthorized', { status: 401 }) }

  const result = await runAgent('strategique', async (ctx) => {
    // (1) Calcul KPIs semaine courante (7 derniers jours) vs précédente
    const kpis = await calculerKpisSemaine(ctx)

    // (2) Top findings actifs des autres agents
    const topFindings = await chargerTopFindings(ctx)

    // (3) Appel Claude pour synthèse
    const synthese = await synthetiserAvecClaude(kpis, topFindings)

    // (4) Émission du finding hebdo (toujours, c'est le rapport du lundi)
    await emitFinding(ctx, {
      urgence: synthese.urgenceGlobale,
      type: 'bilan_hebdo',
      titre: `📊 Bilan de la semaine — ${synthese.titreCourt}`,
      message: synthese.opportunites.map((o, i) => `${i + 1}. ${o}`).join('\n'),
      action_label: 'Voir le détail',
      action_url:   '/admin/pilotage',
      data: { kpis, topFindings: topFindings.slice(0, 10), synthese },
    })

    const summary = `Bilan hebdo : ${synthese.titreCourt} · ${synthese.opportunites.length} opportunité(s) identifiée(s)`

    return { summary, data: { kpis, synthese, usage: synthese.usage } }
  })

  return NextResponse.json(result)
}

export const POST = GET

// ─────────────────────────────────────────────────────────────
// (1) KPIs hebdomadaires
// ─────────────────────────────────────────────────────────────
async function calculerKpisSemaine(ctx: AgentContext) {
  const now = new Date()
  const sem0Debut = new Date(now); sem0Debut.setDate(sem0Debut.getDate() - 7); sem0Debut.setHours(0, 0, 0, 0)
  const sem0Fin   = now
  const sem1Debut = new Date(now); sem1Debut.setDate(sem1Debut.getDate() - 14); sem1Debut.setHours(0, 0, 0, 0)
  const sem1Fin   = new Date(sem0Debut.getTime() - 1)

  async function snapshot(debut: Date, fin: Date) {
    const { data: cmds } = await ctx.supabase
      .from('commandes')
      .select('id, montant_total_ttc, tva_total, source')
      .eq('statut', 'encaisse')
      .gte('created_at', debut.toISOString())
      .lte('created_at', fin.toISOString())
    const ca = (cmds ?? []).reduce((s, c) => s + Number(c.montant_total_ttc ?? 0), 0)
    const nb = cmds?.length ?? 0
    return { ca, nb, ticket: nb > 0 ? ca / nb : 0 }
  }

  const semCourante  = await snapshot(sem0Debut, sem0Fin)
  const semPrec      = await snapshot(sem1Debut, sem1Fin)

  const variationCA = semPrec.ca > 0 ? ((semCourante.ca - semPrec.ca) / semPrec.ca) * 100 : 0
  const variationNb = semPrec.nb > 0 ? ((semCourante.nb - semPrec.nb) / semPrec.nb) * 100 : 0
  const variationTk = semPrec.ticket > 0 ? ((semCourante.ticket - semPrec.ticket) / semPrec.ticket) * 100 : 0

  return {
    periode: { debut: sem0Debut.toISOString().slice(0, 10), fin: sem0Fin.toISOString().slice(0, 10) },
    semaine: semCourante,
    semaine_precedente: semPrec,
    variations: { ca_pct: variationCA, nb_pct: variationNb, ticket_pct: variationTk },
  }
}

// ─────────────────────────────────────────────────────────────
// (2) Top findings actifs des autres agents
// ─────────────────────────────────────────────────────────────
async function chargerTopFindings(ctx: AgentContext) {
  const { data: findings } = await ctx.supabase
    .from('agent_findings')
    .select('agent_id, urgence, type, titre, message')
    .eq('resolu', false)
    .not('agent_id', 'eq', 'strategique')
    .order('urgence', { ascending: true })   // rouge < jaune < vert
    .order('created_at', { ascending: false })
    .limit(15)
  return (findings ?? []) as Array<{ agent_id: string; urgence: string; type: string; titre: string; message: string | null }>
}

// ─────────────────────────────────────────────────────────────
// (3) Appel Claude pour synthèse
// ─────────────────────────────────────────────────────────────
type SyntheseClaude = {
  titreCourt: string                // ex: "CA en hausse de 12%, food cost à surveiller"
  opportunites: string[]            // 1-3 phrases concrètes et actionnables
  urgenceGlobale: 'rouge' | 'jaune' | 'vert'
  usage?: { input_tokens: number; output_tokens: number }
}

async function synthetiserAvecClaude(
  kpis: Awaited<ReturnType<typeof calculerKpisSemaine>>,
  topFindings: Awaited<ReturnType<typeof chargerTopFindings>>,
): Promise<SyntheseClaude> {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    // Mode dégradé sans Claude : synthèse basique algorithmique
    return syntheseFallback(kpis, topFindings)
  }

  const client = new Anthropic({ apiKey })

  const findingsTxt = topFindings.length > 0
    ? topFindings.slice(0, 10).map(f => `- [${f.urgence}] ${f.agent_id} : ${f.titre}`).join('\n')
    : '(aucun finding actif)'

  const userContent = `KPIs semaine écoulée (${kpis.periode.debut} → ${kpis.periode.fin}) :
- CA TTC : ${kpis.semaine.ca.toFixed(2)} € (${kpis.variations.ca_pct >= 0 ? '+' : ''}${kpis.variations.ca_pct.toFixed(1)}% vs semaine précédente)
- Nombre de commandes : ${kpis.semaine.nb} (${kpis.variations.nb_pct >= 0 ? '+' : ''}${kpis.variations.nb_pct.toFixed(1)}%)
- Ticket moyen : ${kpis.semaine.ticket.toFixed(2)} € (${kpis.variations.ticket_pct >= 0 ? '+' : ''}${kpis.variations.ticket_pct.toFixed(1)}%)

Semaine précédente : ${kpis.semaine_precedente.ca.toFixed(0)}€ / ${kpis.semaine_precedente.nb} cmd

Alertes actives des autres agents :
${findingsTxt}

Donne-moi en JSON strict :
{
  "titreCourt": "1 phrase max 60 caractères qui résume la semaine",
  "opportunites": ["3 actions concrètes prioritaires, chiffrées, exécutables cette semaine"],
  "urgenceGlobale": "rouge|jaune|vert"
}

Sois directif, pragmatique, jamais évasif. Style chef de cuisine : pas de blabla.`

  try {
    const resp = await client.messages.create({
      model: MODEL,
      max_tokens: 1000,
      system: 'Tu es le bras droit stratégique d\'un patron de restaurant indépendant français. Tu réponds toujours en JSON strict, en français, sans préambule. Tu analyses ses chiffres et tu lui dis quoi faire concrètement cette semaine pour gagner plus, réduire les coûts, fidéliser. Tu cites des chiffres précis.',
      messages: [{ role: 'user', content: userContent }],
    })

    const textBlock = resp.content.find(c => c.type === 'text')
    const raw = (textBlock && 'text' in textBlock ? textBlock.text : '').trim()
    // Extrait le JSON même si Claude met du texte autour
    const jsonMatch = raw.match(/\{[\s\S]*\}/)
    if (!jsonMatch) throw new Error('Pas de JSON dans la réponse Claude')
    const parsed = JSON.parse(jsonMatch[0]) as Partial<SyntheseClaude>

    return {
      titreCourt: parsed.titreCourt ?? 'Bilan hebdo',
      opportunites: Array.isArray(parsed.opportunites) ? parsed.opportunites.slice(0, 3) : [],
      urgenceGlobale: (parsed.urgenceGlobale === 'rouge' || parsed.urgenceGlobale === 'jaune') ? parsed.urgenceGlobale : 'vert',
      usage: { input_tokens: resp.usage.input_tokens, output_tokens: resp.usage.output_tokens },
    }
  } catch (e) {
    console.error('[agents/strategique] Claude error, fallback:', e)
    return syntheseFallback(kpis, topFindings)
  }
}

function syntheseFallback(
  kpis: Awaited<ReturnType<typeof calculerKpisSemaine>>,
  topFindings: Awaited<ReturnType<typeof chargerTopFindings>>,
): SyntheseClaude {
  const opportunites: string[] = []
  if (kpis.variations.ca_pct < -10) {
    opportunites.push(`CA en baisse de ${kpis.variations.ca_pct.toFixed(1)}% — analyse la météo, les jours faibles, et lance une campagne pour ramener du flux.`)
  } else if (kpis.variations.ca_pct > 10) {
    opportunites.push(`Belle semaine (+${kpis.variations.ca_pct.toFixed(1)}%). Renforce les stocks pour ne pas casser la dynamique.`)
  }
  const rouges = topFindings.filter(f => f.urgence === 'rouge')
  if (rouges.length > 0) {
    opportunites.push(`Traite en priorité les ${rouges.length} alerte(s) rouge(s) : ${rouges.slice(0, 3).map(f => f.titre).join(' · ')}.`)
  }
  if (kpis.variations.ticket_pct < -5) {
    opportunites.push(`Ticket moyen en baisse de ${Math.abs(kpis.variations.ticket_pct).toFixed(1)}% — propose des entrées + desserts à l'oral, optimise l'upsell.`)
  }
  if (opportunites.length === 0) opportunites.push('Semaine stable. Continue sur cette dynamique.')

  return {
    titreCourt: `CA ${kpis.variations.ca_pct >= 0 ? '+' : ''}${kpis.variations.ca_pct.toFixed(1)}% vs semaine précédente`,
    opportunites: opportunites.slice(0, 3),
    urgenceGlobale: rouges.length > 0 || kpis.variations.ca_pct < -15 ? 'rouge' : kpis.variations.ca_pct < -5 ? 'jaune' : 'vert',
  }
}
