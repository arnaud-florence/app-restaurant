'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { requireManager } from '@/lib/auth'

const carteSchema = z.object({
  code:                 z.string().trim().min(4, 'Code trop court').max(40)
                         .regex(/^[A-Z0-9_-]+$/, 'Lettres maj/chiffres/_/- uniquement')
                         .transform(s => s.toUpperCase()),
  montant_initial:      z.coerce.number().min(1, 'Min 1 €').max(100000),
  acheteur_nom:         z.string().max(160).nullable().optional(),
  acheteur_email:       z.string().max(160).nullable().optional(),
  beneficiaire_nom:     z.string().max(160).nullable().optional(),
  beneficiaire_email:   z.string().max(160).nullable().optional(),
  message_personnel:    z.string().max(1000).nullable().optional(),
  date_validite_fin:    z.string().nullable().optional(),
})

export async function creerCarteCadeau(input: unknown) {
  await requireManager()
  const p = carteSchema.parse(input)
  const sb = await createClient()

  const { data: carte, error } = await sb.from('cartes_cadeaux').insert({
    code: p.code,
    montant_initial: p.montant_initial,
    montant_restant: p.montant_initial,
    acheteur_nom: p.acheteur_nom || null,
    acheteur_email: p.acheteur_email || null,
    beneficiaire_nom: p.beneficiaire_nom || null,
    beneficiaire_email: p.beneficiaire_email || null,
    message_personnel: p.message_personnel || null,
    date_validite_fin: p.date_validite_fin || null,
    statut: 'active',
  }).select('id').single()

  if (error || !carte) {
    if (error?.message?.includes('duplicate') || error?.message?.includes('unique')) {
      throw new Error(`Le code « ${p.code} » existe déjà.`)
    }
    throw new Error(error?.message ?? 'Erreur')
  }

  // Trace l'achat (création) dans mouvements
  await sb.from('mouvements_cartes_cadeaux').insert({
    carte_cadeau_id: carte.id,
    type: 'achat',
    montant: p.montant_initial,
    motif: 'Création manuelle (admin)',
  })

  revalidatePath('/admin/cartes-cadeaux')
  return { id: carte.id as string }
}

export async function annulerCarteCadeau(id: string, motif: string) {
  await requireManager()
  if (!id) throw new Error('id manquant')
  const sb = await createClient()

  const { data: carte } = await sb.from('cartes_cadeaux').select('montant_restant').eq('id', id).maybeSingle()
  const restant = Number(carte?.montant_restant ?? 0)

  const { error } = await sb.from('cartes_cadeaux').update({
    statut: 'annulee',
    montant_restant: 0,
  }).eq('id', id)
  if (error) throw new Error(error.message)

  if (restant > 0) {
    await sb.from('mouvements_cartes_cadeaux').insert({
      carte_cadeau_id: id,
      type: 'remboursement',
      montant: -restant,
      motif: motif || 'Carte annulée',
    })
  }

  revalidatePath('/admin/cartes-cadeaux')
  return { ok: true as const }
}

export async function crediterCarteCadeau(id: string, montant: number, motif: string) {
  await requireManager()
  if (!id) throw new Error('id manquant')
  if (montant <= 0) throw new Error('Montant doit être > 0')
  const sb = await createClient()

  const { data: carte } = await sb.from('cartes_cadeaux')
    .select('montant_restant, statut')
    .eq('id', id).maybeSingle()
  if (!carte) throw new Error('Carte introuvable')
  if (carte.statut !== 'active') throw new Error('Carte non active')

  const nouveauRestant = Number(carte.montant_restant) + montant
  const { error } = await sb.from('cartes_cadeaux')
    .update({ montant_restant: nouveauRestant })
    .eq('id', id)
  if (error) throw new Error(error.message)

  await sb.from('mouvements_cartes_cadeaux').insert({
    carte_cadeau_id: id,
    type: 'achat',
    montant,
    motif: motif || 'Crédit manuel admin',
  })

  revalidatePath('/admin/cartes-cadeaux')
  return { ok: true as const }
}

export async function supprimerCarteCadeau(id: string) {
  await requireManager()
  if (!id) throw new Error('id manquant')
  const sb = await createClient()
  const { error } = await sb.from('cartes_cadeaux').delete().eq('id', id)
  if (error) throw new Error(error.message)
  revalidatePath('/admin/cartes-cadeaux')
  return { ok: true as const }
}
