'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { generateSecret, generateURI, verifySync } from 'otplib'
import { auditLog, requireManager } from '@/lib/auth'

// ─── 2FA ─────────────────────────────────────────────────────────────
/** Génère un secret TOTP + 10 backup codes. Renvoie le secret + l'URL otpauth pour QR. */
export async function preparer2FA(): Promise<{ secret: string; otpauth: string; backup_codes: string[] }> {
  const profil = await requireManager()
  const secret = generateSecret()
  const otpauth = generateURI({ issuer: 'App Restaurant', label: profil.email, secret })
  const backup_codes = Array.from({ length: 10 }, () =>
    Math.random().toString(36).slice(2, 6).toUpperCase() + '-' + Math.random().toString(36).slice(2, 6).toUpperCase(),
  )
  return { secret, otpauth, backup_codes }
}

const activer2FASchema = z.object({
  secret: z.string().regex(/^[A-Z2-7]+=*$/),
  code:   z.string().regex(/^\d{6}$/),
  backup_codes: z.array(z.string().min(8).max(20)).length(10),
})

/** Active le 2FA après vérification d'un 1er code, et persiste le secret + backup codes. */
export async function activer2FA(input: unknown) {
  const profil = await requireManager()
  const p = activer2FASchema.parse(input)

  const { valid } = verifySync({ secret: p.secret, token: p.code })
  if (!valid) throw new Error('Code TOTP invalide. Vérifiez l\'horloge de votre téléphone.')

  const supabase = await createClient()
  const { error } = await supabase.from('profils').update({
    totp_secret: p.secret,
    totp_enabled: true,
    backup_codes: p.backup_codes,
    updated_at: new Date().toISOString(),
  }).eq('id', profil.id)
  if (error) throw new Error(error.message)
  await auditLog({ action: 'enable_2fa' })
  revalidatePath('/admin/securite')
  return { ok: true as const }
}

export async function desactiver2FA() {
  const profil = await requireManager()
  const supabase = await createClient()
  const { error } = await supabase.from('profils').update({
    totp_enabled: false,
    totp_secret: null,
    backup_codes: [],
    updated_at: new Date().toISOString(),
  }).eq('id', profil.id)
  if (error) throw new Error(error.message)
  await auditLog({ action: 'disable_2fa' })
  revalidatePath('/admin/securite')
  return { ok: true as const }
}

// ─── Gestion profils (gérant) ────────────────────────────────────────
const updateRoleSchema = z.object({
  id:   z.string().uuid(),
  role: z.enum(['manager', 'employe']),
})

export async function changerRole(input: unknown) {
  await requireManager()
  const p = updateRoleSchema.parse(input)
  const supabase = await createClient()
  const { error } = await supabase.from('profils').update({ role: p.role }).eq('id', p.id)
  if (error) throw new Error(error.message)
  await auditLog({ action: 'change_role', ressource_type: 'profil', ressource_id: p.id, details: { role: p.role } })
  revalidatePath('/admin/securite')
  return { ok: true as const }
}

// ─── Sauvegarde JSON ────────────────────────────────────────────────
const TABLES_BACKUP = [
  'parametres', 'employes', 'tables_restaurant', 'recettes', 'recette_ingredients',
  'ingredients', 'historique_prix_ingredients', 'boissons', 'fournisseurs',
  'commandes', 'commande_articles', 'paiements_caisse',
  'non_conformites', 'lots_produits', 'releves_temperatures',
  'objectifs', 'actions_strategiques', 'guides_formation', 'etapes_formation',
  'menu_du_jour', 'affichage_promos',
] as const

/** Génère un dump JSON des tables critiques. Renvoyé sous forme d'objet { tables: { table_name: rows[] } }. */
export async function genererSauvegarde(): Promise<{ genere_le: string; tables: Record<string, unknown[]> }> {
  await requireManager()
  const supabase = await createClient()
  const result: Record<string, unknown[]> = {}
  for (const t of TABLES_BACKUP) {
    const { data } = await supabase.from(t).select('*')
    result[t] = data ?? []
  }
  await auditLog({ action: 'export_backup', details: { tables_count: TABLES_BACKUP.length } })
  return { genere_le: new Date().toISOString(), tables: result }
}
