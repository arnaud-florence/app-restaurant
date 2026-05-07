'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'

const POSTE_ENUM = z.enum(['cuisine', 'pizzaiolo', 'bar', 'salle', 'serveur', 'manager', 'plonge', 'autre', 'tous'])

// ─── Guides ─────────────────────────────────────────────────────────
const guideSchema = z.object({
  titre:              z.string().trim().min(1).max(200),
  description:        z.string().max(2000).nullable(),
  poste:              POSTE_ENUM,
  ordre:              z.number().int().min(0).default(0),
  actif:              z.boolean().default(true),
  seuil_reussite_pct: z.number().int().min(0).max(100).default(80),
  duree_minutes:      z.number().int().min(1).nullable(),
})

export async function creerGuide(input: unknown): Promise<{ id: string }> {
  const p = guideSchema.parse(input)
  const supabase = await createClient()
  const { data, error } = await supabase.from('guides_formation').insert(p).select('id').single()
  if (error || !data) throw new Error(error?.message ?? 'Erreur')
  revalidatePath('/admin/formation')
  revalidatePath('/formation')
  return { id: data.id as string }
}

const updateGuideSchema = guideSchema.extend({ id: z.string().uuid() })
export async function updateGuide(input: unknown) {
  const p = updateGuideSchema.parse(input)
  const { id, ...rest } = p
  const supabase = await createClient()
  const { error } = await supabase.from('guides_formation')
    .update({ ...rest, updated_at: new Date().toISOString() })
    .eq('id', id)
  if (error) throw new Error(error.message)
  revalidatePath('/admin/formation')
  revalidatePath('/formation')
  return { ok: true as const }
}

export async function supprimerGuide(id: string) {
  if (!id) throw new Error('id manquant')
  const supabase = await createClient()
  const { error } = await supabase.from('guides_formation').delete().eq('id', id)
  if (error) throw new Error(error.message)
  revalidatePath('/admin/formation')
  revalidatePath('/formation')
  return { ok: true as const }
}

// ─── Étapes ─────────────────────────────────────────────────────────
const etapeSchema = z.object({
  guide_id:  z.string().uuid(),
  ordre:     z.number().int().min(1),
  titre:     z.string().trim().min(1).max(200),
  contenu:   z.string().trim().min(1).max(20000),
  image_url: z.string().url().max(2000).nullable(),
  video_url: z.string().url().max(2000).nullable(),
})

export async function creerEtape(input: unknown): Promise<{ id: string }> {
  const p = etapeSchema.parse(input)
  const supabase = await createClient()
  const { data, error } = await supabase.from('etapes_formation').insert(p).select('id').single()
  if (error || !data) throw new Error(error?.message ?? 'Erreur')
  revalidatePath('/admin/formation')
  return { id: data.id as string }
}

const updateEtapeSchema = etapeSchema.extend({ id: z.string().uuid() })
export async function updateEtape(input: unknown) {
  const p = updateEtapeSchema.parse(input)
  const { id, ...rest } = p
  const supabase = await createClient()
  const { error } = await supabase.from('etapes_formation')
    .update({ ...rest, updated_at: new Date().toISOString() })
    .eq('id', id)
  if (error) throw new Error(error.message)
  revalidatePath('/admin/formation')
  return { ok: true as const }
}

export async function supprimerEtape(id: string) {
  if (!id) throw new Error('id manquant')
  const supabase = await createClient()
  const { error } = await supabase.from('etapes_formation').delete().eq('id', id)
  if (error) throw new Error(error.message)
  revalidatePath('/admin/formation')
  return { ok: true as const }
}

// ─── Quiz ───────────────────────────────────────────────────────────
const questionSchema = z.object({
  guide_id:          z.string().uuid(),
  ordre:             z.number().int().min(1),
  question:          z.string().trim().min(1).max(500),
  choix:             z.array(z.string().trim().min(1).max(200)).min(2).max(6),
  bonne_reponse_idx: z.number().int().min(0),
  explication:       z.string().max(1000).nullable(),
}).refine(d => d.bonne_reponse_idx < d.choix.length, { message: 'bonne_reponse_idx hors plage' })

export async function creerQuestion(input: unknown): Promise<{ id: string }> {
  const p = questionSchema.parse(input)
  const supabase = await createClient()
  const { data, error } = await supabase.from('quiz_questions').insert(p).select('id').single()
  if (error || !data) throw new Error(error?.message ?? 'Erreur')
  revalidatePath('/admin/formation')
  return { id: data.id as string }
}

const updateQuestionSchema = questionSchema.extend({ id: z.string().uuid() })
export async function updateQuestion(input: unknown) {
  const p = updateQuestionSchema.parse(input)
  const { id, ...rest } = p
  const supabase = await createClient()
  const { error } = await supabase.from('quiz_questions').update(rest).eq('id', id)
  if (error) throw new Error(error.message)
  revalidatePath('/admin/formation')
  return { ok: true as const }
}

export async function supprimerQuestion(id: string) {
  if (!id) throw new Error('id manquant')
  const supabase = await createClient()
  const { error } = await supabase.from('quiz_questions').delete().eq('id', id)
  if (error) throw new Error(error.message)
  revalidatePath('/admin/formation')
  return { ok: true as const }
}

// ─── Reset progression employé (utile gérant) ──────────────────────
export async function resetProgression(guide_id: string, employe_id: string) {
  if (!guide_id || !employe_id) throw new Error('paramètres manquants')
  const supabase = await createClient()
  const { error } = await supabase.from('progressions_formation')
    .delete()
    .eq('guide_id', guide_id)
    .eq('employe_id', employe_id)
  if (error) throw new Error(error.message)
  revalidatePath('/admin/formation')
  revalidatePath('/formation')
  return { ok: true as const }
}
