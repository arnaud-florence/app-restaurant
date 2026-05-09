'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { requireManager } from '@/lib/auth'
import { calculerLignes, poolPourboiresMois, type Methode } from '@/lib/pourboires'
import { creerNotification } from '@/lib/notifications'

const upsertSchema = z.object({
  mois: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  methode: z.enum(['heures', 'parts_egales', 'manuel']),
  notes: z.string().max(500).optional().nullable(),
  manuelLignes: z.array(z.object({
    employe_id: z.string().uuid(),
    montant_eur: z.number().min(0),
  })).optional(),
})

/** Calcule + UPSERT la distribution + ses lignes. Idempotent. Reste en brouillon. */
export async function preparerDistribution(input: unknown) {
  await requireManager()
  const p = upsertSchema.parse(input)

  const pool = await poolPourboiresMois(p.mois.slice(0, 7))
  const lignes = await calculerLignes(p.mois.slice(0, 7), p.methode, pool, p.manuelLignes)

  const sb = await createClient()
  // Upsert distribution
  const { data: existing } = await sb.from('pourboires_distribution')
    .select('id, cloture_at')
    .eq('mois', p.mois).maybeSingle()

  if (existing?.cloture_at) {
    throw new Error('Distribution déjà clôturée. Impossible de re-calculer.')
  }

  let distId: string
  if (existing) {
    distId = existing.id
    await sb.from('pourboires_distribution')
      .update({ pool_total_eur: pool, methode: p.methode, notes: p.notes ?? null, updated_at: new Date().toISOString() })
      .eq('id', distId)
    // Reset les lignes
    await sb.from('pourboires_distribution_lignes').delete().eq('distribution_id', distId)
  } else {
    const { data, error } = await sb.from('pourboires_distribution').insert({
      mois: p.mois, pool_total_eur: pool, methode: p.methode, notes: p.notes ?? null,
    }).select('id').single()
    if (error || !data) throw new Error(error?.message ?? 'Erreur création distribution')
    distId = data.id as string
  }

  // Insert lignes
  const rows = lignes.map(l => ({
    distribution_id: distId,
    employe_id: l.employe_id,
    heures_mois: l.heures_mois,
    part_pct:    l.part_pct,
    montant_eur: l.montant_eur,
  }))
  if (rows.length > 0) {
    const { error: errL } = await sb.from('pourboires_distribution_lignes').insert(rows)
    if (errL) throw new Error(errL.message)
  }

  revalidatePath('/admin/finances/pourboires')
  revalidatePath('/mon-espace')
  return { ok: true as const, pool, nb_lignes: lignes.length }
}

export async function cloturerDistribution(input: { id: string }) {
  await requireManager()
  const sb = await createClient()
  const { data: dist } = await sb.from('pourboires_distribution')
    .select('id, mois')
    .eq('id', input.id).maybeSingle()
  const { error } = await sb.from('pourboires_distribution')
    .update({ cloture_at: new Date().toISOString() })
    .eq('id', input.id)
  if (error) throw new Error(error.message)

  // Notif à chaque employé concerné
  if (dist) {
    const { data: lignes } = await sb.from('pourboires_distribution_lignes')
      .select('employe_id, montant_eur')
      .eq('distribution_id', input.id)
    const moisLabel = new Date(String(dist.mois)).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })
    for (const l of (lignes ?? [])) {
      if (!l.employe_id) continue
      const m = Number(l.montant_eur ?? 0)
      if (m <= 0) continue
      await creerNotification({
        destinataire_employe_id: l.employe_id as string,
        type: 'pourboires_distribues',
        titre: `Pourboires de ${moisLabel} : +${m.toFixed(2)} €`,
        message: 'La distribution a été clôturée. Le versement sera effectué prochainement.',
        url_action: '/mon-espace',
      })
    }
  }

  revalidatePath('/admin/finances/pourboires')
  revalidatePath('/mon-espace')
  return { ok: true as const }
}

export async function reouvrirDistribution(input: { id: string }) {
  await requireManager()
  const sb = await createClient()
  const { error } = await sb.from('pourboires_distribution')
    .update({ cloture_at: null })
    .eq('id', input.id)
  if (error) throw new Error(error.message)
  revalidatePath('/admin/finances/pourboires')
  return { ok: true as const }
}

export async function marquerLigneVersee(input: { ligne_id: string; verse: boolean }) {
  await requireManager()
  const sb = await createClient()
  const { error } = await sb.from('pourboires_distribution_lignes')
    .update({ verse: input.verse })
    .eq('id', input.ligne_id)
  if (error) throw new Error(error.message)
  revalidatePath('/admin/finances/pourboires')
  return { ok: true as const }
}
