'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'

// ─── Menu du jour ──────────────────────────────────────────────────
const menuSchema = z.object({
  jour:        z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  section:     z.enum(['entree', 'plat', 'dessert', 'boisson', 'autre']),
  titre:       z.string().trim().min(1).max(200),
  description: z.string().max(500).nullable(),
  prix:        z.number().min(0).nullable(),
  ordre:       z.number().int().min(0).default(0),
  actif:       z.boolean().default(true),
})

export async function creerMenuItem(input: unknown): Promise<{ id: string }> {
  const p = menuSchema.parse(input)
  const supabase = await createClient()
  const { data, error } = await supabase.from('menu_du_jour').insert(p).select('id').single()
  if (error || !data) throw new Error(error?.message ?? 'Erreur')
  revalidatePath('/admin/affichage')
  revalidatePath('/affichage/tv')
  return { id: data.id as string }
}

const updateMenuSchema = menuSchema.extend({ id: z.string().uuid() })
export async function updateMenuItem(input: unknown) {
  const p = updateMenuSchema.parse(input)
  const { id, ...rest } = p
  const supabase = await createClient()
  const { error } = await supabase.from('menu_du_jour')
    .update({ ...rest, updated_at: new Date().toISOString() })
    .eq('id', id)
  if (error) throw new Error(error.message)
  revalidatePath('/admin/affichage')
  revalidatePath('/affichage/tv')
  return { ok: true as const }
}

export async function supprimerMenuItem(id: string) {
  if (!id) throw new Error('id manquant')
  const supabase = await createClient()
  const { error } = await supabase.from('menu_du_jour').delete().eq('id', id)
  if (error) throw new Error(error.message)
  revalidatePath('/admin/affichage')
  revalidatePath('/affichage/tv')
  return { ok: true as const }
}

/** Duplique le menu du jour sur une autre date. */
export async function dupliquerMenu(input: { jour_source: string; jour_cible: string }) {
  const supabase = await createClient()
  const { data: src } = await supabase.from('menu_du_jour').select('section, titre, description, prix, ordre, actif')
    .eq('jour', input.jour_source)
  if (!src || src.length === 0) throw new Error('Menu source vide')
  const rows = src.map(r => ({ ...r, jour: input.jour_cible }))
  const { error } = await supabase.from('menu_du_jour').insert(rows)
  if (error) throw new Error(error.message)
  revalidatePath('/admin/affichage')
  revalidatePath('/affichage/tv')
  return { ok: true as const, copies: rows.length }
}

// ─── Promos ────────────────────────────────────────────────────────
const promoSchema = z.object({
  titre:         z.string().trim().min(1).max(200),
  description:   z.string().max(2000).nullable(),
  image_url:     z.string().url().max(2000).nullable(),
  periode_debut: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
  periode_fin:   z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
  actif:         z.boolean().default(true),
  ordre:         z.number().int().min(0).default(0),
})

export async function creerPromo(input: unknown): Promise<{ id: string }> {
  const p = promoSchema.parse(input)
  const supabase = await createClient()
  const { data, error } = await supabase.from('affichage_promos').insert(p).select('id').single()
  if (error || !data) throw new Error(error?.message ?? 'Erreur')
  revalidatePath('/admin/affichage')
  revalidatePath('/affichage/tv')
  return { id: data.id as string }
}

const updatePromoSchema = promoSchema.extend({ id: z.string().uuid() })
export async function updatePromo(input: unknown) {
  const p = updatePromoSchema.parse(input)
  const { id, ...rest } = p
  const supabase = await createClient()
  const { error } = await supabase.from('affichage_promos')
    .update({ ...rest, updated_at: new Date().toISOString() })
    .eq('id', id)
  if (error) throw new Error(error.message)
  revalidatePath('/admin/affichage')
  revalidatePath('/affichage/tv')
  return { ok: true as const }
}

export async function supprimerPromo(id: string) {
  if (!id) throw new Error('id manquant')
  const supabase = await createClient()
  const { error } = await supabase.from('affichage_promos').delete().eq('id', id)
  if (error) throw new Error(error.message)
  revalidatePath('/admin/affichage')
  revalidatePath('/affichage/tv')
  return { ok: true as const }
}

// ─── Appels serveur (côté admin/serveur) ───────────────────────────
const appelSchema = z.object({
  table_id:     z.string().uuid().nullable(),
  table_numero: z.string().min(1).max(20).nullable(),
  motif:        z.enum(['eau', 'addition', 'aide', 'autre']),
  message:      z.string().max(500).nullable(),
})

export async function creerAppel(input: unknown): Promise<{ id: string }> {
  const p = appelSchema.parse(input)
  const supabase = await createClient()
  const { data, error } = await supabase.from('appels_serveur').insert(p).select('id').single()
  if (error || !data) throw new Error(error?.message ?? 'Erreur')
  revalidatePath('/admin/affichage')
  revalidatePath('/serveur')
  return { id: data.id as string }
}

export async function prendreEnChargeAppel(id: string, employe_id: string | null) {
  if (!id) throw new Error('id manquant')
  const supabase = await createClient()
  const { error } = await supabase.from('appels_serveur')
    .update({ statut: 'pris_en_charge', pris_par_id: employe_id, pris_le: new Date().toISOString() })
    .eq('id', id)
  if (error) throw new Error(error.message)
  revalidatePath('/admin/affichage')
  revalidatePath('/serveur')
  return { ok: true as const }
}

export async function annulerAppel(id: string) {
  if (!id) throw new Error('id manquant')
  const supabase = await createClient()
  const { error } = await supabase.from('appels_serveur').update({ statut: 'annule' }).eq('id', id)
  if (error) throw new Error(error.message)
  revalidatePath('/admin/affichage')
  revalidatePath('/serveur')
  return { ok: true as const }
}
