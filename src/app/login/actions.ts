'use server'

import { z } from 'zod'
import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { verifySync } from 'otplib'
import { auditLog, getClientContext } from '@/lib/auth'

const loginSchema = z.object({
  email:    z.string().email(),
  password: z.string().min(6).max(200),
  totp:     z.string().regex(/^\d{6}$/).optional(),
})

const signupSchema = loginSchema.pick({ email: true, password: true })

/** Connexion email + password (+ TOTP si activé). */
export async function loginAction(input: unknown): Promise<{ ok: true; needs_2fa?: boolean } | { ok: false; error: string }> {
  const p = loginSchema.safeParse(input)
  if (!p.success) return { ok: false, error: 'Identifiants invalides' }

  const supabase = await createClient()
  const { ip, user_agent } = await getClientContext()

  const { data: signin, error } = await supabase.auth.signInWithPassword({
    email: p.data.email, password: p.data.password,
  })
  if (error || !signin.user) {
    await supabase.from('connexions').insert({
      email: p.data.email, succes: false, ip, user_agent,
    })
    return { ok: false, error: 'Email ou mot de passe incorrect.' }
  }

  // Charge le profil pour vérifier 2FA
  const { data: profil } = await supabase.from('profils')
    .select('id, totp_enabled, totp_secret').eq('id', signin.user.id).maybeSingle()

  if (profil?.totp_enabled) {
    if (!p.data.totp) {
      // Le code TOTP est requis mais absent — on déconnecte et on demande le 2FA.
      await supabase.auth.signOut()
      return { ok: true, needs_2fa: true }
    }
    const { valid } = verifySync({ secret: profil.totp_secret as string, token: p.data.totp })
    if (!valid) {
      await supabase.auth.signOut()
      await supabase.from('connexions').insert({ profil_id: profil.id, email: p.data.email, succes: false, ip, user_agent })
      return { ok: false, error: 'Code 2FA incorrect.' }
    }
  }

  // Détection IP inhabituelle (jamais vue auparavant pour ce profil)
  let inhabituelle = false
  if (profil && ip) {
    const { count } = await supabase.from('connexions')
      .select('id', { count: 'exact', head: true })
      .eq('profil_id', profil.id).eq('ip', ip).eq('succes', true)
    inhabituelle = (count ?? 0) === 0
  }

  await supabase.from('connexions').insert({
    profil_id: profil?.id ?? null, email: p.data.email,
    succes: true, ip, user_agent, inhabituelle,
  })
  if (profil) {
    await supabase.from('profils').update({ derniere_connexion: new Date().toISOString() }).eq('id', profil.id)
  }
  await auditLog({ action: 'login', details: { inhabituelle } })
  return { ok: true }
}

/** Création d'un compte (le 1er user devient automatiquement manager via getProfile). */
export async function signupAction(input: unknown): Promise<{ ok: true } | { ok: false; error: string }> {
  const p = signupSchema.safeParse(input)
  if (!p.success) return { ok: false, error: 'Email + mot de passe (≥6 car.) requis.' }

  const supabase = await createClient()
  const { error } = await supabase.auth.signUp({
    email: p.data.email,
    password: p.data.password,
  })
  if (error) return { ok: false, error: error.message }
  return { ok: true }
}

/** Déconnexion. */
export async function logoutAction() {
  const supabase = await createClient()
  await auditLog({ action: 'logout' })
  await supabase.auth.signOut()
  revalidatePath('/', 'layout')
  redirect('/login')
}
