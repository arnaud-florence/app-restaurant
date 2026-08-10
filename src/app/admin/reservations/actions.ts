'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { requireWritable } from '@/lib/auth'

// ─── Chambres ──────────────────────────────────────────────────────

const chambreSchema = z.object({
  nom:           z.string().trim().min(1).max(100),
  numero:        z.string().trim().min(1).max(20),
  capacite:      z.number().int().min(1).default(2),
  prix_nuit_ht:  z.number().min(0),
  description:   z.string().max(2000).nullable(),
  equipements:   z.array(z.string()).default([]),
  photos:        z.array(z.string()).default([]),
})

export async function creerChambre(input: unknown): Promise<{ id: string }> {
  await requireWritable('/admin/reservations')
  const p = chambreSchema.parse(input)
  const supabase = await createClient()
  const { data, error } = await supabase.from('chambres').insert({ ...p, actif: true }).select('id').single()
  if (error || !data) throw new Error(error?.message ?? 'Erreur')
  revalidatePath('/admin/reservations')
  return { id: data.id as string }
}

export async function archiverChambre(id: string) {
  if (!id) throw new Error('id manquant')
  await requireWritable('/admin/reservations')
  const supabase = await createClient()
  const { error } = await supabase.from('chambres').update({ actif: false }).eq('id', id)
  if (error) throw new Error(error.message)
  revalidatePath('/admin/reservations')
  return { ok: true as const }
}

// ─── Réservations chambres ────────────────────────────────────────

const resaChambreSchema = z.object({
  chambre_id:       z.string().uuid(),
  client_nom:       z.string().trim().min(1).max(200),
  client_email:     z.string().email().nullable().or(z.literal('').transform(() => null)),
  client_telephone: z.string().max(30).nullable(),
  date_arrivee:     z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  date_depart:      z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  nb_personnes:     z.number().int().min(1),
  montant_total:    z.number().min(0),
  acompte_verse:    z.number().min(0).default(0),
  notes:            z.string().max(1000).nullable(),
})

export async function creerResaChambre(input: unknown): Promise<{ id: string }> {
  await requireWritable('/admin/reservations')
  const p = resaChambreSchema.parse(input)
  if (new Date(p.date_depart) <= new Date(p.date_arrivee)) throw new Error('Date départ > date arrivée')
  const supabase = await createClient()
  // Anti double-réservation : refuse si la chambre est déjà prise sur des dates qui
  // chevauchent (arrivée < départ demandé ET départ > arrivée demandée), hors annulées.
  const { data: conflits } = await supabase.from('reservations_chambres')
    .select('id')
    .eq('chambre_id', p.chambre_id)
    .neq('statut', 'annulee')
    .lt('date_arrivee', p.date_depart)
    .gt('date_depart', p.date_arrivee)
    .limit(1)
  if (conflits && conflits.length > 0) {
    throw new Error('Cette chambre est déjà réservée sur ces dates. Choisis une autre chambre ou d\'autres dates.')
  }
  const { data, error } = await supabase.from('reservations_chambres').insert({ ...p, statut: 'demande' }).select('id').single()
  if (error || !data) throw new Error(error?.message ?? 'Erreur')
  revalidatePath('/admin/reservations')
  return { id: data.id as string }
}

export async function changerStatutResaChambre(id: string, statut: 'demande' | 'confirmee' | 'arrivee' | 'terminee' | 'annulee') {
  if (!id) throw new Error('id manquant')
  await requireWritable('/admin/reservations')
  const supabase = await createClient()
  const { error } = await supabase.from('reservations_chambres').update({ statut }).eq('id', id)
  if (error) throw new Error(error.message)
  revalidatePath('/admin/reservations')
  return { ok: true as const }
}

export async function ajusterAcompte(id: string, acompte: number) {
  if (!id) throw new Error('id manquant')
  await requireWritable('/admin/reservations')
  const supabase = await createClient()
  const { error } = await supabase.from('reservations_chambres').update({ acompte_verse: acompte }).eq('id', id)
  if (error) throw new Error(error.message)
  revalidatePath('/admin/reservations')
  return { ok: true as const }
}

export async function supprimerResaChambre(id: string) {
  if (!id) throw new Error('id manquant')
  await requireWritable('/admin/reservations')
  const supabase = await createClient()
  const { error } = await supabase.from('reservations_chambres').delete().eq('id', id)
  if (error) throw new Error(error.message)
  revalidatePath('/admin/reservations')
  return { ok: true as const }
}

// ─── Réservations tables/terrasse ─────────────────────────────────

const resaTableSchema = z.object({
  table_id:         z.string().uuid().nullable(),
  zone:             z.string().max(50).nullable(),
  date_resa:        z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  heure_arrivee:    z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/),
  heure_depart:     z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/).nullable(),
  nb_personnes:     z.number().int().min(1),
  client_nom:       z.string().trim().min(1).max(200),
  client_telephone: z.string().max(30).nullable(),
  client_email:     z.string().email().nullable().or(z.literal('').transform(() => null)),
  client_id:        z.string().uuid().nullable(),
  notes:            z.string().max(500).nullable(),
})

export async function creerResaTable(input: unknown): Promise<{ id: string }> {
  await requireWritable('/admin/reservations')
  const p = resaTableSchema.parse(input)
  const supabase = await createClient()
  const { data, error } = await supabase.from('reservations_tables').insert({ ...p, statut: 'confirmee' }).select('id').single()
  if (error || !data) throw new Error(error?.message ?? 'Erreur')
  revalidatePath('/admin/reservations')
  return { id: data.id as string }
}

export async function changerStatutResaTable(id: string, statut: 'demande' | 'confirmee' | 'arrivee' | 'terminee' | 'no_show' | 'annulee') {
  if (!id) throw new Error('id manquant')
  await requireWritable('/admin/reservations')
  const supabase = await createClient()
  const { error } = await supabase.from('reservations_tables').update({ statut }).eq('id', id)
  if (error) throw new Error(error.message)
  revalidatePath('/admin/reservations')
  return { ok: true as const }
}

export async function supprimerResaTable(id: string) {
  if (!id) throw new Error('id manquant')
  await requireWritable('/admin/reservations')
  const supabase = await createClient()
  const { error } = await supabase.from('reservations_tables').delete().eq('id', id)
  if (error) throw new Error(error.message)
  revalidatePath('/admin/reservations')
  return { ok: true as const }
}

// ─── Événements ────────────────────────────────────────────────────

const eventSchema = z.object({
  titre:                z.string().trim().min(1).max(200),
  type_evenement:       z.enum(['mariage','anniversaire','seminaire','cocktail','banquet','enterrement_vie','privatisation','autre']).nullable(),
  date_evenement:       z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  heure_debut:          z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/).nullable(),
  heure_fin:            z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/).nullable(),
  nb_personnes:         z.number().int().min(1),
  prix_par_personne_ht: z.number().min(0).nullable(),
  taux_tva:             z.number().min(0).max(100).default(10),
  montant_devis:        z.number().min(0),
  acompte_verse:        z.number().min(0).default(0),
  client_nom:           z.string().max(200).nullable(),
  client_email:         z.string().email().nullable().or(z.literal('').transform(() => null)),
  client_telephone:     z.string().max(30).nullable(),
  lieu:                 z.string().max(200).nullable(),
  privatisation:        z.boolean().default(false),
  materiel_demande:     z.string().max(2000).nullable(),
  besoins_techniques:   z.string().max(2000).nullable(),
  notes:                z.string().max(2000).nullable(),
})

export async function creerEvenement(input: unknown): Promise<{ id: string }> {
  await requireWritable('/admin/reservations')
  const p = eventSchema.parse(input)
  const supabase = await createClient()
  const { data, error } = await supabase.from('evenements').insert({ ...p, statut: 'demande' }).select('id').single()
  if (error || !data) throw new Error(error?.message ?? 'Erreur')
  revalidatePath('/admin/reservations')
  return { id: data.id as string }
}

const updateEventSchema = eventSchema.extend({ id: z.string().uuid() })

export async function updateEvenement(input: unknown) {
  await requireWritable('/admin/reservations')
  const p = updateEventSchema.parse(input)
  const { id, ...rest } = p
  const supabase = await createClient()
  const { error } = await supabase.from('evenements').update(rest).eq('id', id)
  if (error) throw new Error(error.message)
  revalidatePath('/admin/reservations')
  return { ok: true as const }
}

export async function changerStatutEvenement(id: string, statut: 'demande' | 'confirmee' | 'realise' | 'annulee') {
  if (!id) throw new Error('id manquant')
  await requireWritable('/admin/reservations')
  const supabase = await createClient()
  const { error } = await supabase.from('evenements').update({ statut }).eq('id', id)
  if (error) throw new Error(error.message)
  revalidatePath('/admin/reservations')
  return { ok: true as const }
}

export async function supprimerEvenement(id: string) {
  if (!id) throw new Error('id manquant')
  await requireWritable('/admin/reservations')
  const supabase = await createClient()
  const { error } = await supabase.from('evenements').delete().eq('id', id)
  if (error) throw new Error(error.message)
  revalidatePath('/admin/reservations')
  return { ok: true as const }
}
