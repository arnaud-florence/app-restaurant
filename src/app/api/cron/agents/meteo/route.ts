// ─── Agent 2 — Météorologue ─────────────────────────────────
// Cron : chaque matin à 06h00.
//
// Réutilise tout l'infra Module 22 (OWM + régression CA), ajoute :
//   (1) Import auto OWM (clé requise dans /admin/setup)
//   (2) Calcul prévision CA 7 jours (basée sur historique 60j × météo)
//   (3) Suggestions STOCK : majoration / réduction par jour selon impact météo
//   (4) Suggestions RH : effectif suggéré par jour (vs effectif moyen historique)
//   (5) Suggestions PLATS DU JOUR adaptés météo (chaud → frais, froid → mijotés)
//   (6) Brief matin consolidé → finding vert + push notif gérant
//
// Auth : Bearer CRON_SECRET. Manuel : GET /api/cron/agents/meteo

import { NextResponse } from 'next/server'
import { runAgent, emitFinding, authCron, type AgentContext } from '@/lib/agents/runner'
import {
  caMoyenParJourSemaine, panierMoyen, previsionSemaine, CONDITION_INFO,
  type ConditionMeteo, type PrevisionJour,
} from '@/lib/previsionnel'
import { importerPrevisionsOWM } from '@/app/admin/previsionnel/actions'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

const JOURS_FR = ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi']

export async function GET(req: Request) {
  try { authCron(req) } catch { return new NextResponse('Unauthorized', { status: 401 }) }

  const result = await runAgent('meteo', async (ctx) => {
    // (1) Import OWM si clé configurée — non bloquant si échec
    let owmStatus: { ok: boolean; nb_jours?: number; raison?: string } = { ok: false }
    try {
      const r = await importerPrevisionsOWM()
      owmStatus = r.ok ? { ok: true, nb_jours: r.nb_jours } : { ok: false, raison: r.raison }
    } catch (e) {
      owmStatus = { ok: false, raison: e instanceof Error ? e.message : 'erreur OWM' }
    }
    if (!owmStatus.ok) {
      await emitFinding(ctx, {
        urgence: 'jaune',
        type: 'meteo_owm_indispo',
        titre: 'Météo automatique indisponible',
        message: owmStatus.raison ?? 'Configure ta clé OpenWeatherMap dans /admin/setup pour activer les prévisions.',
        action_label: 'Configurer',
        action_url:   '/admin/setup',
      })
    }

    // (2) Charge historique CA 60j depuis commandes (group by date)
    const dDebut = new Date()
    dDebut.setDate(dDebut.getDate() - 60)
    const { data: cmds } = await ctx.supabase
      .from('commandes')
      .select('created_at, montant_total_ttc')
      .eq('statut', 'encaisse')
      .gte('created_at', dDebut.toISOString())
    const histoMap = new Map<string, { ca: number; nb: number }>()
    for (const c of (cmds ?? []) as Array<{ created_at: string; montant_total_ttc: number | null }>) {
      const d = c.created_at.slice(0, 10)
      const cur = histoMap.get(d) ?? { ca: 0, nb: 0 }
      cur.ca += Number(c.montant_total_ttc ?? 0)
      cur.nb += 1
      histoMap.set(d, cur)
    }
    const historique = [...histoMap.entries()].map(([date, v]) => ({ date, ca: v.ca, nb_commandes: v.nb }))

    // (3) Charge prévisions météo des 7 prochains jours
    const today = new Date()
    const todayStr = today.toISOString().slice(0, 10)
    const dans7Date = new Date(today)
    dans7Date.setDate(dans7Date.getDate() + 7)
    const dans7Str = dans7Date.toISOString().slice(0, 10)

    const { data: meteoFuture } = await ctx.supabase
      .from('releves_meteo')
      .select('date_meteo, conditions')
      .eq('est_prevision', true)
      .gte('date_meteo', todayStr)
      .lte('date_meteo', dans7Str)
      .order('date_meteo')
    const meteo = (meteoFuture ?? []).map(m => ({
      date: m.date_meteo as string,
      conditions: m.conditions as ConditionMeteo,
    }))

    // (4) Calcul prévision 7 jours via Module 22
    const prevision = previsionSemaine(historique, meteo, today)
    const caMoyens = caMoyenParJourSemaine(historique)
    const panierMoy = panierMoyen(historique)

    // (5) Suggestions par jour : stock, RH, plats du jour
    const suggestionsParJour = prevision.map(p => construireSuggestionsJour(p, caMoyens[p.jour_semaine]))

    // (6) Émission findings
    let nbAlertesRouges = 0
    let nbAlertesJaunes = 0
    for (const sug of suggestionsParJour) {
      if (sug.urgence === 'rouge') nbAlertesRouges++
      else if (sug.urgence === 'jaune') nbAlertesJaunes++
      if (sug.urgence === 'vert') continue   // pas de findings sur jours normaux (sauf brief global)
      await emitFinding(ctx, {
        urgence: sug.urgence,
        type:    sug.type,
        titre:   sug.titre,
        message: sug.message,
        action_label: 'Voir prévisionnel',
        action_url:   '/admin/previsionnel',
        data: { date: sug.date, prevision: sug.prevision, suggestions: sug.suggestions },
      })
    }

    // (7) Brief matin consolidé (toujours émis = ligne dashboard quotidienne)
    const totalCAPrevu = prevision.reduce((s, p) => s + p.ca_prevision, 0)
    const totalCABase = prevision.reduce((s, p) => s + p.ca_base, 0)
    const ecartPct = totalCABase > 0 ? ((totalCAPrevu - totalCABase) / totalCABase) * 100 : 0

    const briefLignes: string[] = []
    briefLignes.push(`CA semaine prévu : ${Math.round(totalCAPrevu)}€ (${ecartPct >= 0 ? '+' : ''}${ecartPct.toFixed(1)}% vs moyenne)`)
    const meilleurJour = [...prevision].sort((a, b) => b.ca_prevision - a.ca_prevision)[0]
    const pireJour    = [...prevision].sort((a, b) => a.ca_prevision - b.ca_prevision)[0]
    if (meilleurJour) briefLignes.push(`📈 Top : ${JOURS_FR[meilleurJour.jour_semaine]} ${meilleurJour.date.slice(8)} (${Math.round(meilleurJour.ca_prevision)}€ ${meilleurJour.meteo ? CONDITION_INFO[meilleurJour.meteo].emoji : ''})`)
    if (pireJour && pireJour.date !== meilleurJour?.date) briefLignes.push(`📉 Bas : ${JOURS_FR[pireJour.jour_semaine]} ${pireJour.date.slice(8)} (${Math.round(pireJour.ca_prevision)}€ ${pireJour.meteo ? CONDITION_INFO[pireJour.meteo].emoji : ''})`)

    const urgenceBrief: 'rouge' | 'jaune' | 'vert' = nbAlertesRouges > 0 ? 'rouge' : nbAlertesJaunes > 0 ? 'jaune' : 'vert'
    await emitFinding(ctx, {
      urgence: urgenceBrief,
      type: 'brief_matin',
      titre: '🌤️ Brief du matin',
      message: briefLignes.join(' · '),
      action_label: 'Voir les prévisions',
      action_url:   '/admin/previsionnel',
      data: { totalCAPrevu, totalCABase, ecartPct, prevision, suggestionsParJour, panierMoy, owmStatus },
    })

    const summary = nbAlertesRouges > 0 || nbAlertesJaunes > 0
      ? `${nbAlertesRouges + nbAlertesJaunes} alerte(s) météo · CA semaine ${ecartPct >= 0 ? '+' : ''}${ecartPct.toFixed(0)}%`
      : `Semaine prévue ${Math.round(totalCAPrevu)}€ (${ecartPct >= 0 ? '+' : ''}${ecartPct.toFixed(1)}% vs moyenne)`

    return { summary, data: { totalCAPrevu, ecartPct, prevision, suggestionsParJour, owmStatus } }
  })

  return NextResponse.json(result)
}

export const POST = GET

// ─────────────────────────────────────────────────────────────
// Suggestions stock / RH / plats du jour selon météo
// ─────────────────────────────────────────────────────────────
type SuggestionJour = {
  date: string
  urgence: 'rouge' | 'jaune' | 'vert'
  type: string
  titre: string
  message: string
  prevision: PrevisionJour
  suggestions: {
    stock: string         // "+30%" ou "-20%"
    rh: string            // "+1 serveur" ou "-1 cuisinier"
    plats: string[]       // ["Salades", "Boissons fraîches"]
  }
}

function construireSuggestionsJour(p: PrevisionJour, caBase: number): SuggestionJour {
  const impactPct = caBase > 0 ? ((p.ca_prevision - caBase) / caBase) * 100 : 0
  const ecartCouverts = p.nb_couverts_prevu - Math.round(caBase / (p.panier_moyen || 1))

  // Suggestions plats du jour selon météo
  const plats: string[] = []
  if (p.meteo) {
    switch (p.meteo) {
      case 'ensoleille':
      case 'peu_nuageux':
        plats.push('Salades fraîches', 'Tartares', 'Boissons rafraîchissantes', 'Desserts glacés')
        break
      case 'nuageux':
        plats.push('Plats classiques', 'Plats de saison')
        break
      case 'pluie_legere':
      case 'pluie_forte':
      case 'brouillard':
        plats.push('Plats mijotés', 'Soupes chaudes', 'Boissons chaudes', 'Desserts chocolat')
        break
      case 'neige':
      case 'orage':
        plats.push('Plats réconfortants', 'Fondues', 'Vins chauds')
        break
    }
  }

  // Suggestion stock
  const stock = impactPct >= 0 ? `+${impactPct.toFixed(0)}%` : `${impactPct.toFixed(0)}%`

  // Suggestion RH (simplifiée : 1 personne par ~10 couverts d'écart)
  let rh = 'Effectif normal'
  if (ecartCouverts >= 10) rh = `+${Math.ceil(ecartCouverts / 10)} personne${Math.ceil(ecartCouverts / 10) > 1 ? 's' : ''} sur ce service`
  else if (ecartCouverts <= -10) rh = `${Math.floor(ecartCouverts / 10)} personne${Math.abs(Math.floor(ecartCouverts / 10)) > 1 ? 's' : ''} possible (jour calme)`

  // Urgence selon alerte météo
  let urgence: 'rouge' | 'jaune' | 'vert' = 'vert'
  let titre = ''
  let type = 'meteo_jour'
  const jourLabel = `${JOURS_FR[p.jour_semaine]} ${p.date.slice(8)}`
  const meteoLabel = p.meteo ? `${CONDITION_INFO[p.meteo].emoji} ${CONDITION_INFO[p.meteo].label}` : 'météo inconnue'

  if (p.alerte === 'critique') {
    urgence = 'rouge'
    type = 'meteo_critique'
    titre = `${jourLabel} : ${meteoLabel} — CA prévu ${Math.round(p.ca_prevision)}€ (${impactPct.toFixed(0)}%)`
  } else if (p.alerte === 'faible') {
    urgence = 'jaune'
    type = 'meteo_faible'
    titre = `${jourLabel} : ${meteoLabel} — CA prévu ${Math.round(p.ca_prevision)}€ (${impactPct.toFixed(0)}%)`
  } else if (p.alerte === 'forte') {
    urgence = 'jaune'
    type = 'meteo_opportunite'
    titre = `${jourLabel} : ${meteoLabel} — CA prévu +${impactPct.toFixed(0)}% (${Math.round(p.ca_prevision)}€)`
  } else {
    urgence = 'vert'
    titre = `${jourLabel} : ${meteoLabel} — CA prévu ${Math.round(p.ca_prevision)}€`
  }

  const messageParts = [
    `📦 Stock : ${stock} vs normale`,
    `👥 RH : ${rh}`,
    plats.length > 0 ? `🍽 Plats suggérés : ${plats.slice(0, 3).join(', ')}` : null,
  ].filter(Boolean)

  return {
    date: p.date,
    urgence, type, titre,
    message: messageParts.join(' · '),
    prevision: p,
    suggestions: { stock, rh, plats },
  }
}
