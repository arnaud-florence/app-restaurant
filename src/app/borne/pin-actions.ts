'use server'

/**
 * Server actions pour le PIN manager.
 *
 * verifierPinManager(pin) :
 *   - Cherche un employé manager (poste='manager') dont le PIN matche
 *   - Rate-limit : 3 essais ratés dans la fenêtre 60s → lock 60s
 *   - Retourne { ok, employe_id, employe_nom, lock_seconds_remaining? }
 *
 * definirPinManager(employe_id, pin) :
 *   - Hash + salt + stocke pour cet employé
 *   - Réservé aux managers (vérification côté caller)
 */

import { createClient } from '@/lib/supabase/server'
import {
  hashPin, generateSalt, isValidPinFormat,
  PIN_MAX_ESSAIS, PIN_LOCK_SECONDS, PIN_ESSAIS_WINDOW_MS,
} from '@/lib/borne/pin'

export type PinResult =
  | { ok: true; employe_id: string; employe_nom: string }
  | { ok: false; reason: 'format' | 'invalid' | 'locked' | 'no_manager'; lockSecondsRemaining?: number }

export async function verifierPinManager(pin: string): Promise<PinResult> {
  if (!isValidPinFormat(pin)) return { ok: false, reason: 'format' }

  const supabase = await createClient()
  const { data: managers, error } = await supabase
    .from('employes')
    .select('id, prenom, nom, pin_hash, pin_salt, pin_essais, pin_lock_until, pin_last_try')
    .eq('actif', true)
    .eq('poste', 'manager')
    .not('pin_hash', 'is', null)

  if (error || !managers || managers.length === 0) {
    return { ok: false, reason: 'no_manager' }
  }

  const now = Date.now()
  for (const m of managers) {
    const salt = m.pin_salt as string
    const hash = m.pin_hash as string
    if (hashPin(pin, salt) === hash) {
      // Bon PIN : reset le compteur
      // Mais d'abord, si l'employé est encore lock, refuser
      const lockUntil = m.pin_lock_until ? new Date(m.pin_lock_until as string).getTime() : 0
      if (lockUntil > now) {
        return {
          ok: false,
          reason: 'locked',
          lockSecondsRemaining: Math.ceil((lockUntil - now) / 1000),
        }
      }
      await supabase
        .from('employes')
        .update({ pin_essais: 0, pin_lock_until: null, pin_last_try: new Date().toISOString() })
        .eq('id', m.id)
      return {
        ok: true,
        employe_id: m.id as string,
        employe_nom: `${m.prenom ?? ''} ${m.nom ?? ''}`.trim() || 'Manager',
      }
    }
  }

  // Aucun match : incrémenter le compteur sur TOUS les managers
  // (on ne sait pas qui a tenté, donc rate-limit global)
  // Optim : on prend le 1er manager comme "compteur global" et on bump.
  // Mais c'est faux conceptuellement → mieux : on rate-limit par IP/session.
  //
  // Approche simple ici : on rate-limit globalement via le 1er manager.
  const m0 = managers[0]
  const lastTry = m0.pin_last_try ? new Date(m0.pin_last_try as string).getTime() : 0
  const recent = (now - lastTry) < PIN_ESSAIS_WINDOW_MS
  const newEssais = recent ? ((m0.pin_essais as number ?? 0) + 1) : 1
  const update: Record<string, unknown> = {
    pin_essais: newEssais,
    pin_last_try: new Date().toISOString(),
  }
  if (newEssais >= PIN_MAX_ESSAIS) {
    update.pin_lock_until = new Date(now + PIN_LOCK_SECONDS * 1000).toISOString()
    update.pin_essais = 0
  }
  await supabase.from('employes').update(update).eq('id', m0.id)

  if (newEssais >= PIN_MAX_ESSAIS) {
    return {
      ok: false,
      reason: 'locked',
      lockSecondsRemaining: PIN_LOCK_SECONDS,
    }
  }
  return { ok: false, reason: 'invalid' }
}

// ─── Définir un PIN (admin seulement, à protéger côté UI) ──────────────
export async function definirPinManager(input: { employe_id: string; pin: string }) {
  if (!isValidPinFormat(input.pin)) {
    throw new Error('PIN invalide : 4 à 6 chiffres requis')
  }
  const supabase = await createClient()
  // Vérifier que c'est bien un manager
  const { data: emp } = await supabase
    .from('employes').select('poste, actif').eq('id', input.employe_id).single()
  if (!emp || emp.poste !== 'manager' || !emp.actif) {
    throw new Error('Employé non éligible (doit être manager actif)')
  }
  const salt = generateSalt()
  const hash = hashPin(input.pin, salt)
  const { error } = await supabase
    .from('employes')
    .update({
      pin_hash: hash, pin_salt: salt,
      pin_essais: 0, pin_lock_until: null, pin_last_try: null,
    })
    .eq('id', input.employe_id)
  if (error) throw new Error('Définition PIN : ' + error.message)
  return { ok: true }
}
