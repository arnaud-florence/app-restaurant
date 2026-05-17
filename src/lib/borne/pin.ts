/**
 * Helpers PIN manager : hash, vérification, rate-limit.
 * Stocké en SHA-256 + salt aléatoire par employé.
 * 4-6 digits suffit pour un usage en magasin (lock 60s après 3 essais).
 */

import { createHash, randomBytes } from 'node:crypto'

export function hashPin(pin: string, salt: string): string {
  return createHash('sha256').update(pin + ':' + salt).digest('hex')
}

export function generateSalt(): string {
  return randomBytes(16).toString('hex')
}

export const PIN_MIN_LENGTH = 4
export const PIN_MAX_LENGTH = 6
export const PIN_MAX_ESSAIS = 3
export const PIN_LOCK_SECONDS = 60
export const PIN_ESSAIS_WINDOW_MS = 60_000

export function isValidPinFormat(pin: string): boolean {
  return /^\d{4,6}$/.test(pin)
}
