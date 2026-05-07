// Module 28 — Helpers d'authentification + audit + permissions pour Server Components/Actions.

import { createClient } from '@/lib/supabase/server'
import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { canAccess, getMainRoute, type CustomPermissions } from '@/lib/permissions'

export type Profil = {
  id: string
  email: string
  prenom: string | null
  nom: string | null
  role: 'manager' | 'employe'
  poste: string | null                  // dénormalisé depuis employes.poste si lien actif
  employe_id: string | null
  custom_permissions: CustomPermissions | null
  totp_enabled: boolean
  derniere_connexion: string | null
  created_at: string
}

const COLS = 'id, email, prenom, nom, role, poste, employe_id, custom_permissions, totp_enabled, derniere_connexion, created_at'

/**
 * Renvoie le profil de l'utilisateur connecté, ou null.
 * Crée la ligne si elle n'existe pas, avec auto-link vers `employes` si email match.
 * Le 1ᵉʳ user qui se logue devient manager (bootstrap).
 */
export async function getProfile(): Promise<Profil | null> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const { data: existing } = await supabase
    .from('profils')
    .select(COLS)
    .eq('id', user.id)
    .maybeSingle()

  // Cherche un employé qui match par email (utile pour auto-link)
  const { data: employe } = await supabase
    .from('employes')
    .select('id, poste')
    .eq('email', user.email ?? '')
    .eq('actif', true)
    .maybeSingle()

  if (existing) {
    const profil = existing as Profil
    // Si le profil n'est pas encore lié à un employé mais qu'on en trouve un, on lie.
    if (!profil.employe_id && employe) {
      const { data: updated } = await supabase.from('profils')
        .update({ employe_id: employe.id, poste: employe.poste, updated_at: new Date().toISOString() })
        .eq('id', profil.id)
        .select(COLS).single()
      return (updated ?? profil) as Profil
    }
    return profil
  }

  // Bootstrap : si aucun profil manager n'existe, le 1ᵉʳ user qui se logue devient manager.
  const { count: nbManagers } = await supabase.from('profils')
    .select('id', { count: 'exact', head: true })
    .eq('role', 'manager')
  const isFirstUser = (nbManagers ?? 0) === 0

  const role: 'manager' | 'employe' = isFirstUser ? 'manager' : 'employe'
  const poste: string | null = isFirstUser ? 'manager' : (employe?.poste ?? null)

  const { data: created, error } = await supabase.from('profils').insert({
    id: user.id,
    email: user.email ?? '',
    role,
    poste,
    employe_id: employe?.id ?? null,
  }).select(COLS).single()
  if (error || !created) return null
  return created as Profil
}

/** Redirige vers /login si pas de profil ou rôle insuffisant (manager). À appeler depuis /admin/* layout. */
export async function requireManager(): Promise<Profil> {
  const profil = await getProfile()
  if (!profil) redirect('/login')
  if (profil.role !== 'manager') redirect(getMainRoute(profil.poste))
  return profil
}

/**
 * Vérifie qu'un profil a accès à un chemin. Sinon redirige vers sa page principale.
 * À utiliser depuis un layout ou page admin/* pour les modules nuancés (ex: /admin/finances
 * accessible au manager mais pas au cuisinier).
 */
export async function requireAccess(path: string): Promise<Profil> {
  const profil = await getProfile()
  if (!profil) redirect('/login')
  if (!canAccess(profil.poste, path, profil.custom_permissions)) {
    redirect(getMainRoute(profil.poste))
  }
  return profil
}

/** Récupère l'IP + user agent depuis les headers (server context). */
export async function getClientContext(): Promise<{ ip: string | null; user_agent: string | null }> {
  const h = await headers()
  const ipRaw = h.get('x-forwarded-for') ?? h.get('x-real-ip') ?? null
  const ip = ipRaw ? ipRaw.split(',')[0].trim() : null
  const user_agent = h.get('user-agent') ?? null
  return { ip, user_agent }
}

/** Trace une action sensible dans audit_logs. Best-effort : n'interrompt jamais le flux principal. */
export async function auditLog(input: {
  action: string
  ressource_type?: string | null
  ressource_id?: string | null
  details?: Record<string, unknown>
}) {
  try {
    const supabase = await createClient()
    const profil = await getProfile()
    const { ip, user_agent } = await getClientContext()
    await supabase.from('audit_logs').insert({
      profil_id: profil?.id ?? null,
      email: profil?.email ?? null,
      action: input.action,
      ressource_type: input.ressource_type ?? null,
      ressource_id: input.ressource_id ?? null,
      details: input.details ?? null,
      ip, user_agent,
    })
  } catch {
    // Best-effort
  }
}
