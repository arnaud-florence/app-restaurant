'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'

// ─── Messages ──────────────────────────────────────────────────────

const envoyerMessageSchema = z.object({
  canal:         z.enum(['cuisine','bar','salle','admin','tous']),
  expediteur_id: z.string().uuid().nullable(),
  contenu:       z.string().trim().min(1).max(2000),
})

export async function envoyerMessage(input: unknown): Promise<{ id: string }> {
  const p = envoyerMessageSchema.parse(input)
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('messages')
    .insert({ canal: p.canal, expediteur_id: p.expediteur_id, contenu: p.contenu })
    .select('id')
    .single()
  if (error || !data) throw new Error(error?.message ?? 'Erreur envoi')
  revalidatePath('/equipes')
  return { id: data.id as string }
}

const marquerLusSchema = z.object({
  message_ids: z.array(z.string().uuid()).min(1),
  employe_id:  z.string().uuid(),
})

export async function marquerMessagesLus(input: unknown) {
  const p = marquerLusSchema.parse(input)
  const supabase = await createClient()

  // Postgres array_append idempotent : on UPDATE seulement si l'employe
  // n'est pas déjà dans lu_par. On le fait en bulk via une fonction RPC
  // serait plus propre, mais ici on boucle (volume très faible).
  for (const id of p.message_ids) {
    const { data: m } = await supabase
      .from('messages')
      .select('lu_par')
      .eq('id', id)
      .single()
    const cur = (m?.lu_par as string[] | undefined) ?? []
    if (cur.includes(p.employe_id)) continue
    await supabase
      .from('messages')
      .update({ lu_par: [...cur, p.employe_id] })
      .eq('id', id)
  }
  revalidatePath('/equipes')
  return { ok: true as const }
}

// ─── Réactions emoji (chat façon Messenger) ─────────────────────────
const reagirSchema = z.object({
  message_id: z.string().uuid(),
  employe_id: z.string().uuid(),
  emoji:      z.string().trim().min(1).max(8),
})

export async function reagirMessage(input: unknown) {
  const p = reagirSchema.parse(input)
  const supabase = await createClient()
  const { data: m } = await supabase
    .from('messages')
    .select('reactions')
    .eq('id', p.message_id)
    .single()
  const cur = (m?.reactions as Record<string, string> | undefined) ?? {}
  const next = { ...cur }
  // Re-tap du même emoji → on retire ; sinon on (re)met (1 réaction / personne).
  if (next[p.employe_id] === p.emoji) delete next[p.employe_id]
  else next[p.employe_id] = p.emoji
  await supabase.from('messages').update({ reactions: next }).eq('id', p.message_id)
  revalidatePath('/equipes')
  return { ok: true as const }
}

// ─── Affichage infos ───────────────────────────────────────────────

const creerInfoSchema = z.object({
  titre:         z.string().trim().min(1).max(200),
  contenu:       z.string().trim().min(1).max(5000),
  priorite:      z.enum(['info','warn','urgent']).default('info'),
  valable_du:    z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  valable_jusqu: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
  ordre:         z.number().int().default(0),
  cree_par:      z.string().uuid().nullable(),
})

export async function creerInfoAffichage(input: unknown): Promise<{ id: string }> {
  const p = creerInfoSchema.parse(input)
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('affichage_infos')
    .insert({
      titre: p.titre, contenu: p.contenu, priorite: p.priorite,
      valable_du: p.valable_du, valable_jusqu: p.valable_jusqu,
      ordre: p.ordre, cree_par: p.cree_par,
    })
    .select('id').single()
  if (error || !data) throw new Error(error?.message ?? 'Erreur création')
  revalidatePath('/equipes')
  return { id: data.id as string }
}

export async function supprimerInfo(id: string) {
  if (!id) throw new Error('id manquant')
  const supabase = await createClient()
  const { error } = await supabase.from('affichage_infos').delete().eq('id', id)
  if (error) throw new Error(error.message)
  revalidatePath('/equipes')
  return { ok: true as const }
}

// ─── Comptes-rendus ────────────────────────────────────────────────

const creerCRSchema = z.object({
  titre:         z.string().trim().min(1).max(200),
  date_reunion:  z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  contenu:       z.string().trim().min(1).max(20000),
  participants:  z.array(z.string().uuid()).default([]),
  redacteur_id:  z.string().uuid().nullable(),
})

export async function creerCompteRendu(input: unknown): Promise<{ id: string }> {
  const p = creerCRSchema.parse(input)
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('comptes_rendus')
    .insert({
      titre: p.titre, date_reunion: p.date_reunion, contenu: p.contenu,
      participants: p.participants, redacteur_id: p.redacteur_id,
    })
    .select('id').single()
  if (error || !data) throw new Error(error?.message ?? 'Erreur création')
  revalidatePath('/equipes')
  return { id: data.id as string }
}

export async function supprimerCompteRendu(id: string) {
  if (!id) throw new Error('id manquant')
  const supabase = await createClient()
  const { error } = await supabase.from('comptes_rendus').delete().eq('id', id)
  if (error) throw new Error(error.message)
  revalidatePath('/equipes')
  return { ok: true as const }
}

// ─── Matériel ──────────────────────────────────────────────────────

const creerMaterielSchema = z.object({
  nom:           z.string().trim().min(1).max(200),
  type:          z.enum(['uniforme','ustensile','cle','badge','equipement','autre']),
  numero_serie:  z.string().max(100).nullable(),
  etat:          z.enum(['neuf','bon','use','abime','perdu']).default('bon'),
  notes:         z.string().max(1000).nullable(),
})

export async function creerMateriel(input: unknown): Promise<{ id: string }> {
  const p = creerMaterielSchema.parse(input)
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('materiels')
    .insert({ nom: p.nom, type: p.type, numero_serie: p.numero_serie, etat: p.etat, notes: p.notes })
    .select('id').single()
  if (error || !data) throw new Error(error?.message ?? 'Erreur création')
  revalidatePath('/equipes')
  return { id: data.id as string }
}

const attribuerSchema = z.object({
  materiel_id:      z.string().uuid(),
  employe_id:       z.string().uuid(),
  date_attribution: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
})

export async function attribuerMateriel(input: unknown) {
  const p = attribuerSchema.parse(input)
  const supabase = await createClient()
  const { error } = await supabase
    .from('materiels')
    .update({ attribue_a: p.employe_id, date_attribution: p.date_attribution })
    .eq('id', p.materiel_id)
  if (error) throw new Error(error.message)
  revalidatePath('/equipes')
  return { ok: true as const }
}

export async function restituerMateriel(materiel_id: string) {
  if (!materiel_id) throw new Error('materiel_id manquant')
  const supabase = await createClient()
  const { error } = await supabase
    .from('materiels')
    .update({ attribue_a: null, date_attribution: null })
    .eq('id', materiel_id)
  if (error) throw new Error(error.message)
  revalidatePath('/equipes')
  return { ok: true as const }
}

const majEtatSchema = z.object({
  materiel_id: z.string().uuid(),
  etat:        z.enum(['neuf','bon','use','abime','perdu']),
})

export async function changerEtatMateriel(input: unknown) {
  const p = majEtatSchema.parse(input)
  const supabase = await createClient()
  const { error } = await supabase
    .from('materiels')
    .update({ etat: p.etat })
    .eq('id', p.materiel_id)
  if (error) throw new Error(error.message)
  revalidatePath('/equipes')
  return { ok: true as const }
}
