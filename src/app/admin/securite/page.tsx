// Module 28 — Page /admin/securite : profils + 2FA + journal + sauvegarde.

import { createClient } from '@/lib/supabase/server'
import SecuriteClient from './SecuriteClient'
import { requireManager } from '@/lib/auth'

export const metadata = { title: 'Sécurité — Admin' }
export const dynamic = 'force-dynamic'

export default async function SecuritePage() {
  const profilCourant = await requireManager()
  const supabase = await createClient()

  const [profilsRes, auditRes, connexionsRes] = await Promise.all([
    supabase.from('profils').select('id, email, prenom, nom, role, totp_enabled, derniere_connexion, created_at').order('created_at', { ascending: false }),
    supabase.from('audit_logs').select('id, profil_id, email, action, ressource_type, ressource_id, ip, created_at, details').order('created_at', { ascending: false }).limit(100),
    supabase.from('connexions').select('id, profil_id, email, succes, ip, user_agent, inhabituelle, created_at').order('created_at', { ascending: false }).limit(50),
  ])

  return (
    <SecuriteClient
      profilCourant={profilCourant}
      profils={(profilsRes.data ?? []) as Array<{ id: string; email: string; prenom: string | null; nom: string | null; role: 'manager' | 'employe'; totp_enabled: boolean; derniere_connexion: string | null; created_at: string }>}
      audit={(auditRes.data ?? []) as Array<{ id: string; profil_id: string | null; email: string | null; action: string; ressource_type: string | null; ressource_id: string | null; ip: string | null; created_at: string; details: Record<string, unknown> | null }>}
      connexions={(connexionsRes.data ?? []) as Array<{ id: string; profil_id: string | null; email: string | null; succes: boolean; ip: string | null; user_agent: string | null; inhabituelle: boolean; created_at: string }>}
    />
  )
}
