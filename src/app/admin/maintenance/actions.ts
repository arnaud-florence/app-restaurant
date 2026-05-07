'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'

// ─── Équipements ───────────────────────────────────────────────────

const equipSchema = z.object({
  nom:                          z.string().trim().min(1).max(200),
  marque:                       z.string().max(100).nullable(),
  modele:                       z.string().max(100).nullable(),
  numero_serie:                 z.string().max(100).nullable(),
  date_achat:                   z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
  valeur_achat:                 z.number().min(0).nullable(),
  garantie_fin:                 z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
  prestataire_maintenance:      z.string().max(200).nullable(),
  contact_prestataire:          z.string().max(200).nullable(),
  frequence_maintenance:        z.string().max(100).nullable(),
  prochaine_maintenance:        z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
  categorie:                    z.enum(['cuisine','froid','chaud','laverie','climatisation','securite','divers']).nullable(),
  type_controle_obligatoire:    z.enum(['electricite','gaz','extincteur','hotte','desenfumage','climatisation','autre']).nullable(),
  prochain_controle_obligatoire: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
  derniere_controle_obligatoire: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
  organisme_certifie:           z.string().max(200).nullable(),
})

export async function creerEquipement(input: unknown): Promise<{ id: string }> {
  const p = equipSchema.parse(input)
  const supabase = await createClient()
  const { data, error } = await supabase.from('equipements').insert({ ...p, actif: true }).select('id').single()
  if (error || !data) throw new Error(error?.message ?? 'Erreur')
  revalidatePath('/admin/maintenance')
  return { id: data.id as string }
}

const updateEquipSchema = equipSchema.extend({ id: z.string().uuid() })

export async function updateEquipement(input: unknown) {
  const p = updateEquipSchema.parse(input)
  const { id, ...rest } = p
  const supabase = await createClient()
  const { error } = await supabase.from('equipements').update(rest).eq('id', id)
  if (error) throw new Error(error.message)
  revalidatePath('/admin/maintenance')
  return { ok: true as const }
}

export async function archiverEquipement(id: string) {
  if (!id) throw new Error('id manquant')
  const supabase = await createClient()
  const { error } = await supabase.from('equipements').update({ actif: false }).eq('id', id)
  if (error) throw new Error(error.message)
  revalidatePath('/admin/maintenance')
  return { ok: true as const }
}

// ─── Interventions ─────────────────────────────────────────────────

const interSchema = z.object({
  equipement_id:          z.string().uuid().nullable(),
  type:                   z.enum(['preventive','curative','controle_obligatoire']),
  date_intervention:      z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  description:            z.string().max(2000).nullable(),
  prestataire:            z.string().max(200).nullable(),
  cout:                   z.number().min(0).default(0),
  prochaine_intervention: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
  documents_url:          z.array(z.string()).default([]),
})

export async function creerIntervention(input: unknown): Promise<{ id: string }> {
  const p = interSchema.parse(input)
  const supabase = await createClient()
  const { data, error } = await supabase.from('interventions_maintenance').insert(p).select('id').single()
  if (error || !data) throw new Error(error?.message ?? 'Erreur')

  // Si contrôle obligatoire : met à jour les dates sur l'équipement
  if (p.type === 'controle_obligatoire' && p.equipement_id) {
    await supabase.from('equipements').update({
      derniere_controle_obligatoire: p.date_intervention,
      prochain_controle_obligatoire: p.prochaine_intervention ?? null,
    }).eq('id', p.equipement_id)
  } else if (p.type === 'preventive' && p.equipement_id && p.prochaine_intervention) {
    await supabase.from('equipements').update({
      prochaine_maintenance: p.prochaine_intervention,
    }).eq('id', p.equipement_id)
  }

  revalidatePath('/admin/maintenance')
  return { id: data.id as string }
}

export async function supprimerIntervention(id: string) {
  if (!id) throw new Error('id manquant')
  const supabase = await createClient()
  const { error } = await supabase.from('interventions_maintenance').delete().eq('id', id)
  if (error) throw new Error(error.message)
  revalidatePath('/admin/maintenance')
  return { ok: true as const }
}
