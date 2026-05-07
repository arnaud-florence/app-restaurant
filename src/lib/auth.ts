// Module 28 — Helpers d'authentification + audit pour Server Components/Actions.

import { createClient } from '@/lib/supabase/server'
import { headers } from 'next/headers'
import { redirect } from 'next/navigation'

export type Profil = {
  id: string
  email: string
  prenom: string | null
  nom: string | null
  role: 'manager' | 'employe'
  totp_enabled: boolean
  derniere_connexion: string | null
  created_at: string
}

/** Renvoie le profil de l'utilisateur connecté, ou null. Crée la ligne si elle n'existe pas. */
export async function getProfile(): Promise<Profil | null> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  // Lecture du profil
  const { data: existing } = await supabase
    .from('profils')
    .select('id, email, prenom, nom, role, totp_enabled, derniere_connexion, created_at')
    .eq('id', user.id)
    .maybeSingle()
  if (existing) return existing as Profil

  // Bootstrap : si aucun profil manager n'existe, le 1er user qui se logue devient manager
  const { count: nbManagers } = await supabase.from('profils')
    .select('id', { count: 'exact', head: true })
    .eq('role', 'manager')
  const role: 'manager' | 'employe' = (nbManagers ?? 0) === 0 ? 'manager' : 'employe'

  const { data: created, error } = await supabase.from('profils').insert({
    id: user.id,
    email: user.email ?? '',
    role,
  }).select('id, email, prenom, nom, role, totp_enabled, derniere_connexion, created_at').single()
  if (error || !created) return null
  return created as Profil
}

/** Redirige vers /login si pas de profil ou rôle insuffisant. À appeler dans le layout/page admin. */
export async function requireManager(): Promise<Profil> {
  const profil = await getProfile()
  if (!profil) redirect('/login')
  if (profil.role !== 'manager') redirect('/login?error=role')
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
    // Best-effort : on n'interrompt pas l'action sensible si le log échoue
  }
}
