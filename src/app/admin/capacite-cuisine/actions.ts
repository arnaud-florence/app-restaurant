'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { requireManager } from '@/lib/auth'

const creneauSchema = z.object({
  tag_destination:   z.enum(['CUISINE','SNACKING','PIZZA','BAR']).default('SNACKING'),
  jour_semaine:      z.coerce.number().int().min(0).max(6),
  heure_debut:       z.string().regex(/^\d{2}:\d{2}/, 'Format HH:MM'),
  heure_fin:         z.string().regex(/^\d{2}:\d{2}/, 'Format HH:MM'),
  duree_creneau_min: z.coerce.number().int().min(5).max(120).default(15),
  max_commandes:     z.coerce.number().int().min(1).max(500),
  actif:             z.boolean().default(true),
})

function normalizeHeure(h: string): string {
  // S'assure du format HH:MM:SS pour PostgreSQL time
  const parts = h.split(':')
  if (parts.length === 2) return `${parts[0]}:${parts[1]}:00`
  return h
}

function validerHoraire(debut: string, fin: string) {
  if (debut >= fin) throw new Error('Heure début doit être < heure fin')
}

export async function creerCreneauCapacite(input: unknown) {
  await requireManager()
  const p = creneauSchema.parse(input)
  validerHoraire(p.heure_debut, p.heure_fin)
  const sb = await createClient()
  const { data, error } = await sb.from('capacite_cuisine_par_creneau').insert({
    tag_destination: p.tag_destination,
    jour_semaine: p.jour_semaine,
    heure_debut: normalizeHeure(p.heure_debut),
    heure_fin: normalizeHeure(p.heure_fin),
    duree_creneau_min: p.duree_creneau_min,
    max_commandes: p.max_commandes,
    actif: p.actif,
  }).select('id').single()
  if (error || !data) throw new Error(error?.message ?? 'Erreur')
  revalidatePath('/admin/capacite-cuisine')
  return { id: data.id as string }
}

const updateSchema = creneauSchema.extend({ id: z.string().uuid() })

export async function modifierCreneauCapacite(input: unknown) {
  await requireManager()
  const p = updateSchema.parse(input)
  validerHoraire(p.heure_debut, p.heure_fin)
  const sb = await createClient()
  const { error } = await sb.from('capacite_cuisine_par_creneau').update({
    tag_destination: p.tag_destination,
    jour_semaine: p.jour_semaine,
    heure_debut: normalizeHeure(p.heure_debut),
    heure_fin: normalizeHeure(p.heure_fin),
    duree_creneau_min: p.duree_creneau_min,
    max_commandes: p.max_commandes,
    actif: p.actif,
  }).eq('id', p.id)
  if (error) throw new Error(error.message)
  revalidatePath('/admin/capacite-cuisine')
  return { ok: true as const }
}

export async function toggleCreneauCapacite(id: string, actif: boolean) {
  await requireManager()
  if (!id) throw new Error('id manquant')
  const sb = await createClient()
  const { error } = await sb.from('capacite_cuisine_par_creneau').update({ actif }).eq('id', id)
  if (error) throw new Error(error.message)
  revalidatePath('/admin/capacite-cuisine')
  return { ok: true as const }
}

export async function supprimerCreneauCapacite(id: string) {
  await requireManager()
  if (!id) throw new Error('id manquant')
  const sb = await createClient()
  const { error } = await sb.from('capacite_cuisine_par_creneau').delete().eq('id', id)
  if (error) throw new Error(error.message)
  revalidatePath('/admin/capacite-cuisine')
  return { ok: true as const }
}

// Helper : applique un preset standard (déjeuner + dîner sur tous les jours)
export async function appliquerPresetStandard() {
  await requireManager()
  const sb = await createClient()

  // Vérifie qu'il n'y a pas déjà des créneaux pour éviter doublons
  const { count } = await sb.from('capacite_cuisine_par_creneau')
    .select('id', { count: 'exact', head: true })
  if ((count ?? 0) > 0) {
    throw new Error('Des créneaux existent déjà. Supprime-les d\'abord pour appliquer le preset.')
  }

  // Preset SNACKING (zone la plus concernée par les commandes ONLINE)
  // 7 jours × 2 services. L'admin pourra ensuite dupliquer pour PIZZA / BAR.
  const presets: Array<{ jour: number; debut: string; fin: string; max: number }> = []
  for (let jour = 1; jour <= 6; jour++) {  // lun-sam
    presets.push({ jour, debut: '11:30', fin: '14:00', max: 8 })
    presets.push({ jour, debut: '18:30', fin: '22:00', max: 10 })
  }
  presets.push({ jour: 0, debut: '11:30', fin: '14:30', max: 6 })

  const rows = presets.map(p => ({
    tag_destination: 'SNACKING',
    jour_semaine: p.jour,
    heure_debut: `${p.debut}:00`,
    heure_fin: `${p.fin}:00`,
    duree_creneau_min: 15,
    max_commandes: p.max,
    actif: true,
  }))

  const { error } = await sb.from('capacite_cuisine_par_creneau').insert(rows)
  if (error) throw new Error(error.message)
  revalidatePath('/admin/capacite-cuisine')
  return { ok: true as const, nb: rows.length }
}
