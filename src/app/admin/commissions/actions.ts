'use server'

import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'

const addSchema = z.object({
  etablissement_id: z.string().uuid(),
  periode_debut: z.string().min(8),   // YYYY-MM-DD
  periode_fin: z.string().min(8),
  montant_commission: z.number().min(0),
  montant_brut_transite: z.number().min(0).nullable().optional(),
  nb_operations: z.number().int().min(0).nullable().optional(),
  notes: z.string().max(500).nullable().optional(),
})

export async function addCommission(input: z.infer<typeof addSchema>) {
  try {
    const parsed = addSchema.safeParse(input)
    if (!parsed.success) {
      return { ok: false as const, error: 'Saisie invalide : ' + parsed.error.issues.map(i => i.message).join(', ') }
    }
    const d = parsed.data
    const sb = await createClient()
    const { error } = await sb.from('commissions_tiers').insert({
      etablissement_id: d.etablissement_id,
      periode_debut: d.periode_debut,
      periode_fin: d.periode_fin,
      montant_commission: d.montant_commission,
      montant_brut_transite: d.montant_brut_transite ?? null,
      nb_operations: d.nb_operations ?? null,
      notes: d.notes || null,
    })
    if (error) return { ok: false as const, error: error.message }
    return { ok: true as const }
  } catch (e) {
    return { ok: false as const, error: e instanceof Error ? e.message : String(e) }
  }
}

export async function deleteCommission(id: string) {
  try {
    const parsed = z.string().uuid().safeParse(id)
    if (!parsed.success) return { ok: false as const, error: 'id invalide' }
    const sb = await createClient()
    const { error } = await sb.from('commissions_tiers').delete().eq('id', parsed.data)
    if (error) return { ok: false as const, error: error.message }
    return { ok: true as const }
  } catch (e) {
    return { ok: false as const, error: e instanceof Error ? e.message : String(e) }
  }
}
