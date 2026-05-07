'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'

const releveSchema = z.object({
  type:             z.enum(['electricite','gaz','eau','autre']),
  date_releve:      z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  periode_debut:    z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  periode_fin:      z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  consommation:     z.number().min(0),
  unite:            z.enum(['kWh','m3','litre','autre']),
  prix_unitaire_ht: z.number().min(0).nullable(),
  montant_ht:       z.number().min(0),
  montant_ttc:      z.number().min(0),
  fournisseur:      z.string().max(200).nullable(),
  num_facture:      z.string().max(100).nullable(),
  notes:            z.string().max(500).nullable(),
})

export async function creerReleveEnergie(input: unknown): Promise<{ id: string }> {
  const p = releveSchema.parse(input)
  if (new Date(p.periode_fin) < new Date(p.periode_debut)) throw new Error('Période fin avant début')
  const supabase = await createClient()
  const { data, error } = await supabase.from('releves_energie').insert(p).select('id').single()
  if (error || !data) throw new Error(error?.message ?? 'Erreur')
  revalidatePath('/admin/energie')
  return { id: data.id as string }
}

const updateReleveSchema = releveSchema.extend({ id: z.string().uuid() })

export async function updateReleveEnergie(input: unknown) {
  const p = updateReleveSchema.parse(input)
  const { id, ...rest } = p
  const supabase = await createClient()
  const { error } = await supabase.from('releves_energie').update({ ...rest, updated_at: new Date().toISOString() }).eq('id', id)
  if (error) throw new Error(error.message)
  revalidatePath('/admin/energie')
  return { ok: true as const }
}

export async function supprimerReleveEnergie(id: string) {
  if (!id) throw new Error('id manquant')
  const supabase = await createClient()
  const { error } = await supabase.from('releves_energie').delete().eq('id', id)
  if (error) throw new Error(error.message)
  revalidatePath('/admin/energie')
  return { ok: true as const }
}
