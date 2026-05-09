'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { genererCodeParrainage, calculerNiveau } from '@/lib/clients'

// ─── Clients ───────────────────────────────────────────────────────

const clientSchema = z.object({
  prenom:           z.string().max(100).nullable(),
  nom:              z.string().trim().min(1).max(100),
  email:            z.string().email().nullable().or(z.literal('').transform(() => null)),
  telephone:        z.string().max(30).nullable(),
  adresse:          z.string().max(500).nullable(),
  date_naissance:   z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
  allergies:        z.array(z.string()).default([]),
  preferences:      z.string().max(500).nullable(),
  opt_in_marketing: z.boolean().default(false),
  parraine_par_id:  z.string().uuid().nullable(),
  notes_internes:   z.string().max(1000).nullable(),
})

export async function creerClient(input: unknown): Promise<{ id: string; code_parrainage: string }> {
  const p = clientSchema.parse(input)
  const supabase = await createClient()
  const code = genererCodeParrainage(p.prenom ?? p.nom, p.nom)
  const { data, error } = await supabase.from('clients').insert({
    ...p,
    code_parrainage: code,
    points_fidelite: 0,
    niveau_fidelite: 'standard',
  }).select('id, code_parrainage').single()
  if (error || !data) throw new Error(error?.message ?? 'Erreur')
  revalidatePath('/admin/clients')
  return { id: data.id as string, code_parrainage: data.code_parrainage as string }
}

const updateClientSchema = clientSchema.extend({ id: z.string().uuid() })

export async function updateClient(input: unknown) {
  const p = updateClientSchema.parse(input)
  const { id, ...rest } = p
  const supabase = await createClient()
  const { error } = await supabase.from('clients').update(rest).eq('id', id)
  if (error) throw new Error(error.message)
  revalidatePath('/admin/clients')
  return { ok: true as const }
}

/**
 * Création express depuis la caisse (4 champs : prénom, nom, email, téléphone).
 * Renvoie l'objet client complet pour qu'il puisse être directement utilisé par le picker.
 * Idempotence : si email ou téléphone déjà présents → renvoie le client existant.
 */
const clientRapideSchema = z.object({
  prenom:    z.string().trim().max(100).nullable(),
  nom:       z.string().trim().min(1, 'Nom obligatoire').max(100),
  email:     z.string().trim().max(160).nullable().transform(v => v && v.length > 0 ? v : null),
  telephone: z.string().trim().max(30).nullable().transform(v => v && v.length > 0 ? v : null),
})

export async function creerClientRapide(input: unknown): Promise<{
  id: string; prenom: string | null; nom: string;
  email: string | null; telephone: string | null;
  niveau_fidelite: string; nb_visites: number; points_fidelite: number;
  deja_existant: boolean
}> {
  const p = clientRapideSchema.parse(input)
  const supabase = await createClient()

  // Idempotence : on évite les doublons sur email OU téléphone
  if (p.email || p.telephone) {
    let q = supabase.from('clients')
      .select('id, prenom, nom, email, telephone, niveau_fidelite, nb_visites, points_fidelite')
      .limit(1)
    if (p.email) q = q.eq('email', p.email)
    else if (p.telephone) q = q.eq('telephone', p.telephone)
    const { data: existing } = await q
    if (existing && existing.length > 0) {
      const e = existing[0]
      return {
        id: e.id as string,
        prenom: (e.prenom as string) ?? null,
        nom: e.nom as string,
        email: (e.email as string) ?? null,
        telephone: (e.telephone as string) ?? null,
        niveau_fidelite: (e.niveau_fidelite as string) ?? 'standard',
        nb_visites: Number(e.nb_visites ?? 0),
        points_fidelite: Number(e.points_fidelite ?? 0),
        deja_existant: true,
      }
    }
  }

  const code = genererCodeParrainage(p.prenom ?? p.nom, p.nom)
  const { data, error } = await supabase.from('clients').insert({
    prenom:    p.prenom,
    nom:       p.nom,
    email:     p.email,
    telephone: p.telephone,
    code_parrainage: code,
    points_fidelite: 0,
    niveau_fidelite: 'standard',
    opt_in_marketing: false,
  }).select('id, prenom, nom, email, telephone, niveau_fidelite, nb_visites, points_fidelite').single()
  if (error || !data) throw new Error(error?.message ?? 'Erreur création')

  revalidatePath('/admin/clients')
  return {
    id: data.id as string,
    prenom: (data.prenom as string) ?? null,
    nom: data.nom as string,
    email: (data.email as string) ?? null,
    telephone: (data.telephone as string) ?? null,
    niveau_fidelite: (data.niveau_fidelite as string) ?? 'standard',
    nb_visites: Number(data.nb_visites ?? 0),
    points_fidelite: Number(data.points_fidelite ?? 0),
    deja_existant: false,
  }
}

/**
 * Recherche rapide pour autocomplete (encaissement, réservation, etc.).
 * Match insensible à la casse sur prénom/nom/email/téléphone. Limite 8 résultats.
 */
export async function searchClients(query: string): Promise<Array<{
  id: string; prenom: string | null; nom: string;
  email: string | null; telephone: string | null;
  niveau_fidelite: string; nb_visites: number; points_fidelite: number;
}>> {
  const q = query.trim()
  if (q.length < 2) return []
  const supabase = await createClient()
  // Escape % et _ pour éviter wildcard injection
  const safe = q.replace(/[%_]/g, ch => '\\' + ch)
  const { data } = await supabase.from('clients')
    .select('id, prenom, nom, email, telephone, niveau_fidelite, nb_visites, points_fidelite')
    .or(`nom.ilike.%${safe}%,prenom.ilike.%${safe}%,email.ilike.%${safe}%,telephone.ilike.%${safe}%`)
    .order('nb_visites', { ascending: false })
    .limit(8)
  return (data ?? []).map(r => ({
    id: r.id as string,
    prenom: (r.prenom as string) ?? null,
    nom: r.nom as string,
    email: (r.email as string) ?? null,
    telephone: (r.telephone as string) ?? null,
    niveau_fidelite: (r.niveau_fidelite as string) ?? 'standard',
    nb_visites: Number(r.nb_visites ?? 0),
    points_fidelite: Number(r.points_fidelite ?? 0),
  }))
}

export async function supprimerClient(id: string) {
  if (!id) throw new Error('id manquant')
  const supabase = await createClient()
  const { error } = await supabase.from('clients').delete().eq('id', id)
  if (error) throw new Error(error.message)
  revalidatePath('/admin/clients')
  return { ok: true as const }
}

/**
 * Recalcule nb_visites + total_depense + niveau_fidelite à partir
 * des commandes encaissées du client (jointure via client_email).
 */
export async function recalculerStatsClient(client_id: string) {
  if (!client_id) throw new Error('client_id manquant')
  const supabase = await createClient()
  const { data: c } = await supabase.from('clients').select('email, telephone').eq('id', client_id).single()
  if (!c?.email && !c?.telephone) throw new Error('Client sans email/téléphone — impossible de matcher commandes')

  let q = supabase.from('commandes').select('montant_total_ttc, created_at').eq('statut', 'encaisse')
  if (c.email) q = q.eq('client_email', c.email)
  else if (c.telephone) q = q.eq('client_telephone', c.telephone)
  const { data: cmds } = await q

  const nb = cmds?.length ?? 0
  const total = (cmds ?? []).reduce((s, x) => s + Number(x.montant_total_ttc ?? 0), 0)
  const derniere = (cmds ?? []).map(x => x.created_at as string).sort().pop()?.slice(0, 10) ?? null
  const niveau = calculerNiveau(nb)

  await supabase.from('clients').update({
    nb_visites: nb,
    total_depense: Math.round(total * 100) / 100,
    derniere_visite: derniere,
    niveau_fidelite: niveau,
  }).eq('id', client_id)
  revalidatePath('/admin/clients')
  return { ok: true as const, nb_visites: nb, total_depense: total, niveau }
}

// ─── Campagnes ─────────────────────────────────────────────────────

const campagneSchema = z.object({
  titre:    z.string().trim().min(1).max(200),
  type:     z.enum(['email','sms']),
  segment:  z.enum(['tous','vip','dormants','anniversaires','nouveaux','allergiques','custom']),
  sujet:    z.string().max(200).nullable(),
  contenu:  z.string().trim().min(1).max(5000),
  nb_destinataires: z.number().int().min(0).default(0),
  notes:    z.string().max(500).nullable(),
})

export async function creerCampagne(input: unknown): Promise<{ id: string }> {
  const p = campagneSchema.parse(input)
  const supabase = await createClient()
  const { data, error } = await supabase.from('campagnes').insert({ ...p, statut: 'brouillon' }).select('id').single()
  if (error || !data) throw new Error(error?.message ?? 'Erreur')
  revalidatePath('/admin/clients')
  return { id: data.id as string }
}

export async function marquerCampagneEnvoyee(id: string) {
  if (!id) throw new Error('id manquant')
  const supabase = await createClient()
  const { error } = await supabase.from('campagnes').update({
    statut: 'envoyee',
    date_envoi: new Date().toISOString(),
  }).eq('id', id)
  if (error) throw new Error(error.message)
  revalidatePath('/admin/clients')
  return { ok: true as const }
}

export async function supprimerCampagne(id: string) {
  if (!id) throw new Error('id manquant')
  const supabase = await createClient()
  const { error } = await supabase.from('campagnes').delete().eq('id', id)
  if (error) throw new Error(error.message)
  revalidatePath('/admin/clients')
  return { ok: true as const }
}

// ─── Réclamations ──────────────────────────────────────────────────

const reclamSchema = z.object({
  client_id:        z.string().uuid().nullable(),
  client_nom_libre: z.string().max(200).nullable(),
  date_reclamation: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  type:             z.enum(['service','plat','attente','hygiene','prix','autre']),
  gravite:          z.enum(['mineure','majeure','critique']),
  description:      z.string().trim().min(1).max(2000),
  geste_commercial: z.string().max(500).nullable(),
})

export async function creerReclamation(input: unknown): Promise<{ id: string }> {
  const p = reclamSchema.parse(input)
  const supabase = await createClient()
  const { data, error } = await supabase.from('reclamations').insert({ ...p, statut: 'ouverte' }).select('id').single()
  if (error || !data) throw new Error(error?.message ?? 'Erreur')
  revalidatePath('/admin/clients')
  return { id: data.id as string }
}

export async function resoudreReclamation(input: unknown) {
  const p = z.object({
    id:                z.string().uuid(),
    action_corrective: z.string().trim().min(1).max(2000),
    responsable_id:    z.string().uuid().nullable(),
  }).parse(input)
  const supabase = await createClient()
  const { error } = await supabase.from('reclamations').update({
    statut: 'resolue',
    action_corrective: p.action_corrective,
    responsable_id: p.responsable_id,
    resolved_at: new Date().toISOString(),
  }).eq('id', p.id)
  if (error) throw new Error(error.message)
  revalidatePath('/admin/clients')
  return { ok: true as const }
}

// ─── Retours plats ─────────────────────────────────────────────────

const retourSchema = z.object({
  client_id:         z.string().uuid().nullable(),
  date_retour:       z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  recette_id:        z.string().uuid().nullable(),
  recette_nom_libre: z.string().max(200).nullable(),
  motif:             z.enum(['cuisson','temperature','gout','presentation','allergie','autre']),
  description:       z.string().max(2000).nullable(),
  cout_food_cost:    z.number().min(0).default(0),
  geste_commercial:  z.string().max(500).nullable(),
  refait:            z.boolean().default(false),
  responsable_id:    z.string().uuid().nullable(),
})

export async function creerRetour(input: unknown): Promise<{ id: string }> {
  const p = retourSchema.parse(input)
  if (!p.recette_id && !p.recette_nom_libre?.trim()) {
    throw new Error('recette_id OU recette_nom_libre obligatoire')
  }
  const supabase = await createClient()
  const { data, error } = await supabase.from('retours_plats').insert(p).select('id').single()
  if (error || !data) throw new Error(error?.message ?? 'Erreur')
  revalidatePath('/admin/clients')
  return { id: data.id as string }
}

export async function supprimerRetour(id: string) {
  if (!id) throw new Error('id manquant')
  const supabase = await createClient()
  const { error } = await supabase.from('retours_plats').delete().eq('id', id)
  if (error) throw new Error(error.message)
  revalidatePath('/admin/clients')
  return { ok: true as const }
}

// ─── WiFi inscription publique (utilisée par /wifi-signup) ─────────

const wifiSchema = z.object({
  prenom:           z.string().trim().min(1).max(100),
  email:            z.string().email(),
  telephone:        z.string().max(30).nullable(),
  opt_in_marketing: z.boolean(),
})

export async function inscrireWifi(input: unknown): Promise<{ ok: true; nouveau: boolean; mdp_wifi: string | null }> {
  const p = wifiSchema.parse(input)
  const supabase = await createClient()

  // Cherche client existant par email
  const { data: existant } = await supabase.from('clients').select('id').eq('email', p.email).maybeSingle()

  let nouveau = false
  if (existant) {
    // Met à jour opt-in si activé
    if (p.opt_in_marketing) {
      await supabase.from('clients').update({ opt_in_marketing: true }).eq('id', existant.id)
    }
  } else {
    nouveau = true
    const code = genererCodeParrainage(p.prenom, p.prenom)
    await supabase.from('clients').insert({
      prenom: p.prenom, nom: p.prenom,
      email: p.email,
      telephone: p.telephone,
      opt_in_marketing: p.opt_in_marketing,
      code_parrainage: code,
      notes_internes: 'Inscrit via WiFi',
    })
  }

  // Récupère mdp WiFi depuis parametres
  const { data: param } = await supabase.from('parametres').select('valeur').eq('cle', 'wifi_password').maybeSingle()
  const mdp = (param?.valeur as string) ?? null

  revalidatePath('/admin/clients')
  return { ok: true as const, nouveau, mdp_wifi: mdp }
}
