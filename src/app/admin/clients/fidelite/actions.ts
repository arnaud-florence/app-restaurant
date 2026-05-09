'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { requireManager } from '@/lib/auth'
import { setConfigFidelite } from '@/lib/fidelite'

const configSchema = z.object({
  points_par_euro:          z.number().min(0).max(100),
  auto_credit_encaissement: z.boolean(),
  points_inscription:       z.number().int().min(0).max(10000),
  points_par_euro_remise:   z.number().int().min(1).max(10000),
})

export async function sauverConfigFidelite(input: unknown) {
  await requireManager()
  const p = configSchema.parse(input)
  await setConfigFidelite(p)
  revalidatePath('/admin/clients/fidelite')
  return { ok: true as const }
}
