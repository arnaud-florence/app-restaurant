'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'

// ─── Obligations légales ───────────────────────────────────────────

const obligationSchema = z.object({
  titre:         z.string().trim().min(1).max(200),
  categorie:     z.string().trim().min(1).max(50),
  description:   z.string().max(2000).nullable(),
  date_echeance: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
  frequence:     z.string().max(50).nullable(),
  statut:        z.enum(['a_faire','fait','en_cours']),
  prestataire:   z.string().max(200).nullable(),
  document_url:  z.string().max(500).nullable(),
  notes:         z.string().max(500).nullable(),
})

export async function creerObligation(input: unknown): Promise<{ id: string }> {
  const p = obligationSchema.parse(input)
  const supabase = await createClient()
  const { data, error } = await supabase.from('obligations_legales').insert(p).select('id').single()
  if (error || !data) throw new Error(error?.message ?? 'Erreur')
  revalidatePath('/admin/legal')
  return { id: data.id as string }
}

const updateOblSchema = obligationSchema.extend({ id: z.string().uuid() })

export async function updateObligation(input: unknown) {
  const p = updateOblSchema.parse(input)
  const { id, ...rest } = p
  const supabase = await createClient()
  const { error } = await supabase.from('obligations_legales').update(rest).eq('id', id)
  if (error) throw new Error(error.message)
  revalidatePath('/admin/legal')
  return { ok: true as const }
}

export async function supprimerObligation(id: string) {
  if (!id) throw new Error('id manquant')
  const supabase = await createClient()
  const { error } = await supabase.from('obligations_legales').delete().eq('id', id)
  if (error) throw new Error(error.message)
  revalidatePath('/admin/legal')
  return { ok: true as const }
}

// ─── Accidents du travail ──────────────────────────────────────────

const accidentSchema = z.object({
  employe_id:           z.string().uuid().nullable(),
  date_accident:        z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  heure_accident:       z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/).nullable(),
  lieu:                 z.string().max(200).nullable(),
  description:          z.string().trim().min(1).max(2000),
  gravite:              z.enum(['legere','grave','mortel']),
  jours_arret:          z.number().int().min(0).default(0),
  declaration_cpam:     z.boolean().default(false),
  declaration_cpam_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
  declaration_cpam_url: z.string().max(500).nullable(),
  temoin:               z.string().max(200).nullable(),
  suites:               z.string().max(2000).nullable(),
})

export async function creerAccident(input: unknown): Promise<{ id: string }> {
  const p = accidentSchema.parse(input)
  const supabase = await createClient()
  const { data, error } = await supabase.from('accidents_travail').insert(p).select('id').single()
  if (error || !data) throw new Error(error?.message ?? 'Erreur')
  revalidatePath('/admin/legal')
  return { id: data.id as string }
}

export async function supprimerAccident(id: string) {
  if (!id) throw new Error('id manquant')
  const supabase = await createClient()
  const { error } = await supabase.from('accidents_travail').delete().eq('id', id)
  if (error) throw new Error(error.message)
  revalidatePath('/admin/legal')
  return { ok: true as const }
}

// ─── Affichages : verif présence + date ────────────────────────────

const affichageVerifSchema = z.object({
  id:                z.string().uuid(),
  present:           z.boolean(),
  date_verification: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
  photo_url:         z.string().max(500).nullable(),
  notes:             z.string().max(500).nullable(),
})

export async function verifierAffichage(input: unknown) {
  const p = affichageVerifSchema.parse(input)
  const supabase = await createClient()
  const { error } = await supabase.from('affichages_verifications').update({
    present: p.present,
    date_verification: p.date_verification,
    photo_url: p.photo_url,
    notes: p.notes,
    updated_at: new Date().toISOString(),
  }).eq('id', p.id)
  if (error) throw new Error(error.message)
  revalidatePath('/admin/legal')
  return { ok: true as const }
}

const affichageCreerSchema = z.object({
  titre:            z.string().trim().min(1).max(200),
  description:      z.string().max(500).nullable(),
  reference_legale: z.string().max(200).nullable(),
  obligatoire:      z.boolean().default(false),
  ordre:            z.number().int().default(99),
})

export async function creerAffichageLibre(input: unknown): Promise<{ id: string }> {
  const p = affichageCreerSchema.parse(input)
  const supabase = await createClient()
  const { data, error } = await supabase.from('affichages_verifications').insert({ ...p, present: false }).select('id').single()
  if (error || !data) throw new Error(error?.message ?? 'Erreur')
  revalidatePath('/admin/legal')
  return { id: data.id as string }
}

export async function supprimerAffichage(id: string) {
  if (!id) throw new Error('id manquant')
  const supabase = await createClient()
  // On ne supprime pas les obligatoires (sécurité)
  const { data: a } = await supabase.from('affichages_verifications').select('obligatoire').eq('id', id).single()
  if (a?.obligatoire) throw new Error('Affichage obligatoire — non supprimable')
  const { error } = await supabase.from('affichages_verifications').delete().eq('id', id)
  if (error) throw new Error(error.message)
  revalidatePath('/admin/legal')
  return { ok: true as const }
}
