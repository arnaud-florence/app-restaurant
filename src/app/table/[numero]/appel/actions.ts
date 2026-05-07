'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'

const schema = z.object({
  table_id:     z.string().uuid(),
  table_numero: z.string().trim().min(1).max(20),
  motif:        z.enum(['eau', 'addition', 'aide', 'autre']),
  message:      z.string().max(500).nullable(),
})

/** Action publique appelée par /table/[numero]/appel — anti-spam : 1 appel max toutes les 10s par table. */
export async function creerAppelClient(input: unknown): Promise<{ id: string }> {
  const p = schema.parse(input)
  const supabase = await createClient()

  // Anti-spam basique : refus si un appel "en_attente" existe déjà depuis < 10s pour cette table
  const il_y_a_10s = new Date(Date.now() - 10_000).toISOString()
  const { count } = await supabase.from('appels_serveur').select('id', { count: 'exact', head: true })
    .eq('table_id', p.table_id)
    .eq('statut', 'en_attente')
    .gte('created_at', il_y_a_10s)
  if ((count ?? 0) > 0) throw new Error('Un appel a déjà été envoyé. Patientez quelques secondes.')

  const { data, error } = await supabase.from('appels_serveur').insert(p).select('id').single()
  if (error || !data) throw new Error(error?.message ?? 'Erreur')
  revalidatePath('/admin/affichage')
  revalidatePath('/serveur')
  return { id: data.id as string }
}
