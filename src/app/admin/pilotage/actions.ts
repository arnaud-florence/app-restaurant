'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'

const KPI_ENUM = z.enum([
  'ca','marge_brute','food_cost_pct','ratio_masse_sal',
  'ticket_moyen','taux_remplissage','nc_ouvertes',
  'energie_par_couvert','factures_a_payer','score_satisfaction',
])

// ─── Objectifs ─────────────────────────────────────────────────────
const objectifSchema = z.object({
  periode:      z.enum(['mensuel', 'annuel']),
  mois:         z.string().regex(/^\d{4}-\d{2}$/).nullable(),
  annee:        z.number().int().min(2000).max(2100),
  kpi:          KPI_ENUM,
  valeur_cible: z.number(),
  unite:        z.string().default('eur'),
  notes:        z.string().max(500).nullable(),
})

export async function upsertObjectif(input: unknown) {
  const p = objectifSchema.parse(input)
  const supabase = await createClient()
  // Le UNIQUE (periode, mois, annee, kpi) garantit qu'un seul objectif existe par combinaison
  const { data: existing } = await supabase.from('objectifs').select('id')
    .eq('periode', p.periode).eq('annee', p.annee).eq('kpi', p.kpi)
    .eq('mois', p.mois ?? '').maybeSingle()

  if (existing) {
    const { error } = await supabase.from('objectifs')
      .update({ valeur_cible: p.valeur_cible, unite: p.unite, notes: p.notes, updated_at: new Date().toISOString() })
      .eq('id', existing.id)
    if (error) throw new Error(error.message)
    revalidatePath('/admin/pilotage')
    return { id: existing.id as string, mode: 'update' as const }
  }
  const { data, error } = await supabase.from('objectifs').insert(p).select('id').single()
  if (error || !data) throw new Error(error?.message ?? 'Erreur')
  revalidatePath('/admin/pilotage')
  return { id: data.id as string, mode: 'create' as const }
}

export async function supprimerObjectif(id: string) {
  if (!id) throw new Error('id manquant')
  const supabase = await createClient()
  const { error } = await supabase.from('objectifs').delete().eq('id', id)
  if (error) throw new Error(error.message)
  revalidatePath('/admin/pilotage')
  return { ok: true as const }
}

// ─── Actions stratégiques ──────────────────────────────────────────
const actionSchema = z.object({
  titre:          z.string().trim().min(1).max(200),
  description:    z.string().max(2000).nullable(),
  kpi_lie:        KPI_ENUM.nullable(),
  statut:         z.enum(['a_faire', 'en_cours', 'fait', 'annule']).default('a_faire'),
  priorite:       z.enum(['haute', 'normale', 'basse']).default('normale'),
  echeance:       z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
  responsable_id: z.string().uuid().nullable(),
})

export async function creerAction(input: unknown): Promise<{ id: string }> {
  const p = actionSchema.parse(input)
  const supabase = await createClient()
  const { data, error } = await supabase.from('actions_strategiques').insert(p).select('id').single()
  if (error || !data) throw new Error(error?.message ?? 'Erreur')
  revalidatePath('/admin/pilotage')
  return { id: data.id as string }
}

const updateActionSchema = actionSchema.extend({ id: z.string().uuid() })

export async function updateAction(input: unknown) {
  const p = updateActionSchema.parse(input)
  const { id, ...rest } = p
  const supabase = await createClient()
  const fait_le = rest.statut === 'fait' ? new Date().toISOString() : null
  const { error } = await supabase.from('actions_strategiques')
    .update({ ...rest, fait_le, updated_at: new Date().toISOString() })
    .eq('id', id)
  if (error) throw new Error(error.message)
  revalidatePath('/admin/pilotage')
  return { ok: true as const }
}

export async function changerStatutAction(id: string, statut: 'a_faire' | 'en_cours' | 'fait' | 'annule') {
  if (!id) throw new Error('id manquant')
  const supabase = await createClient()
  const fait_le = statut === 'fait' ? new Date().toISOString() : null
  const { error } = await supabase.from('actions_strategiques')
    .update({ statut, fait_le, updated_at: new Date().toISOString() })
    .eq('id', id)
  if (error) throw new Error(error.message)
  revalidatePath('/admin/pilotage')
  return { ok: true as const }
}

export async function supprimerAction(id: string) {
  if (!id) throw new Error('id manquant')
  const supabase = await createClient()
  const { error } = await supabase.from('actions_strategiques').delete().eq('id', id)
  if (error) throw new Error(error.message)
  revalidatePath('/admin/pilotage')
  return { ok: true as const }
}
