'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { requireManager } from '@/lib/auth'

const schema = z.object({
  nom:            z.string().trim().min(1).max(100),
  numero:         z.string().trim().min(1).max(20),
  capacite:       z.coerce.number().int().min(1).max(20),
  prix_nuit_ht:   z.coerce.number().min(0).max(10000),
  description:    z.string().max(1000).nullable().optional(),
  equipements:    z.array(z.string()).default([]),
  photos:         z.array(z.string()).default([]),
  video_360_url:  z.string().max(500).nullable().optional(),
  actif:          z.boolean().default(true),
})

export async function creerChambre(input: unknown) {
  await requireManager()
  const p = schema.parse(input)
  const sb = await createClient()
  const { data, error } = await sb.from('chambres').insert({
    nom: p.nom, numero: p.numero, capacite: p.capacite,
    prix_nuit_ht: p.prix_nuit_ht, description: p.description || null,
    equipements: p.equipements, photos: p.photos.filter(p => p.trim()),
    video_360_url: p.video_360_url || null,
    actif: p.actif,
  }).select('id').single()
  if (error || !data) {
    if (error?.message?.includes('unique')) throw new Error(`Numéro ${p.numero} déjà utilisé`)
    throw new Error(error?.message ?? 'Erreur')
  }
  revalidatePath('/admin/chambres')
  return { id: data.id }
}

const updateSchema = schema.extend({ id: z.string().uuid() })

export async function modifierChambre(input: unknown) {
  await requireManager()
  const p = updateSchema.parse(input)
  const sb = await createClient()
  const { error } = await sb.from('chambres').update({
    nom: p.nom, numero: p.numero, capacite: p.capacite,
    prix_nuit_ht: p.prix_nuit_ht, description: p.description || null,
    equipements: p.equipements, photos: p.photos.filter(p => p.trim()),
    video_360_url: p.video_360_url || null,
    actif: p.actif,
  }).eq('id', p.id)
  if (error) throw new Error(error.message)
  revalidatePath('/admin/chambres')
  return { ok: true as const }
}

export async function supprimerChambre(id: string) {
  await requireManager()
  if (!id) throw new Error('id manquant')
  const sb = await createClient()
  const { error } = await sb.from('chambres').delete().eq('id', id)
  if (error) {
    if (error.message.includes('foreign key')) {
      throw new Error('Cette chambre a des réservations — désactive-la plutôt.')
    }
    throw new Error(error.message)
  }
  revalidatePath('/admin/chambres')
  return { ok: true as const }
}

// Seed : crée 3 chambres starter
export async function seedChambresStarter() {
  await requireManager()
  const sb = await createClient()
  const { count } = await sb.from('chambres').select('id', { count: 'exact', head: true })
  if ((count ?? 0) > 0) {
    throw new Error('Des chambres existent déjà. Supprime-les d\'abord pour appliquer le preset.')
  }
  const starter = [
    {
      nom: 'Chambre Provence', numero: '101', capacite: 2, prix_nuit_ht: 75,
      description: 'Lit double 160cm, vue jardin, salle de bain privative avec douche italienne.',
      equipements: ['wifi', 'tv', 'petit_dejeuner', 'salle_de_bain_privee'],
      photos: ['https://images.unsplash.com/photo-1631049307264-da0ec9d70304?w=1200&q=80'],
      actif: true,
    },
    {
      nom: 'Chambre Toscane', numero: '102', capacite: 3, prix_nuit_ht: 95,
      description: 'Lit double + 1 lit simple, balcon, idéale famille.',
      equipements: ['wifi', 'tv', 'petit_dejeuner', 'balcon'],
      photos: ['https://images.unsplash.com/photo-1566073771259-6a8506099945?w=1200&q=80'],
      actif: true,
    },
    {
      nom: 'Suite Romantique', numero: '201', capacite: 2, prix_nuit_ht: 130,
      description: 'Suite avec coin salon, baignoire, prestige et confort.',
      equipements: ['wifi', 'tv', 'petit_dejeuner', 'baignoire', 'climatisation'],
      photos: ['https://images.unsplash.com/photo-1582719478250-c89cae4dc85b?w=1200&q=80'],
      actif: true,
    },
  ]
  for (const c of starter) {
    await sb.from('chambres').insert(c)
  }
  revalidatePath('/admin/chambres')
  return { ok: true as const, nb: starter.length }
}
