// Co-gérant « Arnaud » · Le mot du matin (pour le gérant).
// Résume hier + les 3 priorités du jour, dans le ton d'Arnaud (simple/clair/efficace).
// Lit les vraies données, demande à Claude le brief, le persiste dans `parametres`.
// Côté serveur uniquement.

import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@/lib/supabase/server'
import { getContexteResto } from './propositions'

export type BriefDuJour = { date: string; hier: string; priorites: string[]; mot: string }

export async function genererBriefDuJour(): Promise<BriefDuJour> {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY manquante')
  const sb = await createClient()

  const dayStart = new Date(); dayStart.setHours(0, 0, 0, 0)
  const yStart = new Date(dayStart); yStart.setDate(yStart.getDate() - 1)
  const isoDay = dayStart.toISOString()
  const isoYStart = yStart.toISOString()

  const [caHierRes, enCoursRes, propsRes, findRes, stockRes, eqRes, nomRow] = await Promise.all([
    sb.from('commandes').select('montant_total_ttc').eq('statut', 'encaisse').gte('created_at', isoYStart).lt('created_at', isoDay),
    sb.from('commandes').select('id', { count: 'exact', head: true }).in('statut', ['en_attente', 'en_preparation', 'pret', 'servi']),
    sb.from('propositions').select('id', { count: 'exact', head: true }).in('statut', ['proposee', 'en_discussion']),
    sb.from('agent_findings').select('urgence, titre').eq('resolu', false).order('created_at', { ascending: false }).limit(12),
    sb.from('ingredients').select('stock_actuel, stock_minimum').eq('actif', true),
    sb.from('employes').select('id', { count: 'exact', head: true }).eq('actif', true),
    sb.from('parametres').select('valeur').eq('cle', 'etablissement_nom').maybeSingle(),
  ])

  const caHier = (caHierRes.data ?? []).reduce((s, c) => s + Number(c.montant_total_ttc ?? 0), 0)
  const nbHier = (caHierRes.data ?? []).length
  const nbEnCours = enCoursRes.count ?? 0
  const nbProps = propsRes.count ?? 0
  const findings = findRes.data ?? []
  const nbRouges = findings.filter(f => f.urgence === 'rouge').length
  const stock = stockRes.data ?? []
  const ruptures = stock.filter(i => Number(i.stock_actuel) <= 0).length
  const stockBas = stock.filter(i => Number(i.stock_actuel) > 0 && Number(i.stock_actuel) <= Number(i.stock_minimum)).length
  const nbEquipe = eqRes.count ?? 0
  const restoNom = (nomRow.data?.valeur as string | null) ?? 'CASATASIA'
  const ctx = await getContexteResto()

  const signaux = [
    `CA d'hier : ${caHier.toFixed(0)} € (${nbHier} commandes)`,
    `Commandes en cours : ${nbEnCours}`,
    `Propositions en attente de ta validation : ${nbProps}`,
    `Alertes agents : ${findings.length} (${nbRouges} urgentes)`,
    ruptures ? `Ruptures de stock : ${ruptures}` : '',
    stockBas ? `Stocks bas : ${stockBas}` : '',
    `Équipe active : ${nbEquipe}`,
    findings.length ? `Sujets remontés : ${findings.slice(0, 6).map(f => f.titre).join(' / ')}` : '',
  ].filter(Boolean).join('\n')

  const prompt = `Tu es Arnaud, le gérant de "${restoNom}" (${ctx.cg_concept || 'restaurant'}). Tu écris ton mot du matin pour toi-même — ton bras droit te brieffe. Ton : SIMPLE, CLAIR, EFFICACE. Court, direct, zéro blabla, tutoiement.

Données du jour :
${signaux}

Donne :
- "hier" : 1 phrase courte sur hier.
- "priorites" : les 3 choses à faire aujourd'hui, par ordre d'importance (phrases très courtes, actionnables).
- "mot" : 1 phrase d'accroche / d'humeur.

Réponds UNIQUEMENT en JSON : {"hier":"...","priorites":["...","...","..."],"mot":"..."}`

  const client = new Anthropic({ apiKey })
  const resp = await client.messages.create({ model: 'claude-haiku-4-5', max_tokens: 800, messages: [{ role: 'user', content: prompt }] })
  const txt = resp.content.filter(c => c.type === 'text').map(c => (c as { text: string }).text).join('\n').trim()
  let parsed: { hier?: string; priorites?: string[]; mot?: string }
  try { parsed = JSON.parse(txt) } catch { const m = txt.match(/\{[\s\S]*\}/); parsed = m ? JSON.parse(m[0]) : {} }

  const brief: BriefDuJour = {
    date: dayStart.toISOString().slice(0, 10),
    hier: String(parsed.hier || `${caHier.toFixed(0)} € hier (${nbHier} commandes).`),
    priorites: Array.isArray(parsed.priorites) ? parsed.priorites.slice(0, 3).map(String) : [],
    mot: String(parsed.mot || ''),
  }
  await sb.from('parametres').upsert(
    { cle: 'cg_brief_jour', valeur: JSON.stringify(brief), updated_at: new Date().toISOString() },
    { onConflict: 'cle' },
  )
  return brief
}

/** Lit le dernier brief persisté (ou null). */
export async function lireBriefDuJour(): Promise<BriefDuJour | null> {
  const sb = await createClient()
  const { data } = await sb.from('parametres').select('valeur').eq('cle', 'cg_brief_jour').maybeSingle()
  if (!data?.valeur) return null
  try { return JSON.parse(data.valeur as string) as BriefDuJour } catch { return null }
}
