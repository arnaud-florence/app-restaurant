// Client Supabase ADMIN (service_role key) — server-only, jamais exposé client.
//
// Utilisé pour les opérations qui nécessitent les droits admin :
//   - inviter un user par email (auth.admin.inviteUserByEmail)
//   - lister les users (auth.admin.listUsers)
//   - bypass RLS pour des opérations système
//
// ⚠️  NE JAMAIS importer ce fichier depuis un Client Component.
//     L'env SUPABASE_SERVICE_ROLE_KEY n'est PAS prefixed NEXT_PUBLIC.

import { createClient as createSupabaseClient } from '@supabase/supabase-js'

export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url) throw new Error('NEXT_PUBLIC_SUPABASE_URL manquante')
  if (!key) throw new Error('SUPABASE_SERVICE_ROLE_KEY manquante (à ajouter dans Vercel + .env.local)')
  return createSupabaseClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}
