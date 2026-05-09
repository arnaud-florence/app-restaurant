'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { requireManager } from '@/lib/auth'

const postSchema = z.object({
  type:           z.enum(['post','story','reel','annonce_gmb']),
  canal:          z.enum(['instagram','facebook','google_my_business','linkedin','tiktok','autre']),
  titre:          z.string().max(200).nullable().optional(),
  contenu:        z.string().trim().min(1).max(5000),
  hashtags:       z.array(z.string()).default([]),
  image_url:      z.string().max(2000).nullable().optional(),
  call_to_action: z.string().max(100).nullable().optional(),
  cta_url:        z.string().max(500).nullable().optional(),
  recette_id:     z.string().uuid().nullable().optional(),
  evenement_id:   z.string().uuid().nullable().optional(),
  promotion_id:   z.string().uuid().nullable().optional(),
  date_programmee: z.string().nullable().optional(),
  statut:         z.enum(['brouillon','prevu','publie','rejete','archive']).default('brouillon'),
  genere_par_ia:  z.boolean().default(false),
  prompt_ia:      z.string().nullable().optional(),
})

export async function creerPost(input: unknown) {
  const profil = await requireManager()
  const p = postSchema.parse(input)
  const sb = await createClient()
  const { data, error } = await sb.from('posts_marketing').insert({
    type: p.type, canal: p.canal,
    titre: p.titre || null, contenu: p.contenu,
    hashtags: p.hashtags, image_url: p.image_url || null,
    call_to_action: p.call_to_action || null, cta_url: p.cta_url || null,
    recette_id: p.recette_id || null, evenement_id: p.evenement_id || null, promotion_id: p.promotion_id || null,
    date_programmee: p.date_programmee || null,
    statut: p.statut,
    genere_par_ia: p.genere_par_ia, prompt_ia: p.prompt_ia || null,
    cree_par_id: profil.employe_id ?? null,
  }).select('id').single()
  if (error || !data) throw new Error(error?.message ?? 'Erreur')
  revalidatePath('/admin/marketing')
  return { id: data.id }
}

export async function modifierPost(id: string, input: unknown) {
  await requireManager()
  if (!id) throw new Error('id manquant')
  const p = postSchema.parse(input)
  const sb = await createClient()
  const { error } = await sb.from('posts_marketing').update({
    type: p.type, canal: p.canal,
    titre: p.titre || null, contenu: p.contenu,
    hashtags: p.hashtags, image_url: p.image_url || null,
    call_to_action: p.call_to_action || null, cta_url: p.cta_url || null,
    recette_id: p.recette_id || null, evenement_id: p.evenement_id || null, promotion_id: p.promotion_id || null,
    date_programmee: p.date_programmee || null,
    statut: p.statut,
    updated_at: new Date().toISOString(),
  }).eq('id', id)
  if (error) throw new Error(error.message)
  revalidatePath('/admin/marketing')
  return { ok: true as const }
}

export async function changerStatutPost(id: string, statut: 'brouillon'|'prevu'|'publie'|'rejete'|'archive') {
  await requireManager()
  if (!id) throw new Error('id manquant')
  const sb = await createClient()
  const update: Record<string, unknown> = { statut, updated_at: new Date().toISOString() }
  if (statut === 'publie') update.date_publication = new Date().toISOString()
  const { error } = await sb.from('posts_marketing').update(update).eq('id', id)
  if (error) throw new Error(error.message)
  revalidatePath('/admin/marketing')
  return { ok: true as const }
}

export async function supprimerPost(id: string) {
  await requireManager()
  if (!id) throw new Error('id manquant')
  const sb = await createClient()
  const { error } = await sb.from('posts_marketing').delete().eq('id', id)
  if (error) throw new Error(error.message)
  revalidatePath('/admin/marketing')
  return { ok: true as const }
}
