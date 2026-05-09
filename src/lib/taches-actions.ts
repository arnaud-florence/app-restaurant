'use server'

// Server actions pour persister les tâches du jour cochées par employé.
// L'employe_id doit être fourni explicitement (le widget tourne aussi en
// kiosk où l'employé est sélectionné via le widget /serveur, pas via session).
//
// Sécurité : un employé connecté ne peut agir QUE pour son propre profil.
// Manager : libre. Kiosk : libre (mode tablette partagée).

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { getProfile } from '@/lib/auth'

async function autoriserPour(employeId: string) {
  const profil = await getProfile()
  if (!profil) return                                    // kiosk
  if (profil.role === 'manager') return                  // manager bypass
  if (profil.employe_id !== employeId) {
    throw new Error('Tu ne peux cocher des tâches qu\'au nom de ton propre profil.')
  }
}

const cocherSchema = z.object({
  employe_id:  z.string().uuid(),
  tache_id:    z.string().min(1).max(50),
  poste:       z.string().min(1).max(50),
  moment:      z.enum(['matin', 'service', 'fin']),
  obligatoire: z.boolean().default(false),
})

export async function cocherTache(input: unknown): Promise<{ ok: true }> {
  const p = cocherSchema.parse(input)
  await autoriserPour(p.employe_id)

  const supabase = await createClient()
  const { error } = await supabase.from('taches_completees').upsert({
    employe_id:  p.employe_id,
    tache_id:    p.tache_id,
    poste:       p.poste,
    moment:      p.moment,
    obligatoire: p.obligatoire,
    date:        new Date().toISOString().slice(0, 10),
  }, { onConflict: 'employe_id,tache_id,date' })
  if (error) throw new Error(error.message)

  revalidatePath('/admin/pilotage')
  return { ok: true as const }
}

const decocherSchema = z.object({
  employe_id: z.string().uuid(),
  tache_id:   z.string().min(1).max(50),
})

export async function decocherTache(input: unknown): Promise<{ ok: true }> {
  const p = decocherSchema.parse(input)
  await autoriserPour(p.employe_id)

  const supabase = await createClient()
  const { error } = await supabase.from('taches_completees').delete()
    .eq('employe_id', p.employe_id)
    .eq('tache_id', p.tache_id)
    .eq('date', new Date().toISOString().slice(0, 10))
  if (error) throw new Error(error.message)

  revalidatePath('/admin/pilotage')
  return { ok: true as const }
}
