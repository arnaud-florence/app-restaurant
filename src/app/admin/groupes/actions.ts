'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'

// ─── Groupes ───────────────────────────────────────────────────────

const groupeSchema = z.object({
  nom:                       z.string().trim().min(1).max(200),
  type:                      z.enum(['tourisme','entreprise','famille','scolaire','associatif','autre']),
  tour_operateur:            z.string().max(200).nullable(),
  contact_nom:               z.string().max(200).nullable(),
  contact_telephone:         z.string().max(30).nullable(),
  contact_email:             z.string().email().nullable().or(z.literal('').transform(() => null)),
  date_visite:               z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  heure_arrivee:             z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/).nullable(),
  heure_depart:              z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/).nullable(),
  nb_personnes:              z.number().int().min(1),
  prix_par_personne_ht:      z.number().min(0),
  taux_tva:                  z.number().min(0).max(100).default(10),
  facturation_via_to:        z.boolean().default(false),
  statut:                    z.enum(['demande','confirme','realise','annule']).default('demande'),
  notes:                     z.string().max(2000).nullable(),
  zone_assignee:             z.string().max(100).nullable(),
  responsable_employe_id:    z.string().uuid().nullable(),
})

export async function creerGroupe(input: unknown): Promise<{ id: string }> {
  const p = groupeSchema.parse(input)
  const supabase = await createClient()
  const { data, error } = await supabase.from('groupes').insert(p).select('id').single()
  if (error || !data) throw new Error(error?.message ?? 'Erreur')
  revalidatePath('/admin/groupes')
  return { id: data.id as string }
}

const updateGroupeSchema = groupeSchema.extend({ id: z.string().uuid() })

export async function updateGroupe(input: unknown) {
  const p = updateGroupeSchema.parse(input)
  const { id, ...rest } = p
  const supabase = await createClient()
  const { error } = await supabase.from('groupes').update({ ...rest, updated_at: new Date().toISOString() }).eq('id', id)
  if (error) throw new Error(error.message)
  revalidatePath('/admin/groupes')
  return { ok: true as const }
}

export async function changerStatutGroupe(id: string, statut: 'demande' | 'confirme' | 'realise' | 'annule') {
  if (!id) throw new Error('id manquant')
  const supabase = await createClient()
  const { error } = await supabase.from('groupes').update({ statut }).eq('id', id)
  if (error) throw new Error(error.message)
  revalidatePath('/admin/groupes')
  return { ok: true as const }
}

export async function supprimerGroupe(id: string) {
  if (!id) throw new Error('id manquant')
  const supabase = await createClient()
  const { error } = await supabase.from('groupes').delete().eq('id', id)
  if (error) throw new Error(error.message)
  revalidatePath('/admin/groupes')
  return { ok: true as const }
}

// ─── Menu groupe ───────────────────────────────────────────────────

const menuSchema = z.object({
  groupe_id:               z.string().uuid(),
  recette_id:              z.string().uuid().nullable(),
  recette_nom_libre:       z.string().max(200).nullable(),
  categorie:               z.string().max(50).nullable(),
  quantite_par_personne:   z.number().min(0).default(1),
  prix_negocie_ht:         z.number().min(0).nullable(),
  ordre:                   z.number().int().default(0),
  notes:                   z.string().max(500).nullable(),
})

export async function ajouterPlat(input: unknown): Promise<{ id: string }> {
  const p = menuSchema.parse(input)
  if (!p.recette_id && !p.recette_nom_libre?.trim()) {
    throw new Error('recette_id OU recette_nom_libre obligatoire')
  }
  const supabase = await createClient()
  const { data, error } = await supabase.from('groupes_menus').insert(p).select('id').single()
  if (error || !data) throw new Error(error?.message ?? 'Erreur')
  revalidatePath('/admin/groupes')
  return { id: data.id as string }
}

export async function supprimerPlat(id: string) {
  if (!id) throw new Error('id manquant')
  const supabase = await createClient()
  const { error } = await supabase.from('groupes_menus').delete().eq('id', id)
  if (error) throw new Error(error.message)
  revalidatePath('/admin/groupes')
  return { ok: true as const }
}

// ─── Paiements ─────────────────────────────────────────────────────

const paiementSchema = z.object({
  groupe_id:     z.string().uuid(),
  type:          z.enum(['arrhes','acompte','solde','remboursement']),
  date_paiement: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  montant:       z.number().min(0),
  methode:       z.enum(['especes','carte','virement','cheque','autre']),
  reference:     z.string().max(100).nullable(),
  notes:         z.string().max(500).nullable(),
})

export async function enregistrerPaiement(input: unknown): Promise<{ id: string }> {
  const p = paiementSchema.parse(input)
  const supabase = await createClient()
  const { data, error } = await supabase.from('groupes_paiements').insert(p).select('id').single()
  if (error || !data) throw new Error(error?.message ?? 'Erreur')
  revalidatePath('/admin/groupes')
  return { id: data.id as string }
}

export async function supprimerPaiement(id: string) {
  if (!id) throw new Error('id manquant')
  const supabase = await createClient()
  const { error } = await supabase.from('groupes_paiements').delete().eq('id', id)
  if (error) throw new Error(error.message)
  revalidatePath('/admin/groupes')
  return { ok: true as const }
}
