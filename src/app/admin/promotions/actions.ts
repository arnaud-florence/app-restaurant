'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { requireManager } from '@/lib/auth'

const promoSchema = z.object({
  titre:        z.string().trim().min(1, 'Titre obligatoire').max(160),
  description:  z.string().max(1000).nullable().optional(),
  image_url:    z.string().max(2000).nullable().optional(),
  date_debut:   z.string(),                    // ISO datetime ou date
  date_fin:     z.string().nullable().optional(),
  cta_label:    z.string().max(60).nullable().optional(),
  cta_url:      z.string().max(500).nullable().optional(),
  visible_site: z.boolean().default(true),
  actif:        z.boolean().default(true),
})

export async function creerPromotion(input: unknown) {
  await requireManager()
  const p = promoSchema.parse(input)
  const sb = await createClient()
  const { data, error } = await sb.from('promotions').insert({
    titre: p.titre,
    description: p.description || null,
    image_url: p.image_url || null,
    date_debut: p.date_debut,
    date_fin: p.date_fin || null,
    cta_label: p.cta_label || null,
    cta_url: p.cta_url || null,
    visible_site: p.visible_site,
    actif: p.actif,
  }).select('id').single()
  if (error || !data) throw new Error(error?.message ?? 'Erreur')
  revalidatePath('/admin/promotions')
  return { id: data.id as string }
}

const updateSchema = promoSchema.extend({ id: z.string().uuid() })

export async function modifierPromotion(input: unknown) {
  await requireManager()
  const p = updateSchema.parse(input)
  const sb = await createClient()
  const { error } = await sb.from('promotions').update({
    titre: p.titre,
    description: p.description || null,
    image_url: p.image_url || null,
    date_debut: p.date_debut,
    date_fin: p.date_fin || null,
    cta_label: p.cta_label || null,
    cta_url: p.cta_url || null,
    visible_site: p.visible_site,
    actif: p.actif,
  }).eq('id', p.id)
  if (error) throw new Error(error.message)
  revalidatePath('/admin/promotions')
  return { ok: true as const }
}

export async function togglePromotion(id: string, actif: boolean) {
  await requireManager()
  if (!id) throw new Error('id manquant')
  const sb = await createClient()
  const { error } = await sb.from('promotions').update({ actif }).eq('id', id)
  if (error) throw new Error(error.message)
  revalidatePath('/admin/promotions')
  return { ok: true as const }
}

export async function supprimerPromotion(id: string) {
  await requireManager()
  if (!id) throw new Error('id manquant')
  const sb = await createClient()
  const { error } = await sb.from('promotions').delete().eq('id', id)
  if (error) throw new Error(error.message)
  revalidatePath('/admin/promotions')
  return { ok: true as const }
}
