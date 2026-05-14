'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'

const enregistrerSchema = z.object({
  guide_id: z.string().uuid(),
  employe_id: z.string().uuid(),
  type_simulation: z.string(),
  score_pct: z.number().min(0).max(100),
  reponses: z.record(z.string(), z.unknown()),
  feedback_ia: z.string().nullable().optional(),
})

export async function enregistrerSimulation(input: unknown) {
  const p = enregistrerSchema.parse(input)
  const supabase = await createClient()

  // 1. INSERT simulation_attempts
  const { error } = await supabase.from('simulation_attempts').insert({
    employe_id: p.employe_id,
    guide_id: p.guide_id,
    type_simulation: p.type_simulation,
    score_pct: p.score_pct,
    reponses: p.reponses,
    feedback_ia: p.feedback_ia ?? null,
  })
  if (error) throw new Error(error.message)

  // 2. Si score >= 80 → marque la progression comme 'reussi' (= validation niveau 2)
  if (p.score_pct >= 80) {
    const { data: existing } = await supabase
      .from('progressions_formation')
      .select('id, statut, dernier_score_pct')
      .eq('guide_id', p.guide_id)
      .eq('employe_id', p.employe_id)
      .maybeSingle()

    if (existing) {
      await supabase.from('progressions_formation').update({
        statut: 'reussi',
        dernier_score_pct: p.score_pct,
        derniere_tentative_le: new Date().toISOString(),
        termine_le: new Date().toISOString(),
      }).eq('id', existing.id)
    } else {
      await supabase.from('progressions_formation').insert({
        guide_id: p.guide_id,
        employe_id: p.employe_id,
        statut: 'reussi',
        dernier_score_pct: p.score_pct,
        derniere_tentative_le: new Date().toISOString(),
        termine_le: new Date().toISOString(),
      })
    }
  } else {
    // Score insuffisant : enregistre tentative mais statut quiz_a_passer
    const { data: existing } = await supabase
      .from('progressions_formation')
      .select('id')
      .eq('guide_id', p.guide_id)
      .eq('employe_id', p.employe_id)
      .maybeSingle()

    if (existing) {
      await supabase.from('progressions_formation').update({
        statut: 'echoue',
        dernier_score_pct: p.score_pct,
        derniere_tentative_le: new Date().toISOString(),
      }).eq('id', existing.id)
    } else {
      await supabase.from('progressions_formation').insert({
        guide_id: p.guide_id,
        employe_id: p.employe_id,
        statut: 'echoue',
        dernier_score_pct: p.score_pct,
        derniere_tentative_le: new Date().toISOString(),
      })
    }
  }

  revalidatePath('/formation')
  return { ok: true as const, score: p.score_pct }
}
