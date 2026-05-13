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
  tache_id:    z.string().min(1).max(80),
  poste:       z.string().min(1).max(50),
  moment:      z.enum(['matin', 'service', 'fin']),
  obligatoire: z.boolean().default(false),
})

export async function cocherTache(input: unknown): Promise<{ ok: true }> {
  let p
  try { p = cocherSchema.parse(input) }
  catch (e) {
    console.error('[cocherTache] validation failed:', e, 'input:', input)
    throw new Error(`Tâche invalide : ${e instanceof Error ? e.message : 'inconnue'}`)
  }
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
  if (error) {
    console.error('[cocherTache] DB upsert failed:', error, 'payload:', p)
    throw new Error(`DB : ${error.message}`)
  }

  // revalidatePath retiré : si /admin/pilotage est en erreur (build), ça crash
  // tout le serveur en cascade. Les pages se rafraîchiront au prochain GET.
  return { ok: true as const }
}

const decocherSchema = z.object({
  employe_id: z.string().uuid(),
  tache_id:   z.string().min(1).max(80),
})

// Enregistre une valeur saisie pour une tâche (température, montant, kilométrage…).
// L'enregistrement de saisie ne marque PAS la tâche complétée — l'UI chaîne
// `enregistrerSaisie` puis `cocherTache` à la validation finale.
const saisirSchema = z.object({
  employe_id:   z.string().uuid(),
  tache_id:     z.string().min(1).max(80),
  poste:        z.string().min(1).max(50),
  moment:       z.enum(['matin', 'service', 'fin']),
  type_saisie:  z.enum(['temperature', 'montant', 'nombre', 'texte']),
  valeur_num:   z.number().nullable().optional(),
  valeur_texte: z.string().max(500).nullable().optional(),
  unite:        z.string().max(20).nullable().optional(),
  commentaire:  z.string().max(500).nullable().optional(),
})

export async function enregistrerSaisie(input: unknown): Promise<{ ok: true }> {
  let p
  try { p = saisirSchema.parse(input) }
  catch (e) {
    console.error('[enregistrerSaisie] validation failed:', e, 'input:', input)
    throw new Error(`Saisie invalide : ${e instanceof Error ? e.message : 'inconnue'}`)
  }
  await autoriserPour(p.employe_id)

  const supabase = await createClient()
  const { error } = await supabase.from('valeurs_saisies_taches').insert({
    tache_id:     p.tache_id,
    employe_id:   p.employe_id,
    poste:        p.poste,
    moment:       p.moment,
    type_saisie:  p.type_saisie,
    valeur_num:   p.valeur_num ?? null,
    valeur_texte: p.valeur_texte ?? null,
    unite:        p.unite ?? null,
    commentaire:  p.commentaire ?? null,
  })
  if (error) {
    console.error('[enregistrerSaisie] DB insert failed:', error, 'payload:', p)
    throw new Error(`DB : ${error.message}`)
  }

  // revalidatePath retiré : voir cocherTache pour la raison.
  return { ok: true as const }
}

export async function decocherTache(input: unknown): Promise<{ ok: true }> {
  const p = decocherSchema.parse(input)
  await autoriserPour(p.employe_id)

  const supabase = await createClient()
  const { error } = await supabase.from('taches_completees').delete()
    .eq('employe_id', p.employe_id)
    .eq('tache_id', p.tache_id)
    .eq('date', new Date().toISOString().slice(0, 10))
  if (error) throw new Error(error.message)

  return { ok: true as const }
}
