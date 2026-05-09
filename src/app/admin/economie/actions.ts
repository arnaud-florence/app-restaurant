'use server'

// Server actions pour /admin/economie : config SMIC/% + point mort mensuel.
// Manager only.

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { requireManager } from '@/lib/auth'

// ─── Config économique ─────────────────────────────────────────
const configSchema = z.object({
  smic_horaire_brut:           z.number().min(0).max(100),
  pct_redistribution_surplus:  z.number().min(0).max(100),
  notes: z.string().optional().nullable(),
})

export async function majConfigEconomique(input: unknown) {
  await requireManager()
  const p = configSchema.parse(input)
  const supabase = await createClient()

  // Singleton : update la 1ʳᵉ ligne (créée par migration). Sinon insert.
  const { data: existing } = await supabase.from('config_economique').select('id').limit(1).maybeSingle()
  if (existing) {
    const { error } = await supabase.from('config_economique')
      .update({ ...p, updated_at: new Date().toISOString() })
      .eq('id', existing.id)
    if (error) throw new Error(error.message)
  } else {
    const { error } = await supabase.from('config_economique').insert(p)
    if (error) throw new Error(error.message)
  }
  revalidatePath('/admin/economie')
  revalidatePath('/admin/pilotage')
  revalidatePath('/mon-espace')
  return { ok: true as const }
}

// ─── Point mort ────────────────────────────────────────────────
const pointMortSchema = z.object({
  mois:                       z.string().regex(/^\d{4}-\d{2}-\d{2}$/),    // 1er du mois
  charges_fixes_eur:          z.number().min(0),
  taux_charges_variables_pct: z.number().min(0).max(100),
  notes: z.string().optional().nullable(),
})

export async function upsertPointMort(input: unknown) {
  await requireManager()
  const p = pointMortSchema.parse(input)
  const supabase = await createClient()

  const { error } = await supabase.from('point_mort_mensuel').upsert({
    mois:                        p.mois,
    charges_fixes_eur:           p.charges_fixes_eur,
    taux_charges_variables_pct:  p.taux_charges_variables_pct,
    notes:                       p.notes ?? null,
    updated_at:                  new Date().toISOString(),
  }, { onConflict: 'mois' })
  if (error) throw new Error(error.message)
  revalidatePath('/admin/economie')
  revalidatePath('/admin/pilotage')
  revalidatePath('/mon-espace')
  return { ok: true as const }
}

export async function supprimerPointMort(input: { id: string }) {
  await requireManager()
  const supabase = await createClient()
  const { error } = await supabase.from('point_mort_mensuel').delete().eq('id', input.id)
  if (error) throw new Error(error.message)
  revalidatePath('/admin/economie')
  return { ok: true as const }
}

// ─── Charges fixes récurrentes ─────────────────────────────────
const chargeSchema = z.object({
  id:                  z.string().uuid().optional().nullable(),
  categorie:           z.enum([
    'loyer','salaires','charges_sociales','energie','eau','internet','telephone',
    'assurance','comptable','abonnement_software','maintenance','marketing','leasing','banque','autre',
  ]),
  libelle:             z.string().min(1).max(200),
  montant_mensuel_eur: z.number().min(0),
  fournisseur:         z.string().max(200).optional().nullable(),
  notes:               z.string().max(500).optional().nullable(),
  actif:               z.boolean(),
})

export async function upsertCharge(input: unknown) {
  await requireManager()
  const p = chargeSchema.parse(input)
  const supabase = await createClient()
  const { id, ...data } = p
  const payload = {
    categorie:           data.categorie,
    libelle:             data.libelle,
    montant_mensuel_eur: data.montant_mensuel_eur,
    fournisseur:         data.fournisseur ?? null,
    notes:               data.notes ?? null,
    actif:               data.actif,
    updated_at:          new Date().toISOString(),
  }
  if (id) {
    const { error } = await supabase.from('charges_fixes_recurrentes').update(payload).eq('id', id)
    if (error) throw new Error(error.message)
  } else {
    const { error } = await supabase.from('charges_fixes_recurrentes').insert(payload)
    if (error) throw new Error(error.message)
  }
  revalidatePath('/admin/economie')
  return { ok: true as const }
}

export async function supprimerCharge(input: { id: string }) {
  await requireManager()
  const supabase = await createClient()
  const { error } = await supabase.from('charges_fixes_recurrentes').delete().eq('id', input.id)
  if (error) throw new Error(error.message)
  revalidatePath('/admin/economie')
  return { ok: true as const }
}

export async function toggleActifCharge(input: { id: string; actif: boolean }) {
  await requireManager()
  const supabase = await createClient()
  const { error } = await supabase.from('charges_fixes_recurrentes')
    .update({ actif: input.actif, updated_at: new Date().toISOString() })
    .eq('id', input.id)
  if (error) throw new Error(error.message)
  revalidatePath('/admin/economie')
  return { ok: true as const }
}

// ─── Charges variables ─────────────────────────────────────────
const chargeVarSchema = z.object({
  id:                  z.string().uuid().optional().nullable(),
  type:                z.enum(['food_cost','commissions_cb','jetable_emballage','taxes_locales','mensualisations_taxes','transport','autre']),
  libelle:             z.string().min(1).max(200),
  mode:                z.enum(['auto','manuel_pct','manuel_fixe']),
  valeur_pct:          z.number().min(0).max(100).nullable().optional(),
  valeur_fixe_eur:     z.number().min(0).nullable().optional(),
  notes:               z.string().max(500).optional().nullable(),
  actif:               z.boolean(),
})

export async function upsertChargeVar(input: unknown) {
  await requireManager()
  const p = chargeVarSchema.parse(input)
  const supabase = await createClient()
  const { id, ...data } = p
  const payload = {
    type:            data.type,
    libelle:         data.libelle,
    mode:            data.mode,
    valeur_pct:      data.mode === 'manuel_pct'  ? (data.valeur_pct ?? null) : null,
    valeur_fixe_eur: data.mode === 'manuel_fixe' ? (data.valeur_fixe_eur ?? null) : null,
    notes:           data.notes ?? null,
    actif:           data.actif,
    updated_at:      new Date().toISOString(),
  }
  if (id) {
    const { error } = await supabase.from('charges_variables').update(payload).eq('id', id)
    if (error) throw new Error(error.message)
  } else {
    const { error } = await supabase.from('charges_variables').insert(payload)
    if (error) throw new Error(error.message)
  }
  revalidatePath('/admin/economie')
  return { ok: true as const }
}

export async function supprimerChargeVar(input: { id: string }) {
  await requireManager()
  const supabase = await createClient()
  const { error } = await supabase.from('charges_variables').delete().eq('id', input.id)
  if (error) throw new Error(error.message)
  revalidatePath('/admin/economie')
  return { ok: true as const }
}

export async function toggleActifChargeVar(input: { id: string; actif: boolean }) {
  await requireManager()
  const supabase = await createClient()
  const { error } = await supabase.from('charges_variables')
    .update({ actif: input.actif, updated_at: new Date().toISOString() })
    .eq('id', input.id)
  if (error) throw new Error(error.message)
  revalidatePath('/admin/economie')
  return { ok: true as const }
}

// ─── Contrats employés (mise à jour des champs économiques) ────
const contratSchema = z.object({
  id:                          z.string().uuid(),
  salaire_horaire:             z.number().min(0).optional(),
  heures_contrat:              z.number().min(0).max(60).optional(),
  coef_charges_patronales:     z.number().min(1).max(2).optional(),
  avantages_mensuel_eur:       z.number().min(0).optional(),
  heures_supp_prevues_mois:    z.number().min(0).optional(),
  date_debut_contrat:          z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
  date_fin_contrat:            z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
})

export async function updateContratEmploye(input: unknown) {
  await requireManager()
  const p = contratSchema.parse(input)
  const { id, ...rest } = p
  const supabase = await createClient()
  const { error } = await supabase.from('employes').update(rest).eq('id', id)
  if (error) throw new Error(error.message)
  revalidatePath('/admin/economie')
  revalidatePath('/admin/rh')
  return { ok: true as const }
}
