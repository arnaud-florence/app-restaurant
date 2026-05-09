// Détection des transitions cible_atteinte: false → true → notif push immédiate.
// Idempotent : utilise challenges_resultats comme état persisté.

import { createClient } from '@/lib/supabase/server'
import { sendPushToEmploye } from '@/lib/push'
import { evaluerChallengesEmploye } from '@/lib/challenges-evaluation'
import { periodeMoisCourant } from '@/lib/challenges-metrics'

/**
 * Évalue les challenges actifs pour un employé.
 * Pour chaque challenge nouvellement atteint (transition non-atteint → atteint),
 * envoie une notif push + UPSERT le résultat.
 *
 * À hooker après chaque action ayant un impact métrique potentiel :
 *   - pointage sortie (heures travaillées)
 *   - encaissement de commande (CA serveur)
 *   - article servi (plats préparés équipe)
 *   - NC critique fermée (compteur NC)
 */
export async function detecterEtNotifier(employe_id: string, poste: string | null): Promise<{
  ok: true
  nouvelles: number
}> {
  const sb = await createClient()
  const periode = periodeMoisCourant()

  // 1. État courant : ce que voit l'employé live
  const evaluations = await evaluerChallengesEmploye(employe_id, poste, periode)

  // 2. État précédent : ce qui est dans challenges_resultats pour cette période
  const { data: precedents } = await sb.from('challenges_resultats')
    .select('challenge_id, cible_atteinte')
    .eq('employe_id', employe_id)
    .eq('periode_debut', periode.debut)
  const precMap = new Map<string, boolean>()
  for (const r of (precedents ?? [])) precMap.set(r.challenge_id as string, !!r.cible_atteinte)

  let nouvelles = 0

  // 3. Pour chaque évaluation, détecte transition + persiste + notifie
  for (const e of evaluations) {
    const c       = e.challenge
    const wasOk   = precMap.get(c.id) === true
    const nowOk   = e.cible_atteinte

    // Persiste l'état courant (idempotent)
    await sb.from('challenges_resultats').upsert({
      challenge_id:        c.id,
      employe_id:          c.type === 'restaurant' ? null : employe_id,
      periode_debut:       periode.debut,
      periode_fin:         periode.fin,
      valeur_atteinte:     e.valeur_atteinte,
      cible_atteinte:      nowOk,
      prime_calculee_eur:  nowOk && c.recompense_type === 'fixe' ? Number(c.recompense_montant) : 0,
      prime_versee:        false,
      updated_at:          new Date().toISOString(),
    }, { onConflict: 'challenge_id,employe_id,periode_debut' })

    // Notif si nouvelle atteinte (transition false → true)
    if (!wasOk && nowOk && c.recompense_type === 'fixe') {
      nouvelles++
      try {
        await sendPushToEmploye(employe_id, {
          title: `🏆 Challenge atteint ! +${Number(c.recompense_montant).toFixed(0)} €`,
          body:  `${c.titre} · cible ${c.cible_operateur} ${Number(c.cible_valeur).toFixed(0)} ${c.cible_unite} validée`,
          tag:   `challenge-${c.id}-${periode.debut}`,
          url:   '/mon-espace',
        })
      } catch { /* best-effort */ }
    }
  }

  return { ok: true as const, nouvelles }
}
