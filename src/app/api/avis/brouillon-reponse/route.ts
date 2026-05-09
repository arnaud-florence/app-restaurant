// API : génère un brouillon de réponse à un avis client via Claude.
// POST { avis_id } → { brouillon: string }
// Le brouillon est sauvegardé en DB (champ brouillon_reponse_ia), le manager
// doit ensuite VALIDER manuellement avant de le publier (anti-IA hallucination).

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

  let body: { avis_id?: string }
  try { body = await req.json() }
  catch { return Response.json({ error: 'JSON invalide' }, { status: 400 }) }

  const { avis_id } = body
  if (!avis_id) return Response.json({ error: 'avis_id requis' }, { status: 400 })

  const sb = await createClient()
  const { data: avis } = await sb.from('avis_publics')
    .select('source, note, titre, contenu, langue')
    .eq('id', avis_id).maybeSingle()
  if (!avis) return Response.json({ error: 'Avis introuvable' }, { status: 404 })

  // Récupère le nom de l'établissement depuis paramètres
  const { data: param } = await sb.from('parametres')
    .select('valeur').eq('cle', 'etablissement_nom').maybeSingle()
  const restoNom = (param?.valeur as string) ?? 'notre restaurant'

  const note = Number(avis.note ?? 5)
  const ton = note >= 4 ? 'chaleureux et reconnaissant'
    : note === 3 ? 'attentif, accueillant la critique constructive'
    : 'professionnel, empathique, ouvert à dialoguer pour résoudre le problème'

  const prompt = `Tu rédiges un brouillon de réponse à un avis client publié sur ${avis.source}.

Note du client : ${note}/5 ⭐
${avis.titre ? `Titre : ${avis.titre}` : ''}
${avis.contenu ? `Contenu : "${avis.contenu}"` : '(Pas de contenu — juste la note)'}

Restaurant : ${restoNom}
Ton à adopter : ${ton}

Règles strictes :
- Réponse en français, 3-5 lignes max
- Tutoiement INTERDIT : utiliser le vouvoiement
- Remercier le client pour son retour
- Si note 1-3 : reconnaître le problème SANS minimiser, proposer un échange direct (téléphone/email/visite)
- Si note 4-5 : remercier sincèrement, mentionner un détail si pertinent du contenu, inviter à revenir
- AUCUN engagement précis (montant, date, geste commercial) — laisser au manager
- Pas de signature « L'équipe X » ni « Cordialement » : juste le corps de la réponse
- Pas de liste à puces ni de markdown

Génère uniquement le texte du brouillon, rien d'autre.`

  try {
    const client = new Anthropic({ apiKey })
    const response = await client.messages.create({
      model: 'claude-opus-4-7',
      max_tokens: 800,
      messages: [{ role: 'user', content: prompt }],
    })

    const brouillon = response.content
      .filter(c => c.type === 'text')
      .map(c => (c as { text: string }).text)
      .join('\n')
      .trim()

    // Sauvegarde best-effort
    await sb.from('avis_publics')
      .update({ brouillon_reponse_ia: brouillon })
      .eq('id', avis_id)

    return Response.json({ brouillon })
  } catch (e) {
    console.error('[brouillon-reponse] erreur Anthropic :', e)
    return Response.json({ error: e instanceof Error ? e.message : 'Erreur génération' }, { status: 500 })
  }
}
