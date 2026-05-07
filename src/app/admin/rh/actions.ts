'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { joursConge } from '@/lib/rh'

// ─── Employés ──────────────────────────────────────────────────────

const employeSchema = z.object({
  prenom:             z.string().trim().min(1).max(50),
  nom:                z.string().trim().min(1).max(50),
  poste:              z.string().trim().min(1).max(50),
  type_contrat:       z.string().trim().min(1).max(20),
  email:              z.string().email().nullable().or(z.literal('').transform(() => null)),
  telephone:          z.string().max(30).nullable(),
  salaire_horaire:    z.number().min(0),
  heures_contrat:     z.number().int().min(0),
  date_embauche:      z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
  date_sortie:        z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
  solde_conges_jours: z.number().min(0).default(25),
  notes_internes:     z.string().max(1000).nullable(),
})

export async function creerEmploye(input: unknown): Promise<{ id: string }> {
  const p = employeSchema.parse(input)
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('employes')
    .insert({ ...p, actif: true })
    .select('id').single()
  if (error || !data) throw new Error(error?.message ?? 'Erreur')
  // Auto-link : si un profil existe déjà avec cet email, on le rattache à l'employé.
  if (p.email) {
    await supabase.from('profils')
      .update({ employe_id: data.id, poste: p.poste, updated_at: new Date().toISOString() })
      .eq('email', p.email)
      .is('employe_id', null)
  }
  revalidatePath('/admin/rh')
  revalidatePath('/admin/securite')
  return { id: data.id as string }
}

const updateEmployeSchema = employeSchema.extend({ id: z.string().uuid() })

export async function updateEmploye(input: unknown) {
  const p = updateEmployeSchema.parse(input)
  const { id, ...rest } = p
  const supabase = await createClient()
  const { error } = await supabase.from('employes').update(rest).eq('id', id)
  if (error) throw new Error(error.message)
  // Synchronise le poste sur le profil lié si l'email match.
  await supabase.from('profils')
    .update({ poste: rest.poste, updated_at: new Date().toISOString() })
    .eq('employe_id', id)
  revalidatePath('/admin/rh')
  revalidatePath('/admin/securite')
  return { ok: true as const }
}

// ─── Permissions personnalisées par employé ───────────────────────
const customPermissionsSchema = z.object({
  employe_id: z.string().uuid(),
  allowed:    z.array(z.string().min(1)).max(50).default([]),
  denied:     z.array(z.string().min(1)).max(50).default([]),
})

/** Met à jour les overrides de permissions du profil lié à cet employé.
 *  Si aucun profil n'est encore lié, on stocke quand même : à la 1ère
 *  connexion, getProfile() liera l'employé via email match et le profil
 *  héritera des bons droits.
 */
export async function setEmployePermissions(input: unknown) {
  const p = customPermissionsSchema.parse(input)
  const supabase = await createClient()
  const overrides = (p.allowed.length === 0 && p.denied.length === 0)
    ? null
    : { allowed: p.allowed, denied: p.denied }
  const { error } = await supabase.from('profils')
    .update({ custom_permissions: overrides, updated_at: new Date().toISOString() })
    .eq('employe_id', p.employe_id)
  if (error) throw new Error(error.message)
  revalidatePath('/admin/rh')
  revalidatePath('/admin/securite')
  return { ok: true as const }
}

export async function archiverEmploye(id: string, date_sortie: string) {
  if (!id) throw new Error('id manquant')
  const supabase = await createClient()
  const { error } = await supabase.from('employes').update({ actif: false, date_sortie }).eq('id', id)
  if (error) throw new Error(error.message)
  revalidatePath('/admin/rh')
  return { ok: true as const }
}

// ─── Documents ──────────────────────────────────────────────────────

const documentSchema = z.object({
  employe_id:      z.string().uuid(),
  type:            z.enum(['contrat','cni','passeport','permis_travail','casier','visite_medicale','rib','attestation','autre']),
  nom:             z.string().trim().min(1).max(200),
  url:             z.string().trim().min(1).max(500),
  date_emission:   z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
  date_expiration: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
  notes:           z.string().max(500).nullable(),
})

export async function creerDocument(input: unknown): Promise<{ id: string }> {
  const p = documentSchema.parse(input)
  const supabase = await createClient()
  const { data, error } = await supabase.from('documents_employes').insert(p).select('id').single()
  if (error || !data) throw new Error(error?.message ?? 'Erreur')
  revalidatePath('/admin/rh')
  return { id: data.id as string }
}

export async function supprimerDocument(id: string) {
  if (!id) throw new Error('id manquant')
  const supabase = await createClient()
  const { error } = await supabase.from('documents_employes').delete().eq('id', id)
  if (error) throw new Error(error.message)
  revalidatePath('/admin/rh')
  return { ok: true as const }
}

// ─── Formations ────────────────────────────────────────────────────

const formationSchema = z.object({
  employe_id:      z.string().uuid(),
  formation:       z.enum(['haccp','permis_exploitation','sst','incendie','allergenes','hygiene','autre']),
  titre:           z.string().trim().min(1).max(200),
  organisme:       z.string().max(200).nullable(),
  date_obtention:  z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  date_expiration: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
  document_url:    z.string().max(500).nullable(),
  notes:           z.string().max(500).nullable(),
})

export async function creerFormation(input: unknown): Promise<{ id: string }> {
  const p = formationSchema.parse(input)
  const supabase = await createClient()
  const { data, error } = await supabase.from('formations_employes').insert(p).select('id').single()
  if (error || !data) throw new Error(error?.message ?? 'Erreur')
  revalidatePath('/admin/rh')
  return { id: data.id as string }
}

export async function supprimerFormation(id: string) {
  if (!id) throw new Error('id manquant')
  const supabase = await createClient()
  const { error } = await supabase.from('formations_employes').delete().eq('id', id)
  if (error) throw new Error(error.message)
  revalidatePath('/admin/rh')
  return { ok: true as const }
}

// ─── Planning (shifts) ─────────────────────────────────────────────

const shiftSchema = z.object({
  employe_id:   z.string().uuid(),
  date_travail: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  heure_debut:  z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/),
  heure_fin:    z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/),
  poste_jour:   z.string().max(50).nullable(),
  notes:        z.string().max(500).nullable(),
})

export async function creerShift(input: unknown): Promise<{ id: string }> {
  const p = shiftSchema.parse(input)
  const supabase = await createClient()
  const { data, error } = await supabase.from('planning').insert(p).select('id').single()
  if (error || !data) throw new Error(error?.message ?? 'Erreur')
  revalidatePath('/admin/rh')
  return { id: data.id as string }
}

const updateShiftSchema = shiftSchema.extend({ id: z.string().uuid() })

export async function updateShift(input: unknown) {
  const p = updateShiftSchema.parse(input)
  const { id, ...rest } = p
  const supabase = await createClient()
  const { error } = await supabase.from('planning').update(rest).eq('id', id)
  if (error) throw new Error(error.message)
  revalidatePath('/admin/rh')
  return { ok: true as const }
}

export async function supprimerShift(id: string) {
  if (!id) throw new Error('id manquant')
  const supabase = await createClient()
  const { error } = await supabase.from('planning').delete().eq('id', id)
  if (error) throw new Error(error.message)
  revalidatePath('/admin/rh')
  return { ok: true as const }
}

// ─── Pointage ──────────────────────────────────────────────────────

export async function pointerArrivee(employe_id: string) {
  if (!employe_id) throw new Error('employe_id manquant')
  const supabase = await createClient()
  const today = new Date().toISOString().slice(0, 10)
  const now = new Date().toTimeString().slice(0, 8)

  // Évite doublon si déjà pointé
  const { data: existant } = await supabase
    .from('pointage')
    .select('id, heure_arrivee')
    .eq('employe_id', employe_id)
    .eq('date_pointage', today)
    .maybeSingle()
  if (existant) throw new Error(`Déjà pointé arrivée à ${(existant.heure_arrivee as string)?.slice(0, 5)}`)

  const { data, error } = await supabase
    .from('pointage')
    .insert({ employe_id, date_pointage: today, heure_arrivee: now })
    .select('id').single()
  if (error || !data) throw new Error(error?.message ?? 'Erreur')
  revalidatePath('/admin/rh')
  return { id: data.id as string, heure_arrivee: now }
}

export async function pointerDepart(employe_id: string) {
  if (!employe_id) throw new Error('employe_id manquant')
  const supabase = await createClient()
  const today = new Date().toISOString().slice(0, 10)
  const now = new Date().toTimeString().slice(0, 8)

  const { data: pt, error: pErr } = await supabase
    .from('pointage')
    .select('id, heure_arrivee, heure_depart')
    .eq('employe_id', employe_id)
    .eq('date_pointage', today)
    .order('heure_arrivee', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (pErr || !pt) throw new Error('Pas d\'arrivée pointée aujourd\'hui')
  if (pt.heure_depart) throw new Error(`Départ déjà pointé à ${(pt.heure_depart as string)?.slice(0, 5)}`)

  // Calcule heures travaillées
  const [hd, md] = (pt.heure_arrivee as string).split(':').map(Number)
  const [hf, mf] = now.split(':').map(Number)
  let mins = (hf * 60 + mf) - (hd * 60 + md)
  if (mins < 0) mins += 24 * 60
  const heures_travaillees = Math.round((mins / 60) * 100) / 100

  const { error } = await supabase
    .from('pointage')
    .update({ heure_depart: now, heures_travaillees })
    .eq('id', pt.id)
  if (error) throw new Error(error.message)
  revalidatePath('/admin/rh')
  return { ok: true as const, heure_depart: now, heures_travaillees }
}

// ─── Congés ────────────────────────────────────────────────────────

const congeSchema = z.object({
  employe_id: z.string().uuid(),
  date_debut: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  date_fin:   z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  type:       z.enum(['conge','absence','maladie','formation']),
  notes:      z.string().max(500).nullable(),
})

export async function demanderConge(input: unknown): Promise<{ id: string }> {
  const p = congeSchema.parse(input)
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('conges')
    .insert({ ...p, statut: 'demande' })
    .select('id').single()
  if (error || !data) throw new Error(error?.message ?? 'Erreur')
  revalidatePath('/admin/rh')
  return { id: data.id as string }
}

export async function validerConge(conge_id: string) {
  if (!conge_id) throw new Error('conge_id manquant')
  const supabase = await createClient()

  const { data: c, error: cErr } = await supabase
    .from('conges')
    .select('id, employe_id, date_debut, date_fin, type, statut')
    .eq('id', conge_id)
    .single()
  if (cErr || !c) throw new Error('Congé introuvable')
  if (c.statut === 'valide') throw new Error('Déjà validé')

  // Si type=conge, décrémente le solde
  if (c.type === 'conge') {
    const j = joursConge(c.date_debut as string, c.date_fin as string)
    const { data: emp } = await supabase.from('employes').select('solde_conges_jours').eq('id', c.employe_id).single()
    if (emp && Number(emp.solde_conges_jours) >= j) {
      await supabase
        .from('employes')
        .update({ solde_conges_jours: Number(emp.solde_conges_jours) - j })
        .eq('id', c.employe_id)
    }
  }

  const { error } = await supabase.from('conges').update({ statut: 'valide' }).eq('id', conge_id)
  if (error) throw new Error(error.message)
  revalidatePath('/admin/rh')
  return { ok: true as const }
}

export async function refuserConge(conge_id: string) {
  if (!conge_id) throw new Error('conge_id manquant')
  const supabase = await createClient()
  const { error } = await supabase.from('conges').update({ statut: 'refuse' }).eq('id', conge_id)
  if (error) throw new Error(error.message)
  revalidatePath('/admin/rh')
  return { ok: true as const }
}

export async function ajusterSoldeConges(employe_id: string, nouveau_solde: number) {
  if (!employe_id) throw new Error('employe_id manquant')
  if (nouveau_solde < 0) throw new Error('Solde négatif interdit')
  const supabase = await createClient()
  const { error } = await supabase.from('employes').update({ solde_conges_jours: nouveau_solde }).eq('id', employe_id)
  if (error) throw new Error(error.message)
  revalidatePath('/admin/rh')
  return { ok: true as const }
}
