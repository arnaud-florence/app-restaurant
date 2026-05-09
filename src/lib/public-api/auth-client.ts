// Helper pour récupérer le client connecté depuis un token Supabase.
// Utilisé par les routes /api/public/client/* qui nécessitent une session.
//
// Flow côté outil 2 :
//   1. supabase.auth.signInWithOtp({ email }) → magic link envoyé
//   2. Client clique → callback → session Supabase établie
//   3. Outil 2 appelle /api/public/client/* avec header :
//      Authorization: Bearer <session.access_token>
//   4. Cette helper extrait le token, valide via supabase.auth.getUser()
//      puis trouve le client lié via clients.auth_user_id

import { createAdminClient } from '@/lib/supabase/admin'

export type AuthUserResult =
  | { ok: true; user_id: string; email: string }
  | { ok: false; status: number; reason: string }

export async function getAuthUser(req: Request): Promise<AuthUserResult> {
  const auth = req.headers.get('authorization')
  if (!auth || !auth.startsWith('Bearer ')) {
    return { ok: false, status: 401, reason: 'Header Authorization manquant' }
  }
  const token = auth.slice(7).trim()
  if (!token) return { ok: false, status: 401, reason: 'Token vide' }

  const sb = createAdminClient()
  const { data, error } = await sb.auth.getUser(token)
  if (error || !data?.user) {
    return { ok: false, status: 401, reason: 'Session invalide ou expirée' }
  }
  if (!data.user.email) {
    return { ok: false, status: 401, reason: 'Email manquant sur le compte' }
  }
  return { ok: true, user_id: data.user.id, email: data.user.email }
}

// Retourne le client (table clients) lié à l'auth user, OU le crée si inexistant
// en se basant sur l'email (cas d'un client qui n'a jamais commandé sur place
// mais s'inscrit en ligne pour la 1re fois).
export async function getOrLinkClient(authUserId: string, email: string): Promise<{
  client_id: string; deja_lie: boolean; cree: boolean
}> {
  const sb = createAdminClient()

  // Déjà lié à ce auth user ?
  const { data: existant } = await sb.from('clients')
    .select('id').eq('auth_user_id', authUserId).maybeSingle()
  if (existant) {
    return { client_id: existant.id as string, deja_lie: true, cree: false }
  }

  // Pas encore lié : cherche par email
  const { data: parEmail } = await sb.from('clients')
    .select('id, auth_user_id').eq('email', email).maybeSingle()
  if (parEmail) {
    // Client existe déjà avec cet email : on le lie au compte auth
    if (parEmail.auth_user_id && parEmail.auth_user_id !== authUserId) {
      // Conflit : un autre auth_user est déjà lié à ce client. Refus.
      throw new Error('Cet email est déjà lié à un autre compte.')
    }
    await sb.from('clients').update({
      auth_user_id: authUserId,
      email_verifie: true,
    }).eq('id', parEmail.id)
    return { client_id: parEmail.id as string, deja_lie: false, cree: false }
  }

  // Sinon : crée un client minimal
  const { genererCodeParrainage } = await import('@/lib/clients')
  const code = genererCodeParrainage('NOUV', 'CLIENT')
  const { data: nouveau, error } = await sb.from('clients').insert({
    nom: email.split('@')[0],
    email,
    auth_user_id: authUserId,
    email_verifie: true,
    code_parrainage: code,
    points_fidelite: 0,
    niveau_fidelite: 'standard',
  }).select('id').single()
  if (error || !nouveau) throw new Error(error?.message ?? 'Erreur création client')
  return { client_id: nouveau.id as string, deja_lie: false, cree: true }
}
