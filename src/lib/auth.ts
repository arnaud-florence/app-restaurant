// Module 28 — Helpers d'authentification + audit + permissions pour Server Components/Actions.

import { createClient } from '@/lib/supabase/server'
import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { canAccess, getMainRoute, isReadOnly, type CustomPermissions } from '@/lib/permissions'

/** Erreur d'autorisation lancée par les helpers server action. Le client la
 *  reçoit comme un Error standard via Server Actions Next 14. */
export class ForbiddenError extends Error {
  constructor(public path: string, public reason: 'no_session' | 'no_access' | 'readonly') {
    super(reason === 'no_session' ? 'Non connecté.'
        : reason === 'readonly'   ? 'Accès en lecture seule sur cette page.'
        : 'Accès refusé.')
    this.name = 'ForbiddenError'
  }
}

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
  onboarding_completed_at: string | null
}

const COLS = 'id, email, prenom, nom, role, poste, employe_id, custom_permissions, totp_enabled, derniere_connexion, created_at, onboarding_completed_at'

/**
 * Renvoie le profil de l'utilisateur connecté, ou null.
 * Crée la ligne si elle n'existe pas, avec auto-link vers `employes` si email match.
 * Le 1ᵉʳ user qui se logue devient manager (bootstrap).
 */
export async function getProfile(): Promise<Profil | null> {
  const supabase = await createClient()
  // try/catch obligatoire : si le refresh token est invalide/expiré, getUser()
  // throw une AuthApiError qui crash le RSC. On traite alors l'user comme
  // non authentifié (le middleware s'occupera de rediriger vers /login).
  let user = null
  try {
    const result = await supabase.auth.getUser()
    user = result.data.user
  } catch {
    return null
  }
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

/**
 * Variante pour Server Actions : throw une ForbiddenError au lieu de redirect.
 * Utiliser au début d'une mutation server action sensible :
 *
 *     await requireAccessOrThrow('/admin/recettes')
 *
 * Le manager passe toujours. Audit log automatique sur refus.
 */
export async function requireAccessOrThrow(path: string): Promise<Profil> {
  const profil = await getProfile()
  if (!profil) throw new ForbiddenError(path, 'no_session')
  if (!canAccess(profil.poste, path, profil.custom_permissions)) {
    await auditLog({ action: 'access_denied', ressource_type: 'route', ressource_id: path, details: { poste: profil.poste } })
    throw new ForbiddenError(path, 'no_access')
  }
  return profil
}

/**
 * Vérifie que le profil a le DROIT D'ÉCRITURE sur cette route. Bloque les
 * employés en lecture seule (cuisinier sur /admin/recettes par exemple).
 * À appeler en TOUT DÉBUT de chaque server action de mutation.
 */
export async function requireWritable(path: string): Promise<Profil> {
  const profil = await requireAccessOrThrow(path)
  if (isReadOnly(profil.poste, path, profil.custom_permissions)) {
    await auditLog({ action: 'write_denied_readonly', ressource_type: 'route', ressource_id: path, details: { poste: profil.poste } })
    throw new ForbiddenError(path, 'readonly')
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
