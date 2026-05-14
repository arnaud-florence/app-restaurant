// ─── Endpoint formation : Poser une question via Claude ─────────
//
// POST { question, guide_id?, etape_id?, employe_id? }
// Appelle Claude haiku-4-5 avec contexte du guide + étape courante.
// Persiste la Q/R dans formation_questions_ia pour analyse + amélioration
// future des modules (le manager voit les top questions dans /admin/formation).
//
// Auth : pas de auth stricte côté API — la formation est accessible publiquement
// (mode kiosk). Mais on logue toujours qui pose la question si employe_id fourni.
// Rate-limited côté coûts via Anthropic (haiku = ~$0.001/question).

import { NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@/lib/supabase/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 30

const MODEL = 'claude-haiku-4-5'
const MAX_QUESTION_LEN = 1000

export async function POST(req: Request) {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) return NextResponse.json({ ok: false, error: 'IA indisponible (ANTHROPIC_API_KEY manquante)' }, { status: 500 })

  let body: { question?: string; guide_id?: string; etape_id?: string; employe_id?: string }
  try { body = await req.json() }
  catch { return NextResponse.json({ ok: false, error: 'JSON invalide' }, { status: 400 }) }

  const question = (body.question ?? '').trim()
  if (!question) return NextResponse.json({ ok: false, error: 'question vide' }, { status: 400 })
  if (question.length > MAX_QUESTION_LEN) {
    return NextResponse.json({ ok: false, error: `question trop longue (max ${MAX_QUESTION_LEN} caractères)` }, { status: 400 })
  }

  const supabase = await createClient()

  // Charge le contexte : guide + étape (si fournis)
  let contexte = ''
  let posteGuide: string | null = null
  if (body.guide_id) {
    const { data: g } = await supabase
      .from('guides_formation')
      .select('titre, description, poste, niveau')
      .eq('id', body.guide_id)
      .maybeSingle()
    if (g) {
      posteGuide = (g.poste as string) ?? null
      contexte += `Tu réponds à un employé qui suit le guide de formation "${g.titre}" (poste : ${g.poste}, niveau ${g.niveau ?? 1}/3).\n`
      if (g.description) contexte += `Description du guide : ${g.description}\n`
    }
  }
  if (body.etape_id) {
    const { data: e } = await supabase
      .from('etapes_formation')
      .select('titre, contenu')
      .eq('id', body.etape_id)
      .maybeSingle()
    if (e) {
      contexte += `\nIl est actuellement sur l'étape : "${e.titre}".\n`
      if (e.contenu) contexte += `Contenu de l'étape :\n${(e.contenu as string).slice(0, 2000)}\n`
    }
  }

  const systemPrompt = `Tu es un formateur expert d'un restaurant indépendant français qui aide les employés à se former.
Tu réponds en français, de manière concrète, pragmatique et bienveillante.
Tu es DIRECT et NE FAIS PAS DE BLABLA.
Tes réponses font max 5 phrases. Tu privilégies les listes courtes.
Si la question dépasse le cadre du restaurant (météo, vie perso…), tu refuses poliment et tu invites à se concentrer sur la formation.
Si tu ne sais pas, tu dis "Je ne sais pas, demande au gérant".

${contexte}`

  try {
    const client = new Anthropic({ apiKey })
    const resp = await client.messages.create({
      model: MODEL,
      max_tokens: 600,
      system: systemPrompt,
      messages: [{ role: 'user', content: question }],
    })
    const text = (resp.content.find(c => c.type === 'text') as { text?: string } | undefined)?.text ?? '(réponse vide)'
    const usage = { input: resp.usage.input_tokens, output: resp.usage.output_tokens }

    // Persiste pour analyse manager + détection questions fréquentes
    await supabase.from('formation_questions_ia').insert({
      employe_id: body.employe_id ?? null,
      guide_id:   body.guide_id ?? null,
      etape_id:   body.etape_id ?? null,
      question,
      reponse:    text,
      poste:      posteGuide,
      modele:     MODEL,
      tokens_input:  usage.input,
      tokens_output: usage.output,
    })

    return NextResponse.json({ ok: true, reponse: text, usage })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Erreur Anthropic'
    return NextResponse.json({ ok: false, error: msg }, { status: 500 })
  }
}
