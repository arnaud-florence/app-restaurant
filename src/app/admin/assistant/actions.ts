'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { genererSnapshot } from '@/lib/assistant/snapshot'
import { detecterAnomalies } from '@/lib/assistant/anomalies'

const MODEL = 'claude-haiku-4-5'

export async function creerConversation(input: { titre?: string }): Promise<{ id: string }> {
  const titre = (input.titre ?? 'Nouvelle conversation').slice(0, 200)
  const supabase = await createClient()

  // Snapshot + anomalies au démarrage de la conversation (gelés)
  const snapshot = await genererSnapshot(supabase)
  const anomalies = detecterAnomalies(snapshot)

  const { data, error } = await supabase.from('assistant_conversations').insert({
    titre,
    modele: MODEL,
    contexte_snap: { snapshot, anomalies },
  }).select('id').single()
  if (error || !data) throw new Error(error?.message ?? 'Erreur création conversation')
  revalidatePath('/admin/assistant')
  return { id: data.id as string }
}

const renommerSchema = z.object({ id: z.string().uuid(), titre: z.string().trim().min(1).max(200) })
export async function renommerConversation(input: unknown) {
  const p = renommerSchema.parse(input)
  const supabase = await createClient()
  const { error } = await supabase.from('assistant_conversations').update({ titre: p.titre }).eq('id', p.id)
  if (error) throw new Error(error.message)
  revalidatePath('/admin/assistant')
  return { ok: true as const }
}

export async function supprimerConversation(id: string) {
  if (!id) throw new Error('id manquant')
  const supabase = await createClient()
  const { error } = await supabase.from('assistant_conversations').delete().eq('id', id)
  if (error) throw new Error(error.message)
  revalidatePath('/admin/assistant')
  return { ok: true as const }
}

export async function archiverConversation(id: string, archivee: boolean) {
  if (!id) throw new Error('id manquant')
  const supabase = await createClient()
  const { error } = await supabase.from('assistant_conversations').update({ archivee }).eq('id', id)
  if (error) throw new Error(error.message)
  revalidatePath('/admin/assistant')
  return { ok: true as const }
}

/** Re-génère le snapshot (utile si la conversation s'éternise). */
export async function rafraichirContexte(id: string) {
  if (!id) throw new Error('id manquant')
  const supabase = await createClient()
  const snapshot = await genererSnapshot(supabase)
  const anomalies = detecterAnomalies(snapshot)
  const { error } = await supabase.from('assistant_conversations')
    .update({ contexte_snap: { snapshot, anomalies } })
    .eq('id', id)
  if (error) throw new Error(error.message)
  revalidatePath('/admin/assistant')
  return { ok: true as const }
}
