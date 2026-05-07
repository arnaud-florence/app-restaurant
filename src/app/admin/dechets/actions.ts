'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'

// ─── Pesées (suivi_dechets) ────────────────────────────────────────

const peseeSchema = z.object({
  date_pesee:  z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  type_dechet: z.enum(['biodechet','carton','verre','plastique','huile','metal','dasri','autre']),
  poids_kg:    z.number().min(0),
  cout_estime: z.number().min(0).default(0),
  employe_id:  z.string().uuid().nullable(),
  notes:       z.string().max(500).nullable(),
})

export async function creerPesee(input: unknown): Promise<{ id: string }> {
  const p = peseeSchema.parse(input)
  const supabase = await createClient()
  const { data, error } = await supabase.from('suivi_dechets').insert(p).select('id').single()
  if (error || !data) throw new Error(error?.message ?? 'Erreur')
  revalidatePath('/admin/dechets')
  return { id: data.id as string }
}

export async function supprimerPesee(id: string) {
  if (!id) throw new Error('id manquant')
  const supabase = await createClient()
  const { error } = await supabase.from('suivi_dechets').delete().eq('id', id)
  if (error) throw new Error(error.message)
  revalidatePath('/admin/dechets')
  return { ok: true as const }
}

// ─── Collectes (enlèvements) ───────────────────────────────────────

const collecteSchema = z.object({
  type_dechet:    z.enum(['biodechet','carton','verre','plastique','huile','metal','dasri','autre']),
  date_collecte:  z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  prestataire:    z.string().trim().min(1).max(200),
  poids_total_kg: z.number().min(0).nullable(),
  num_bsd:        z.string().max(100).nullable(),
  cout_collecte:  z.number().min(0).nullable(),
  document_url:   z.string().max(500).nullable(),
  notes:          z.string().max(500).nullable(),
})

export async function creerCollecte(input: unknown): Promise<{ id: string }> {
  const p = collecteSchema.parse(input)
  const supabase = await createClient()
  const { data, error } = await supabase.from('collectes_dechets').insert(p).select('id').single()
  if (error || !data) throw new Error(error?.message ?? 'Erreur')
  revalidatePath('/admin/dechets')
  return { id: data.id as string }
}

export async function supprimerCollecte(id: string) {
  if (!id) throw new Error('id manquant')
  const supabase = await createClient()
  const { error } = await supabase.from('collectes_dechets').delete().eq('id', id)
  if (error) throw new Error(error.message)
  revalidatePath('/admin/dechets')
  return { ok: true as const }
}
