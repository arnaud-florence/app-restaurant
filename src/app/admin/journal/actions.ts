'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'

const entreeSchema = z.object({
  date_entree:     z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  titre:           z.string().max(200).nullable(),
  contenu:         z.string().trim().min(1).max(20000),
  humeur:          z.enum(['tres_bonne','bonne','normale','difficile','tres_difficile']),
  photos_urls:     z.array(z.string()).default([]),
  tags:            z.array(z.string()).default([]),
  faits_marquants: z.string().max(1000).nullable(),
  redacteur_id:    z.string().uuid().nullable(),
})

export async function creerEntree(input: unknown): Promise<{ id: string }> {
  const p = entreeSchema.parse(input)
  const supabase = await createClient()

  // Snapshot auto météo + CA du jour
  const [meteoRes, caRes, cmdRes] = await Promise.all([
    supabase.from('releves_meteo').select('conditions').eq('date_meteo', p.date_entree).eq('est_prevision', false).maybeSingle(),
    supabase.from('paiements_caisse').select('montant').gte('encaisse_at', p.date_entree + 'T00:00:00').lte('encaisse_at', p.date_entree + 'T23:59:59'),
    supabase.from('commandes').select('id', { count: 'exact', head: true })
      .eq('statut', 'encaisse')
      .gte('created_at', p.date_entree + 'T00:00:00')
      .lte('created_at', p.date_entree + 'T23:59:59'),
  ])

  const ca_jour = (caRes.data ?? []).reduce((s, x) => s + Number(x.montant ?? 0), 0)
  const ca_jour_snap = Math.round(ca_jour * 100) / 100
  const nb_couverts_snap = cmdRes.count ?? 0
  const meteo_snap = (meteoRes.data?.conditions as string) ?? null

  const { data, error } = await supabase.from('journal_entrees').insert({
    ...p,
    ca_jour_snap,
    nb_couverts_snap,
    meteo_snap,
  }).select('id').single()
  if (error || !data) throw new Error(error?.message ?? 'Erreur')
  revalidatePath('/admin/journal')
  return { id: data.id as string }
}

const updateEntreeSchema = entreeSchema.extend({ id: z.string().uuid() })

export async function updateEntree(input: unknown) {
  const p = updateEntreeSchema.parse(input)
  const { id, ...rest } = p
  const supabase = await createClient()
  const { error } = await supabase.from('journal_entrees').update({ ...rest, updated_at: new Date().toISOString() }).eq('id', id)
  if (error) throw new Error(error.message)
  revalidatePath('/admin/journal')
  return { ok: true as const }
}

export async function supprimerEntree(id: string) {
  if (!id) throw new Error('id manquant')
  const supabase = await createClient()
  const { error } = await supabase.from('journal_entrees').delete().eq('id', id)
  if (error) throw new Error(error.message)
  revalidatePath('/admin/journal')
  return { ok: true as const }
}
