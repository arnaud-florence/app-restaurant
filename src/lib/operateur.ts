// Système « opérateur » pour les tablettes partagées (modèle pro POS) :
//  - un employé « prend le poste » en tapant son PIN → session opérateur (cookie
//    httpOnly signé, ~14 h = une journée de service) ;
//  - chaque action métier est estampillée avec cet opérateur (journal_activite) ;
//  - verrouillage auto géré côté client (inactivité) qui appelle /logout.
//
// Réutilise le hachage SHA-256 + salt déjà en place (lib/borne/pin, colonnes
// pin_hash/pin_salt/… sur employes depuis la migration 0093).
//
// Server-only (cookies + crypto). À NE PAS importer dans un Client Component.

import { cookies } from 'next/headers'
import { createHmac } from 'node:crypto'
import { createClient } from '@/lib/supabase/server'
import { hashPin, generateSalt, isValidPinFormat } from '@/lib/borne/pin'

const COOKIE = 'op_session'
const SECRET = process.env.OPERATEUR_SECRET || process.env.CRON_SECRET || 'casatasia-operateur'
const MAX_AGE = 60 * 60 * 14 // 14 h

function sign(id: string): string {
  return createHmac('sha256', SECRET).update(id).digest('hex').slice(0, 24)
}

export type Operateur = { id: string; nom: string; poste: string | null }

function nomCourt(prenom: unknown, nom: unknown): string {
  const p = (prenom as string) ?? ''
  const n = (nom as string) ?? ''
  return `${p}${n ? ' ' + n.charAt(0) + '.' : ''}`.trim() || 'Opérateur'
}

// ─── Vérifie un PIN contre tous les employés actifs ──────────────────
export async function verifierPinOperateur(
  pin: string,
): Promise<{ ok: true; operateur: Operateur } | { ok: false; reason: 'format' | 'invalid' | 'locked' }> {
  if (!isValidPinFormat(pin)) return { ok: false, reason: 'format' }
  const sb = await createClient()
  const { data: emps } = await sb.from('employes')
    .select('id, prenom, nom, poste, pin_hash, pin_salt, pin_lock_until')
    .eq('actif', true).not('pin_hash', 'is', null)
  const now = Date.now()
  for (const e of emps ?? []) {
    if (e.pin_salt && e.pin_hash && hashPin(pin, e.pin_salt as string) === e.pin_hash) {
      const lock = e.pin_lock_until ? new Date(e.pin_lock_until as string).getTime() : 0
      if (lock > now) return { ok: false, reason: 'locked' }
      await sb.from('employes').update({ pin_essais: 0, pin_lock_until: null }).eq('id', e.id)
      return { ok: true, operateur: { id: e.id as string, nom: nomCourt(e.prenom, e.nom), poste: (e.poste as string) ?? null } }
    }
  }
  return { ok: false, reason: 'invalid' }
}

// ─── Session opérateur (cookie httpOnly signé) ───────────────────────
export async function setOperateurSession(employeId: string): Promise<void> {
  cookies().set(COOKIE, `${employeId}.${sign(employeId)}`, {
    httpOnly: true, sameSite: 'lax', path: '/', maxAge: MAX_AGE,
  })
}

export async function clearOperateurSession(): Promise<void> {
  cookies().delete(COOKIE)
}

export async function getOperateurId(): Promise<string | null> {
  const raw = cookies().get(COOKIE)?.value
  if (!raw) return null
  const idx = raw.lastIndexOf('.')
  if (idx < 0) return null
  const id = raw.slice(0, idx)
  const sig = raw.slice(idx + 1)
  if (!id || sig !== sign(id)) return null
  return id
}

export async function getOperateur(): Promise<Operateur | null> {
  const id = await getOperateurId()
  if (!id) return null
  const sb = await createClient()
  const { data } = await sb.from('employes').select('id, prenom, nom, poste, actif').eq('id', id).maybeSingle()
  if (!data || !data.actif) return null
  return { id: data.id as string, nom: nomCourt(data.prenom, data.nom), poste: (data.poste as string) ?? null }
}

// ─── Journalise une action métier (best-effort, jamais bloquant) ─────
export async function logActivite(input: {
  action: string
  zone?: string
  cible?: string
  details?: Record<string, unknown>
  employeId?: string          // override explicite (sinon = opérateur courant)
}): Promise<void> {
  try {
    const sb = await createClient()
    let employeId = input.employeId ?? (await getOperateurId())
    // Fallback back-office : si aucun opérateur « au poste » (tablette), on
    // attribue à l'utilisateur connecté (ex. gérant/employé sur son téléphone).
    if (!employeId) {
      try {
        const { data: { user } } = await sb.auth.getUser()
        if (user) {
          const { data: prof } = await sb.from('profils').select('employe_id').eq('id', user.id).maybeSingle()
          employeId = (prof?.employe_id as string) ?? null
        }
      } catch { /* non connecté / token expiré */ }
    }
    let nom: string | null = null
    if (employeId) {
      const { data } = await sb.from('employes').select('prenom, nom').eq('id', employeId).maybeSingle()
      if (data) nom = nomCourt(data.prenom, data.nom)
      else employeId = null
    }
    await sb.from('journal_activite').insert({
      employe_id: employeId,
      employe_nom: nom,
      action: input.action,
      zone: input.zone ?? null,
      cible: input.cible ?? null,
      details: input.details ?? {},
    })
  } catch { /* journal best-effort */ }
}

// ─── Définir / réinitialiser le PIN d'un employé (manager-only côté UI) ──
export async function definirPinEmploye(employeId: string, pin: string): Promise<{ ok: true }> {
  if (!isValidPinFormat(pin)) throw new Error('PIN invalide : 4 à 6 chiffres')
  const sb = await createClient()
  const salt = generateSalt()
  const hash = hashPin(pin, salt)
  const { error } = await sb.from('employes')
    .update({ pin_hash: hash, pin_salt: salt, pin_essais: 0, pin_lock_until: null, pin_last_try: null })
    .eq('id', employeId)
  if (error) throw new Error(error.message)
  return { ok: true as const }
}
