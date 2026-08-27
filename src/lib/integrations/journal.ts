// Journal des échanges caisse ↔ outil (migration 0137).
//
// Toute synchronisation passe par ici. Sans trace, un import qui échoue à 6 h
// du matin est invisible jusqu'à ce que quelqu'un s'étonne d'un chiffre trois
// semaines plus tard — et à ce moment-là, la donnée du jour manqué n'est plus
// récupérable nulle part.
//
// `payload` conserve le BRUT reçu ou envoyé : c'est ce qui permet de rejouer.
//
// Server-only (accès base).

import { createClient } from '@/lib/supabase/server'

export type SensIntegration = 'entrant' | 'sortant'
export type StatutIntegration = 'succes' | 'echec' | 'en_attente'

export type EvenementIntegration = {
  sens: SensIntegration
  /** sumup | zelty | site … */
  systeme: string
  /** tickets | catalogue | commande | disponibilite | z … */
  type: string
  reference?: string | null
  payload?: unknown
  resultat?: unknown
  statut?: StatutIntegration
  erreur?: string | null
  tentatives?: number
  duree_ms?: number | null
}

/**
 * Écrit une ligne de journal. Ne lève JAMAIS : journaliser est un service,
 * pas une dépendance. Si la trace échoue, la synchronisation doit continuer —
 * perdre l'import parce qu'on n'a pas pu écrire son journal serait absurde.
 */
export async function journaliser(ev: EvenementIntegration): Promise<void> {
  try {
    const sb = await createClient()
    await sb.from('integration_evenements').insert({
      sens: ev.sens,
      systeme: ev.systeme,
      type: ev.type,
      reference: ev.reference ?? null,
      payload: ev.payload ?? null,
      resultat: ev.resultat ?? null,
      statut: ev.statut ?? 'succes',
      erreur: ev.erreur ?? null,
      tentatives: ev.tentatives ?? 1,
      duree_ms: ev.duree_ms ?? null,
      traite_at: new Date().toISOString(),
    })
  } catch (e) {
    // Dernier recours : les logs de la plateforme.
    console.error('[journal intégration] écriture impossible', e)
  }
}

/**
 * Enveloppe une synchronisation : mesure sa durée, journalise le résultat ou
 * l'erreur, et relaie ce que la fonction renvoie.
 */
export async function avecJournal<T>(
  ev: Omit<EvenementIntegration, 'statut' | 'resultat' | 'erreur' | 'duree_ms'>,
  travail: () => Promise<T>,
): Promise<T> {
  const t0 = Date.now()
  try {
    const res = await travail()
    await journaliser({ ...ev, statut: 'succes', resultat: res, duree_ms: Date.now() - t0 })
    return res
  } catch (e) {
    await journaliser({
      ...ev,
      statut: 'echec',
      erreur: e instanceof Error ? e.message : String(e),
      duree_ms: Date.now() - t0,
    })
    throw e
  }
}
