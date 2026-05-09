'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { requireManager } from '@/lib/auth'

const avisManuelSchema = z.object({
  source:            z.enum(['site','google','tripadvisor','thefork','autre']),
  source_id_externe: z.string().max(160).nullable().optional(),
  note:              z.coerce.number().int().min(1).max(5),
  titre:             z.string().max(200).nullable().optional(),
  contenu:           z.string().max(5000).nullable().optional(),
  langue:            z.string().max(5).default('fr'),
})

export async function creerAvisManuel(input: unknown) {
  await requireManager()
  const p = avisManuelSchema.parse(input)
  const sb = await createClient()
  const { data, error } = await sb.from('avis_publics').insert({
    source: p.source,
    source_id_externe: p.source_id_externe || null,
    note: p.note,
    titre: p.titre || null,
    contenu: p.contenu || null,
    langue: p.langue,
    statut: 'en_attente',
  }).select('id').single()
  if (error || !data) throw new Error(error?.message ?? 'Erreur')
  revalidatePath('/admin/reputation')
  return { id: data.id as string }
}

const moderationSchema = z.object({
  id:     z.string().uuid(),
  statut: z.enum(['en_attente','publie','rejete','signale']),
})

export async function modererAvis(input: unknown) {
  await requireManager()
  const p = moderationSchema.parse(input)
  const sb = await createClient()
  const { error } = await sb.from('avis_publics')
    .update({ statut: p.statut })
    .eq('id', p.id)
  if (error) throw new Error(error.message)
  revalidatePath('/admin/reputation')
  return { ok: true as const }
}

const reponseSchema = z.object({
  id:       z.string().uuid(),
  reponse:  z.string().trim().min(1).max(5000),
})

export async function publierReponse(input: unknown) {
  await requireManager()
  const p = reponseSchema.parse(input)
  const sb = await createClient()
  const { error } = await sb.from('avis_publics').update({
    reponse: p.reponse,
    reponse_date: new Date().toISOString(),
  }).eq('id', p.id)
  if (error) throw new Error(error.message)
  revalidatePath('/admin/reputation')
  return { ok: true as const }
}

export async function sauverBrouillonIA(id: string, brouillon: string) {
  await requireManager()
  if (!id) throw new Error('id manquant')
  const sb = await createClient()
  const { error } = await sb.from('avis_publics')
    .update({ brouillon_reponse_ia: brouillon })
    .eq('id', id)
  if (error) throw new Error(error.message)
  revalidatePath('/admin/reputation')
  return { ok: true as const }
}

export async function supprimerAvis(id: string) {
  await requireManager()
  if (!id) throw new Error('id manquant')
  const sb = await createClient()
  const { error } = await sb.from('avis_publics').delete().eq('id', id)
  if (error) throw new Error(error.message)
  revalidatePath('/admin/reputation')
  return { ok: true as const }
}
