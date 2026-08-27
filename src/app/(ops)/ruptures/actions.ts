'use server'

// Rupture du jour — bascule depuis le comptoir (0141).

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'

const schema = z.object({
  recette_id: z.string().uuid(),
  /** true = en rupture aujourd'hui, false = disponible à nouveau. */
  rupture: z.boolean(),
})

const jourParis = () =>
  new Intl.DateTimeFormat('fr-CA', {
    timeZone: 'Europe/Paris', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date())

export async function basculerRupture(input: unknown) {
  const p = schema.parse(input)
  const supabase = await createClient()

  // La date est posée côté SERVEUR : une tablette dont l'horloge dérive
  // marquerait sinon une rupture pour hier, et la caisse ne la verrait jamais.
  const { error } = await supabase
    .from('recettes')
    .update({ rupture_le: p.rupture ? jourParis() : null })
    .eq('id', p.recette_id)
  if (error) throw new Error(error.message)

  revalidatePath('/ruptures')
  // Le site public lit la disponibilité : il doit suivre tout de suite.
  revalidatePath('/api/public/menu')
  return { ok: true as const }
}
