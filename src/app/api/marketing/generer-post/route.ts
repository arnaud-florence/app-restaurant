// API : génère un post marketing via Claude.
// POST { canal, type, contexte? } → { titre, contenu, hashtags[], cta }

import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@/lib/supabase/server'
import { requireManager } from '@/lib/auth'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(req: Request) {
  try {
    await requireManager()
  } catch {
    return Response.json({ error: 'Manager requis' }, { status: 403 })
  }

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    return Response.json({ error: 'ANTHROPIC_API_KEY manquante' }, { status: 500 })
  }

  let body: { canal?: string; type?: string; contexte?: string; recette_id?: string; evenement_id?: string }
  try { body = await req.json() }
  catch { return Response.json({ error: 'JSON invalide' }, { status: 400 }) }

  const canal = body.canal ?? 'instagram'
  const type = body.type ?? 'post'
  const contexte = body.contexte ?? ''

  const sb = await createClient()

  // Récupère contexte établissement
  const { data: param } = await sb.from('parametres')
    .select('valeur').eq('cle', 'etablissement_nom').maybeSingle()
  const restoNom = (param?.valeur as string) ?? 'notre restaurant'

  // Récupère recette si liée
  let recetteContexte = ''
  if (body.recette_id) {
    const { data: r } = await sb.from('recettes')
      .select('nom, description, prix_vente_ht, tag_destination, contient_alcool')
      .eq('id', body.recette_id).maybeSingle()
    if (r) {
      recetteContexte = `\nPlat à mettre en avant : "${r.nom}" — ${r.description ?? 'sans description'} — ${Number(r.prix_vente_ht)}€`
    }
  }

  // Récupère événement si lié
  let evtContexte = ''
  if (body.evenement_id) {
    const { data: e } = await sb.from('evenements')
      .select('nom, type, date_evenement, description')
      .eq('id', body.evenement_id).maybeSingle()
    if (e) {
      evtContexte = `\nÉvénement à promouvoir : "${e.nom}" (${e.type}) le ${e.date_evenement}`
    }
  }

  const guidelinesCanal: Record<string, string> = {
    instagram: 'Très visuel, ton chaleureux et fun, hashtags pertinents (~10), 2 paragraphes max, emojis ✨🍽️📸',
    facebook: 'Plus long que Instagram (3-4 paragraphes ok), ton convivial, peu de hashtags (3-5), call-to-action clair',
    google_my_business: 'Concis (200-300 caractères), informatif, factuel, mots-clés locaux (ville/quartier), pas de hashtags',
    linkedin: 'Professionnel, ton expert, format article court (300-500 mots), 3-5 hashtags pros',
    tiktok: 'Très court, hook fort dès la 1re ligne, ton jeune et énergique, beaucoup d\'emojis',
    autre: 'Adapter au canal',
  }
  const guidelinesType: Record<string, string> = {
    post: 'Format standard',
    story: 'Très court (1-2 phrases), question ouverte ou call-to-action immédiat',
    reel: 'Description courte d\'une vidéo : 1 ligne accrocheuse + appel à l\'action',
    annonce_gmb: 'Format Google My Business : titre court + description 200 char',
  }

  const prompt = `Tu es expert en marketing digital pour la restauration. Rédige un post pour ${canal} (${type}) pour le restaurant "${restoNom}".

${recetteContexte}${evtContexte}
${contexte ? `\nContexte additionnel : ${contexte}` : ''}

Spécificités du canal :
${guidelinesCanal[canal] ?? guidelinesCanal.autre}

Spécificités du type :
${guidelinesType[type] ?? guidelinesType.post}

Règles strictes :
- Pas de promesses irréalistes
- Pas de mention prix sauf si fournie
- Vouvoiement
- Mention "Réserver une table" ou "Commander en ligne" comme CTA quand pertinent

Réponds UNIQUEMENT avec un objet JSON strict (pas de markdown, pas d'intro) :
{
  "titre": "titre court accrocheur (10-60 char)",
  "contenu": "le texte du post",
  "hashtags": ["hashtag1", "hashtag2", ...],
  "call_to_action": "texte du bouton CTA",
  "cta_url": "/menu OU /reserver OU /commander OU vide"
}`

  try {
    const client = new Anthropic({ apiKey })
    const response = await client.messages.create({
      model: 'claude-opus-4-7',
      max_tokens: 1500,
      messages: [{ role: 'user', content: prompt }],
    })

    const txt = response.content
      .filter(c => c.type === 'text')
      .map(c => (c as { text: string }).text)
      .join('\n')
      .trim()

    // Parse JSON (avec fallback si Claude met du texte autour)
    let data: { titre?: string; contenu?: string; hashtags?: string[]; call_to_action?: string; cta_url?: string }
    try {
      data = JSON.parse(txt)
    } catch {
      // Cherche un objet JSON dans le texte
      const m = txt.match(/\{[\s\S]*\}/)
      if (!m) throw new Error('Réponse IA non parsable')
      data = JSON.parse(m[0])
    }

    return Response.json({
      titre: data.titre ?? '',
      contenu: data.contenu ?? '',
      hashtags: Array.isArray(data.hashtags) ? data.hashtags : [],
      call_to_action: data.call_to_action ?? '',
      cta_url: data.cta_url ?? '',
      prompt_ia: prompt,
    })
  } catch (e) {
    console.error('[generer-post] :', e)
    return Response.json({ error: e instanceof Error ? e.message : 'Erreur' }, { status: 500 })
  }
}
