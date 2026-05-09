'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { requireManager } from '@/lib/auth'

const codeSchema = z.object({
  code:                    z.string().trim().min(3, 'Code trop court').max(40)
                            .regex(/^[A-Z0-9_-]+$/, 'Lettres maj/chiffres/_/- uniquement')
                            .transform(s => s.toUpperCase()),
  type:                    z.enum(['pourcentage', 'euros']),
  valeur:                  z.coerce.number().min(0.01).max(100000),
  montant_min:             z.coerce.number().min(0).max(100000).default(0),
  date_debut:              z.string(),
  date_fin:                z.string().nullable().optional(),
  usage_max:               z.coerce.number().int().min(0).nullable().optional(),
  reserve_fidelite_niveau: z.enum(['standard','bronze','argent','or','platine']).nullable().optional(),
  description:             z.string().max(500).nullable().optional(),
  actif:                   z.boolean().default(true),
})

export async function creerCodePromo(input: unknown) {
  await requireManager()
  const p = codeSchema.parse(input)
  // Validation métier : si pourcentage, valeur ≤ 100
  if (p.type === 'pourcentage' && p.valeur > 100) {
    throw new Error('Pourcentage > 100% impossible')
  }
  const sb = await createClient()
  const { data, error } = await sb.from('codes_promo').insert({
    code: p.code,
    type: p.type,
    valeur: p.valeur,
    montant_min: p.montant_min,
    date_debut: p.date_debut,
    date_fin: p.date_fin || null,
    usage_max: p.usage_max ?? null,
    usage_actuel: 0,
    reserve_fidelite_niveau: p.reserve_fidelite_niveau ?? null,
    description: p.description || null,
    actif: p.actif,
  }).select('id').single()
  if (error || !data) {
    if (error?.message?.includes('duplicate') || error?.message?.includes('unique')) {
      throw new Error(`Le code « ${p.code} » existe déjà.`)
    }
    throw new Error(error?.message ?? 'Erreur')
  }
  revalidatePath('/admin/codes-promo')
  return { id: data.id as string }
}

const updateSchema = codeSchema.extend({ id: z.string().uuid() })

export async function modifierCodePromo(input: unknown) {
  await requireManager()
  const p = updateSchema.parse(input)
  if (p.type === 'pourcentage' && p.valeur > 100) {
    throw new Error('Pourcentage > 100% impossible')
  }
  const sb = await createClient()
  const { error } = await sb.from('codes_promo').update({
    code: p.code,
    type: p.type,
    valeur: p.valeur,
    montant_min: p.montant_min,
    date_debut: p.date_debut,
    date_fin: p.date_fin || null,
    usage_max: p.usage_max ?? null,
    reserve_fidelite_niveau: p.reserve_fidelite_niveau ?? null,
    description: p.description || null,
    actif: p.actif,
  }).eq('id', p.id)
  if (error) throw new Error(error.message)
  revalidatePath('/admin/codes-promo')
  return { ok: true as const }
}

export async function toggleCodePromo(id: string, actif: boolean) {
  await requireManager()
  if (!id) throw new Error('id manquant')
  const sb = await createClient()
  const { error } = await sb.from('codes_promo').update({ actif }).eq('id', id)
  if (error) throw new Error(error.message)
  revalidatePath('/admin/codes-promo')
  return { ok: true as const }
}

export async function supprimerCodePromo(id: string) {
  await requireManager()
  if (!id) throw new Error('id manquant')
  const sb = await createClient()
  const { error } = await sb.from('codes_promo').delete().eq('id', id)
  if (error) throw new Error(error.message)
  revalidatePath('/admin/codes-promo')
  return { ok: true as const }
}
