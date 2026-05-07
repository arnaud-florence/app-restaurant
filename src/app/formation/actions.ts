'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { calculerScoreQuiz, peutRetenter, statutApresQuiz, type Question, type Progression } from '@/lib/formation'

// ─── Récupère ou crée la progression de l'employé pour ce guide ──
async function getOuCreerProgression(guide_id: string, employe_id: string): Promise<Progression> {
  const supabase = await createClient()
  const { data: existing } = await supabase.from('progressions_formation')
    .select('*').eq('guide_id', guide_id).eq('employe_id', employe_id).maybeSingle()
  if (existing) return existing as unknown as Progression

  const { data, error } = await supabase.from('progressions_formation').insert({
    guide_id, employe_id, statut: 'en_cours',
  }).select('*').single()
  if (error || !data) throw new Error(error?.message ?? 'Erreur')
  return data as unknown as Progression
}

// ─── Marquer étape vue ────────────────────────────────────────────
const marquerVueSchema = z.object({
  guide_id:   z.string().uuid(),
  employe_id: z.string().uuid(),
  etape_id:   z.string().uuid(),
})

export async function marquerEtapeVue(input: unknown) {
  const p = marquerVueSchema.parse(input)
  const supabase = await createClient()
  const prog = await getOuCreerProgression(p.guide_id, p.employe_id)

  if (prog.etapes_vues_ids.includes(p.etape_id)) {
    return { ok: true as const, deja_vu: true }
  }
  const nouvelles = [...prog.etapes_vues_ids, p.etape_id]

  // Compter le total d'étapes pour décider du statut
  const { count: totalEtapes } = await supabase.from('etapes_formation')
    .select('id', { count: 'exact', head: true }).eq('guide_id', p.guide_id)
  const { count: totalQuestions } = await supabase.from('quiz_questions')
    .select('id', { count: 'exact', head: true }).eq('guide_id', p.guide_id)

  const toutesVues = (totalEtapes ?? 0) > 0 && nouvelles.length >= (totalEtapes ?? 0)
  const nouveauStatut = toutesVues
    ? ((totalQuestions ?? 0) > 0 ? 'quiz_a_passer' : 'reussi')
    : 'en_cours'

  const { error } = await supabase.from('progressions_formation').update({
    etapes_vues_ids: nouvelles,
    statut: nouveauStatut,
    termine_le: nouveauStatut === 'reussi' ? new Date().toISOString() : null,
    updated_at: new Date().toISOString(),
  }).eq('id', prog.id)
  if (error) throw new Error(error.message)
  revalidatePath('/formation')
  revalidatePath(`/formation/${p.guide_id}`)
  return { ok: true as const, deja_vu: false, statut: nouveauStatut }
}

// ─── Soumettre quiz ───────────────────────────────────────────────
const soumettreQuizSchema = z.object({
  guide_id:   z.string().uuid(),
  employe_id: z.string().uuid(),
  reponses:   z.array(z.number().int().min(0)),
})

export async function soumettreQuiz(input: unknown): Promise<{
  score_pct: number; bonnes: number; total: number; statut: 'reussi' | 'echoue'; seuil: number
}> {
  const p = soumettreQuizSchema.parse(input)
  const supabase = await createClient()
  const prog = await getOuCreerProgression(p.guide_id, p.employe_id)

  // Anti-spam : 1 tentative / 24 h
  const peut = peutRetenter(prog)
  if (!peut.ok) throw new Error(`Vous pourrez retenter dans ${peut.prochaine_tentative_dans_h ?? 24} h.`)

  // Récupère questions + seuil
  const [questionsRes, guideRes] = await Promise.all([
    supabase.from('quiz_questions').select('*').eq('guide_id', p.guide_id).order('ordre'),
    supabase.from('guides_formation').select('seuil_reussite_pct').eq('id', p.guide_id).single(),
  ])
  const questions = (questionsRes.data ?? []) as unknown as Question[]
  const seuil = (guideRes.data?.seuil_reussite_pct as number) ?? 80
  if (questions.length === 0) throw new Error('Aucune question pour ce guide')
  if (p.reponses.length !== questions.length) throw new Error('Nombre de réponses incorrect')

  const { score_pct, bonnes, total } = calculerScoreQuiz(p.reponses, questions)
  const statut = statutApresQuiz(score_pct, seuil)

  const { error } = await supabase.from('progressions_formation').update({
    dernier_score_pct: score_pct,
    derniere_tentative_le: new Date().toISOString(),
    statut,
    termine_le: statut === 'reussi' ? new Date().toISOString() : null,
    updated_at: new Date().toISOString(),
  }).eq('id', prog.id)
  if (error) throw new Error(error.message)

  revalidatePath('/formation')
  revalidatePath(`/formation/${p.guide_id}`)
  return { score_pct, bonnes, total, statut, seuil }
}
