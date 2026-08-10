'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireManager } from '@/lib/auth'
import { joursConge } from '@/lib/rh'
import { creerNotification } from '@/lib/notifications'

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

// ─── Autonomie configurable par employé ───────────────────────────
const autonomieSchema = z.object({
  employe_id:               z.string().uuid(),
  autonomie_reception:      z.boolean().optional(),
  autonomie_commande:       z.boolean().optional(),
  autonomie_modif_recettes: z.boolean().optional(),
  autonomie_voir_prix:      z.boolean().optional(),
})

/** Active/désactive un ou plusieurs interrupteurs d'autonomie d'un employé.
 *  Par défaut tout est false ; le gérant ouvre au cas par cas. */
export async function setAutonomie(input: unknown) {
  const p = autonomieSchema.parse(input)
  const { employe_id, ...flags } = p
  const patch = Object.fromEntries(Object.entries(flags).filter(([, v]) => v !== undefined))
  if (Object.keys(patch).length === 0) return { ok: true as const }
  const supabase = await createClient()
  const { error } = await supabase.from('employes').update(patch).eq('id', employe_id)
  if (error) throw new Error(error.message)
  revalidatePath('/admin/rh')
  return { ok: true as const }
}

// ─── PIN opérateur (tablette partagée) ────────────────────────────
const pinSchema = z.object({
  employe_id: z.string().uuid(),
  pin: z.string().regex(/^\d{4,6}$/, 'PIN : 4 à 6 chiffres'),
})

/** Définit/réinitialise le code PIN d'un employé (pour « prendre le poste »). */
export async function setPinEmploye(input: unknown) {
  await requireManager()
  const p = pinSchema.parse(input)
  const { definirPinEmploye } = await import('@/lib/operateur')
  await definirPinEmploye(p.employe_id, p.pin)
  revalidatePath('/admin/rh')
  return { ok: true as const }
}

// ─── Permissions personnalisées par employé ───────────────────────
const customPermissionsSchema = z.object({
  employe_id: z.string().uuid(),
  allowed:    z.array(z.string().min(1)).max(50).default([]),
  denied:     z.array(z.string().min(1)).max(50).default([]),
  readonly:   z.array(z.string().min(1)).max(50).default([]),
  writable:   z.array(z.string().min(1)).max(50).default([]),
})

/** Met à jour les overrides de permissions du profil lié à cet employé.
 *  - allowed   : routes accordées en plus de la matrice du poste
 *  - denied    : routes interdites (priorité sur tout)
 *  - readonly  : force la route en lecture seule pour cet employé
 *  - writable  : lève le readonly de la matrice pour cet employé
 *
 *  Si aucun profil n'est encore lié, on stocke quand même : à la 1ère
 *  connexion, getProfile() liera l'employé via email match et le profil
 *  héritera des bons droits.
 */
export async function setEmployePermissions(input: unknown) {
  const p = customPermissionsSchema.parse(input)
  const supabase = await createClient()
  const isEmpty = p.allowed.length === 0 && p.denied.length === 0
                && p.readonly.length === 0 && p.writable.length === 0
  const overrides = isEmpty ? null : {
    allowed:  p.allowed.length  > 0 ? p.allowed  : undefined,
    denied:   p.denied.length   > 0 ? p.denied   : undefined,
    readonly: p.readonly.length > 0 ? p.readonly : undefined,
    writable: p.writable.length > 0 ? p.writable : undefined,
  }
  const { error } = await supabase.from('profils')
    .update({ custom_permissions: overrides, updated_at: new Date().toISOString() })
    .eq('employe_id', p.employe_id)
  if (error) throw new Error(error.message)
  revalidatePath('/admin/rh')
  revalidatePath('/admin/securite')
  return { ok: true as const }
}

/** Lit les overrides actuels du profil lié à cet employé. */
export async function getEmployePermissions(employe_id: string): Promise<{
  hasProfil: boolean
  allowed: string[]
  denied: string[]
  readonly: string[]
  writable: string[]
}> {
  if (!employe_id) throw new Error('employe_id manquant')
  const supabase = await createClient()
  const { data } = await supabase.from('profils')
    .select('custom_permissions')
    .eq('employe_id', employe_id)
    .maybeSingle()
  if (!data) return { hasProfil: false, allowed: [], denied: [], readonly: [], writable: [] }
  const cp = (data.custom_permissions ?? {}) as { allowed?: string[]; denied?: string[]; readonly?: string[]; writable?: string[] }
  return {
    hasProfil: true,
    allowed:  cp.allowed  ?? [],
    denied:   cp.denied   ?? [],
    readonly: cp.readonly ?? [],
    writable: cp.writable ?? [],
  }
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

  // Si type=conge, décrémente toujours le solde (peut passer en négatif → dépassement visible)
  let soldeAvertissement: string | null = null
  if (c.type === 'conge') {
    const j = joursConge(c.date_debut as string, c.date_fin as string)
    const { data: emp } = await supabase.from('employes').select('solde_conges_jours').eq('id', c.employe_id).single()
    if (emp) {
      const nouveauSolde = Number(emp.solde_conges_jours) - j
      await supabase
        .from('employes')
        .update({ solde_conges_jours: nouveauSolde })
        .eq('id', c.employe_id)
      if (nouveauSolde < 0) soldeAvertissement = `Solde de congés dépassé : ${nouveauSolde} j restant(s).`
    }
  }

  const { error } = await supabase.from('conges').update({ statut: 'valide' }).eq('id', conge_id)
  if (error) throw new Error(error.message)

  // Notif employé
  await creerNotification({
    destinataire_employe_id: c.employe_id as string,
    type: 'conge_validee',
    titre: '✅ Congé validé',
    message: `Ta demande de ${c.type} du ${c.date_debut} au ${c.date_fin} a été validée par le manager.`,
    url_action: '/mon-espace',
  })

  revalidatePath('/admin/rh')
  revalidatePath('/mon-espace')
  return { ok: true as const, avertissement: soldeAvertissement }
}

export async function refuserConge(conge_id: string) {
  if (!conge_id) throw new Error('conge_id manquant')
  const supabase = await createClient()

  const { data: c } = await supabase.from('conges')
    .select('employe_id, date_debut, date_fin, type')
    .eq('id', conge_id).maybeSingle()

  const { error } = await supabase.from('conges').update({ statut: 'refuse' }).eq('id', conge_id)
  if (error) throw new Error(error.message)

  // Notif employé
  if (c?.employe_id) {
    await creerNotification({
      destinataire_employe_id: c.employe_id as string,
      type: 'conge_refusee',
      titre: '❌ Congé refusé',
      message: `Ta demande de ${c.type} du ${c.date_debut} au ${c.date_fin} a été refusée. Échange avec le manager.`,
      url_action: '/mon-espace',
    })
  }

  revalidatePath('/admin/rh')
  revalidatePath('/mon-espace')
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

// ─── Invitation employé par email Magic Link ─────────────────────
//
// Workflow :
//  1. Manager crée l'employé dans /admin/rh avec son email
//  2. Click sur « Inviter par email » → cette action :
//     - Vérifie l'employé + son email
//     - Vérifie qu'il n'existe pas déjà un user Supabase avec cet email
//     - Si non → admin.inviteUserByEmail (envoie email + crée user)
//     - Si oui → re-envoie un magic link via admin.generateLink
//  3. Employé clique sur le lien → arrive sur l'app, profil auto-link via getProfile()
//  4. Onboarding wizard si pas encore fait
//
// Sécurité : nécessite SUPABASE_SERVICE_ROLE_KEY (server-only).
//            Action protégée par requireManager().
export async function inviterEmploye(input: { employe_id: string }): Promise<{
  ok: true
  email: string
  action: 'invited' | 'link_resent'
}> {
  await requireManager()
  if (!input.employe_id) throw new Error('employe_id manquant')

  // 1. Récupère l'employé
  const supabase = await createClient()
  const { data: emp, error: errE } = await supabase.from('employes')
    .select('id, prenom, nom, email, actif')
    .eq('id', input.employe_id)
    .maybeSingle()
  if (errE)        throw new Error(errE.message)
  if (!emp)        throw new Error('Employé introuvable')
  if (!emp.actif)  throw new Error('Employé archivé — réactive-le d\'abord')
  const email = (emp.email as string | null)?.trim()
  if (!email)      throw new Error('Cet employé n\'a pas d\'email — ajoute-le sur sa fiche')

  // 2. Tente d'inviter via Admin API
  const admin = createAdminClient()
  const redirectTo = `${process.env.NEXT_PUBLIC_SITE_URL ?? 'https://app-restaurant-livid.vercel.app'}/`

  const { error: errInvite } = await admin.auth.admin.inviteUserByEmail(email, {
    redirectTo,
    data: {
      prenom: emp.prenom,
      nom:    emp.nom,
    },
  })
  if (!errInvite) {
    revalidatePath('/admin/rh')
    return { ok: true as const, email, action: 'invited' }
  }

  // 3. Si user existe déjà → on génère un magic link à la place
  const msg = (errInvite.message ?? '').toLowerCase()
  const exists = msg.includes('already registered') || msg.includes('user already') || msg.includes('exists')
  if (exists) {
    const { error: errLink } = await admin.auth.admin.generateLink({
      type:  'magiclink',
      email,
      options: { redirectTo },
    })
    if (errLink) throw new Error(errLink.message)
    revalidatePath('/admin/rh')
    return { ok: true as const, email, action: 'link_resent' }
  }

  throw new Error(errInvite.message || 'Erreur d\'invitation')
}
