'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { ALLERGENES_EU } from '@/lib/allergenes'
import { requireWritable } from '@/lib/auth'
import { getPosteFilter } from '@/lib/permissions'

// ─── Recette : override allergènes complémentaires ────────────────

const setAllergenesSchema = z.object({
  recette_id:                  z.string().uuid(),
  allergenes_complementaires:  z.array(z.enum(ALLERGENES_EU as [string, ...string[]])),
})

export async function setAllergenesComplementaires(input: unknown) {
  const profil = await requireWritable('/admin/allergenes')
  const p = setAllergenesSchema.parse(input)
  const supabase = await createClient()
  // Vérifie que la recette ciblée est dans le périmètre du poste
  const filter = getPosteFilter(profil.poste)
  if (filter.recetteTags) {
    const { data: existing } = await supabase.from('recettes').select('tag_destination').eq('id', p.recette_id).maybeSingle()
    if (!existing || !(filter.recetteTags as readonly string[]).includes(existing.tag_destination as string)) {
      throw new Error('Cette recette n\'est pas dans votre périmètre.')
    }
  }
  // Enregistrer, c'est VALIDER (0138). Sans cette date, une liste vide reste
  // ambiguë — « aucun allergène » ou « personne n'a regardé » ? — et la page
  // publique affichait une coche verte rassurante sur un croissant.
  // La validation est nominative : une déclaration d'allergènes engage.
  const { error } = await supabase
    .from('recettes')
    .update({
      allergenes_complementaires: p.allergenes_complementaires,
      allergenes_valides_le: new Date().toISOString(),
      allergenes_valides_par: profil.email ?? profil.id ?? null,
    })
    .eq('id', p.recette_id)
  if (error) throw new Error(error.message)
  revalidatePath('/admin/allergenes')
  revalidatePath('/menu-allergenes')
  return { ok: true as const }
}

// ─── Procédures d'urgence ──────────────────────────────────────────

const procUrgSchema = z.object({
  titre:     z.string().trim().min(1).max(200),
  type:      z.enum(['allergie','incendie','evacuation','malaise','intoxication','vol','autre']),
  etapes:    z.array(z.string().trim().min(1).max(500)).min(1, 'Au moins une étape'),
  contacts:  z.string().max(500).nullable(),
  ordre:     z.number().int().default(0),
})

export async function creerProcedureUrgence(input: unknown): Promise<{ id: string }> {
  await requireWritable('/admin/allergenes')
  const p = procUrgSchema.parse(input)
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('procedures_urgence')
    .insert({ ...p, actif: true })
    .select('id').single()
  if (error || !data) throw new Error(error?.message ?? 'Erreur')
  revalidatePath('/admin/allergenes')
  return { id: data.id as string }
}

const updateProcUrgSchema = procUrgSchema.extend({
  id: z.string().uuid(),
})

export async function updateProcedureUrgence(input: unknown) {
  await requireWritable('/admin/allergenes')
  const p = updateProcUrgSchema.parse(input)
  const supabase = await createClient()
  const { id, ...rest } = p
  const { error } = await supabase
    .from('procedures_urgence')
    .update({ ...rest, updated_at: new Date().toISOString() })
    .eq('id', id)
  if (error) throw new Error(error.message)
  revalidatePath('/admin/allergenes')
  return { ok: true as const }
}

export async function supprimerProcedureUrgence(id: string) {
  if (!id) throw new Error('id manquant')
  await requireWritable('/admin/allergenes')
  const supabase = await createClient()
  const { error } = await supabase.from('procedures_urgence').update({ actif: false }).eq('id', id)
  if (error) throw new Error(error.message)
  revalidatePath('/admin/allergenes')
  return { ok: true as const }
}
