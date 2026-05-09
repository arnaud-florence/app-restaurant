'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { requireManager } from '@/lib/auth'

const platSchema = z.object({
  recette_id:           z.string().uuid(),
  date_debut:           z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  date_fin:             z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  prix_special:         z.coerce.number().min(0).max(99999).nullable().optional(),
  description_speciale: z.string().max(500).nullable().optional(),
  ordre:                z.coerce.number().int().min(0).max(100).default(0),
  actif:                z.boolean().default(true),
})

export async function creerPlatDuJour(input: unknown) {
  await requireManager()
  const p = platSchema.parse(input)
  const sb = await createClient()
  const { data, error } = await sb.from('plats_du_jour').insert({
    recette_id: p.recette_id,
    date_debut: p.date_debut,
    date_fin: p.date_fin || null,
    prix_special: p.prix_special ?? null,
    description_speciale: p.description_speciale || null,
    ordre: p.ordre,
    actif: p.actif,
  }).select('id').single()
  if (error || !data) throw new Error(error?.message ?? 'Erreur')
  revalidatePath('/admin/plats-du-jour')
  return { id: data.id as string }
}

const updateSchema = platSchema.extend({ id: z.string().uuid() })

export async function modifierPlatDuJour(input: unknown) {
  await requireManager()
  const p = updateSchema.parse(input)
  const sb = await createClient()
  const { error } = await sb.from('plats_du_jour').update({
    recette_id: p.recette_id,
    date_debut: p.date_debut,
    date_fin: p.date_fin || null,
    prix_special: p.prix_special ?? null,
    description_speciale: p.description_speciale || null,
    ordre: p.ordre,
    actif: p.actif,
  }).eq('id', p.id)
  if (error) throw new Error(error.message)
  revalidatePath('/admin/plats-du-jour')
  return { ok: true as const }
}

export async function togglePlatDuJour(id: string, actif: boolean) {
  await requireManager()
  if (!id) throw new Error('id manquant')
  const sb = await createClient()
  const { error } = await sb.from('plats_du_jour').update({ actif }).eq('id', id)
  if (error) throw new Error(error.message)
  revalidatePath('/admin/plats-du-jour')
  return { ok: true as const }
}

export async function supprimerPlatDuJour(id: string) {
  await requireManager()
  if (!id) throw new Error('id manquant')
  const sb = await createClient()
  const { error } = await sb.from('plats_du_jour').delete().eq('id', id)
  if (error) throw new Error(error.message)
  revalidatePath('/admin/plats-du-jour')
  return { ok: true as const }
}
