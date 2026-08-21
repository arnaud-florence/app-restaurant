'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { creerNotification } from '@/lib/notifications'
import { logActivite } from '@/lib/operateur'
import { TYPE_EQUIPEMENT_LABEL, type TypeEquipement } from './types'

// ─── Relevés température ───────────────────────────────────────────

const releveSchema = z.object({
  equipement:      z.string().trim().min(1).max(100),
  type_equipement: z.enum(['frigo','congelateur','chambre_froide','bain_marie']).nullable(),
  temperature:     z.number(),
  moment:          z.enum(['matin','midi','soir','autre']).nullable(),
  employe_id:      z.string().uuid().nullable(),
  notes:           z.string().max(500).nullable(),
})

export async function creerReleveTemperature(input: unknown): Promise<{ id: string; conforme: boolean | null; nc_id?: string }> {
  const p = releveSchema.parse(input)
  const supabase = await createClient()

  // Calcul conforme automatique selon type_equipement
  let temperature_min_ok: number | null = null
  let temperature_max_ok: number | null = null
  let conforme: boolean | null = null
  if (p.type_equipement) {
    const seuils = TYPE_EQUIPEMENT_LABEL[p.type_equipement as TypeEquipement]
    temperature_min_ok = seuils.tempMin
    temperature_max_ok = seuils.tempMax
    conforme = p.temperature >= seuils.tempMin && p.temperature <= seuils.tempMax
  }

  const { data, error } = await supabase
    .from('releves_temperatures')
    .insert({
      equipement: p.equipement,
      type_equipement: p.type_equipement,
      temperature: p.temperature,
      temperature_min_ok, temperature_max_ok, conforme,
      moment: p.moment,
      employe_id: p.employe_id,
      notes: p.notes,
    })
    .select('id, conforme')
    .single()
  if (error || !data) throw new Error(error?.message ?? 'Erreur création relevé')

  // Auto-création d'une non-conformité critique si NOK
  let nc_id: string | undefined
  if (conforme === false) {
    const { data: nc } = await supabase
      .from('non_conformites')
      .insert({
        date_constat: new Date().toISOString().slice(0, 10),
        type: 'temperature',
        gravite: 'majeure',
        description: `Relevé hors plage sur "${p.equipement}" : ${p.temperature}°C (attendu ${temperature_min_ok}–${temperature_max_ok}°C)`,
        responsable_id: p.employe_id,
        statut: 'ouverte',
        releve_temperature_id: data.id as string,
      })
      .select('id')
      .single()
    if (nc) nc_id = nc.id as string
  }

  await logActivite({ action: 'hygiene', zone: 'Hygiène', cible: 'Relevé température', details: { conforme: data.conforme } })
  revalidatePath('/admin/hygiene')
  return { id: data.id as string, conforme: data.conforme as boolean | null, nc_id }
}

// ─── Checklists hygiène ────────────────────────────────────────────

const checkSchema = z.object({
  procedure_id:    z.string().uuid(),
  employe_id:      z.string().uuid().nullable(),
  signature_text:  z.string().trim().min(1).max(200),
  commentaire:     z.string().max(500).nullable(),
  valide:          z.boolean().default(true),
})

export async function validerCheckHygiene(input: unknown) {
  const p = checkSchema.parse(input)
  const supabase = await createClient()
  const now = new Date()
  const { error } = await supabase.from('checklists_hygiene').insert({
    procedure_id: p.procedure_id,
    employe_id: p.employe_id,
    date_realisation: now.toISOString().slice(0, 10),
    heure_realisation: now.toTimeString().slice(0, 8),
    valide: p.valide,
    commentaire: p.commentaire,
    signature_text: p.signature_text,
  })
  if (error) throw new Error(error.message)
  revalidatePath('/admin/hygiene')
  return { ok: true as const }
}

const procedureSchema = z.object({
  titre:          z.string().trim().min(1).max(200),
  moment:         z.enum(['ouverture','service','fermeture','hebdomadaire','mensuel']),
  poste_concerne: z.string().max(100).nullable(),
  description:    z.string().max(2000).nullable(),
  ordre:          z.number().int().default(0),
})

export async function creerProcedure(input: unknown): Promise<{ id: string }> {
  const p = procedureSchema.parse(input)
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('procedures_hygiene')
    .insert({ ...p, actif: true })
    .select('id').single()
  if (error || !data) throw new Error(error?.message ?? 'Erreur')
  revalidatePath('/admin/hygiene')
  return { id: data.id as string }
}

export async function supprimerProcedure(id: string) {
  if (!id) throw new Error('id manquant')
  const supabase = await createClient()
  const { error } = await supabase.from('procedures_hygiene').update({ actif: false }).eq('id', id)
  if (error) throw new Error(error.message)
  revalidatePath('/admin/hygiene')
  return { ok: true as const }
}

// ─── Plans HACCP ───────────────────────────────────────────────────

const haccpSchema = z.object({
  titre:                  z.string().trim().min(1).max(200),
  type_danger:            z.enum(['biologique','chimique','physique','allergene']),
  description_danger:     z.string().trim().min(1).max(1000),
  ccp_numero:             z.number().int().nullable(),
  mesure_preventive:      z.string().trim().min(1).max(1000),
  surveillance_methode:   z.string().max(500).nullable(),
  surveillance_frequence: z.string().max(200).nullable(),
  limite_critique:        z.string().max(500).nullable(),
  action_corrective:      z.string().trim().min(1).max(1000),
  responsable_poste:      z.string().max(100).nullable(),
})

export async function creerPlanHaccp(input: unknown): Promise<{ id: string }> {
  const p = haccpSchema.parse(input)
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('plans_haccp')
    .insert({ ...p, actif: true })
    .select('id').single()
  if (error || !data) throw new Error(error?.message ?? 'Erreur')
  revalidatePath('/admin/hygiene')
  return { id: data.id as string }
}

export async function supprimerPlanHaccp(id: string) {
  if (!id) throw new Error('id manquant')
  const supabase = await createClient()
  const { error } = await supabase.from('plans_haccp').update({ actif: false }).eq('id', id)
  if (error) throw new Error(error.message)
  revalidatePath('/admin/hygiene')
  return { ok: true as const }
}

// ─── Lots produits ─────────────────────────────────────────────────

const lotSchema = z.object({
  ingredient_id:  z.string().uuid().nullable(),
  // Saisie LIBRE du produit tracé : on doit pouvoir tracer n'importe quelle
  // réception (carton de surgelés, article ponctuel) sans devoir d'abord la
  // créer comme ingrédient. Le lien ingrédient est un plus, pas un préalable.
  produit_nom:    z.string().trim().max(200).nullable(),
  lot_numero:     z.string().trim().min(1).max(100),
  dlc:            z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
  fournisseur_id: z.string().uuid().nullable(),
  fournisseur_nom: z.string().max(200).nullable(),
  quantite:       z.number().min(0).default(0),
  unite:          z.string().max(20).nullable(),
  bon_commande_id: z.string().uuid().nullable(),
  date_reception: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).default(new Date().toISOString().slice(0, 10)),
  notes:          z.string().max(500).nullable(),
})

export async function creerLot(input: unknown): Promise<{ id: string }> {
  const p = lotSchema.parse(input)
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('lots_produits')
    .insert({ ...p, statut: 'en_stock' })
    .select('id').single()
  if (error || !data) throw new Error(error?.message ?? 'Erreur')
  revalidatePath('/admin/hygiene')
  return { id: data.id as string }
}

const majStatutLotSchema = z.object({
  lot_id: z.string().uuid(),
  statut: z.enum(['en_stock','consomme','jete','expire','rappele']),
  notes:  z.string().max(500).nullable(),
})

export async function changerStatutLot(input: unknown) {
  const p = majStatutLotSchema.parse(input)
  const supabase = await createClient()
  const { error } = await supabase
    .from('lots_produits')
    .update({ statut: p.statut, notes: p.notes })
    .eq('id', p.lot_id)
  if (error) throw new Error(error.message)
  revalidatePath('/admin/hygiene')
  return { ok: true as const }
}

// ─── Non-conformités ───────────────────────────────────────────────

const ncSchema = z.object({
  date_constat:      z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  type:              z.enum(['temperature','hygiene','produit','equipement','procedure','autre']),
  gravite:           z.enum(['mineure','majeure','critique']).default('mineure'),
  description:       z.string().trim().min(1).max(2000),
  action_corrective: z.string().max(2000).nullable(),
  responsable_id:    z.string().uuid().nullable(),
})

export async function creerNonConformite(input: unknown): Promise<{ id: string }> {
  const p = ncSchema.parse(input)
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('non_conformites')
    .insert({ ...p, statut: 'ouverte' })
    .select('id').single()
  if (error || !data) throw new Error(error?.message ?? 'Erreur')

  // Notif manager si NC critique
  if (p.gravite === 'critique') {
    const typesLabels: Record<string, string> = {
      temperature: 'Température', hygiene: 'Hygiène', produit: 'Produit',
      equipement: 'Équipement', procedure: 'Procédure', autre: 'Autre',
    }
    await creerNotification({
      destinataire_employe_id: null,    // managers
      type: 'nc_critique',
      titre: `🚨 NC critique : ${typesLabels[p.type] ?? p.type}`,
      message: p.description.slice(0, 200) + (p.description.length > 200 ? '…' : ''),
      url_action: '/admin/hygiene',
    })
    // Si responsable assigné : notif lui aussi
    if (p.responsable_id) {
      await creerNotification({
        destinataire_employe_id: p.responsable_id,
        type: 'nc_critique',
        titre: 'NC critique à traiter',
        message: `Une non-conformité critique te concerne : ${p.description.slice(0, 150)}`,
        url_action: '/admin/hygiene',
      })
    }
  }

  revalidatePath('/admin/hygiene')
  return { id: data.id as string }
}

const resoudreSchema = z.object({
  nc_id:             z.string().uuid(),
  action_corrective: z.string().trim().min(1).max(2000),
  resolved_by:       z.string().uuid().nullable(),
})

export async function resoudreNonConformite(input: unknown) {
  const p = resoudreSchema.parse(input)
  const supabase = await createClient()
  const { error } = await supabase
    .from('non_conformites')
    .update({
      statut: 'resolue',
      action_corrective: p.action_corrective,
      resolved_at: new Date().toISOString(),
      resolved_by: p.resolved_by,
    })
    .eq('id', p.nc_id)
  if (error) throw new Error(error.message)
  revalidatePath('/admin/hygiene')
  return { ok: true as const }
}

// ─── Antiparasitaire ───────────────────────────────────────────────

const interventionSchema = z.object({
  date_intervention:      z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  prestataire:            z.string().trim().min(1).max(200),
  type_traitement:        z.enum(['preventif','curatif','controle','urgence']),
  zones:                  z.array(z.string()).default([]),
  produits_utilises:      z.string().max(500).nullable(),
  observations:           z.string().max(2000).nullable(),
  prochaine_intervention: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
  document_url:           z.string().max(500).nullable(),
  cout:                   z.number().min(0).nullable(),
})

export async function creerIntervention3D(input: unknown): Promise<{ id: string }> {
  const p = interventionSchema.parse(input)
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('interventions_antiparasitaire')
    .insert({ ...p })
    .select('id').single()
  if (error || !data) throw new Error(error?.message ?? 'Erreur')
  revalidatePath('/admin/hygiene')
  return { id: data.id as string }
}

// ─── Plan nettoyage ────────────────────────────────────────────────

const nettoyageSchema = z.object({
  zone:              z.string().trim().min(1).max(100),
  equipement:        z.string().max(100).nullable(),
  frequence:         z.enum(['apres_service','quotidien','hebdo','mensuel','trimestriel','annuel']),
  produit_utilise:   z.string().max(200).nullable(),
  methode:           z.string().max(500).nullable(),
  responsable_poste: z.string().max(100).nullable(),
  ordre:             z.number().int().default(0),
})

export async function creerPlanNettoyage(input: unknown): Promise<{ id: string }> {
  const p = nettoyageSchema.parse(input)
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('plan_nettoyage')
    .insert({ ...p, actif: true })
    .select('id').single()
  if (error || !data) throw new Error(error?.message ?? 'Erreur')
  revalidatePath('/admin/hygiene')
  return { id: data.id as string }
}

export async function marquerExecuteNettoyage(plan_id: string) {
  if (!plan_id) throw new Error('plan_id manquant')
  const supabase = await createClient()
  const today = new Date().toISOString().slice(0, 10)
  const { error } = await supabase
    .from('plan_nettoyage')
    .update({ derniere_execution: today })
    .eq('id', plan_id)
  if (error) throw new Error(error.message)
  revalidatePath('/admin/hygiene')
  return { ok: true as const, date: today }
}

export async function supprimerPlanNettoyage(id: string) {
  if (!id) throw new Error('id manquant')
  const supabase = await createClient()
  const { error } = await supabase.from('plan_nettoyage').update({ actif: false }).eq('id', id)
  if (error) throw new Error(error.message)
  revalidatePath('/admin/hygiene')
  return { ok: true as const }
}
