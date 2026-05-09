// Calcul des leaderboards pour les challenges marqués leaderboard_public.
// Server-only.

import { createClient } from '@/lib/supabase/server'
import {
  calculerMetrique, periodeMoisCourant,
  type Periode,
} from '@/lib/challenges-metrics'
import { challengesPourEmploye, type ChallengeRow } from '@/lib/challenges-evaluation'

export type LeaderboardEntry = {
  employe_id: string
  prenom: string
  nom: string
  poste: string
  valeur: number
  rang: number
}

export type ChallengeLeaderboard = {
  challenge: ChallengeRow
  entries: LeaderboardEntry[]
  total_participants: number
  mon_rang: number | null
  ma_valeur: number | null
}

/** Calcule un leaderboard ordonné selon l'opérateur de cible.
 *  >= : tri décroissant (plus haut = mieux)
 *  <= : tri croissant (plus bas = mieux)
 *  =  : tri par |val - cible| croissant
 */
function trierEntries(entries: Omit<LeaderboardEntry, 'rang'>[], op: '>=' | '<=' | '=', cible: number) {
  const sorted = [...entries]
  if (op === '>=') sorted.sort((a, b) => b.valeur - a.valeur)
  else if (op === '<=') sorted.sort((a, b) => a.valeur - b.valeur)
  else sorted.sort((a, b) => Math.abs(a.valeur - cible) - Math.abs(b.valeur - cible))
  return sorted.map((e, i) => ({ ...e, rang: i + 1 }))
}

/** Renvoie le classement complet pour un challenge donné. */
export async function leaderboardChallenge(
  challenge: ChallengeRow,
  periode: Periode = periodeMoisCourant(),
  meEmployeId?: string,
): Promise<ChallengeLeaderboard> {
  const sb = await createClient()

  // Liste les employés concernés
  const { data: emps } = await sb.from('employes')
    .select('id, prenom, nom, poste')
    .eq('actif', true)
    .order('prenom')
  const all = (emps ?? []) as Array<{ id: string; prenom: string; nom: string; poste: string }>

  // Filtre selon le poste du challenge
  const concernes = challenge.poste_concerne
    ? all.filter(e => matchPoste(e.poste, challenge.poste_concerne!))
    : all

  // Calcule la valeur de chaque employé
  const valeurs = await Promise.all(
    concernes.map(async e => {
      const v = await calculerMetrique(
        challenge.metrique,
        periode,
        challenge.type === 'individuel' ? e.id : undefined,
      )
      return { employe_id: e.id, prenom: e.prenom, nom: e.nom, poste: e.poste, valeur: v }
    }),
  )

  const sorted = trierEntries(valeurs, challenge.cible_operateur, Number(challenge.cible_valeur))

  const monEntry = meEmployeId ? sorted.find(e => e.employe_id === meEmployeId) ?? null : null

  return {
    challenge,
    entries: sorted,
    total_participants: sorted.length,
    mon_rang: monEntry?.rang ?? null,
    ma_valeur: monEntry?.valeur ?? null,
  }
}

/** Liste tous les leaderboards publics applicables à un employé. */
export async function leaderboardsPourEmploye(
  employe_id: string,
  poste: string | null,
  periode: Periode = periodeMoisCourant(),
): Promise<ChallengeLeaderboard[]> {
  const sb = await createClient()
  const { data } = await sb.from('challenges')
    .select('*')
    .eq('actif', true)
    .eq('leaderboard_public', true)
  const all = (data ?? []) as ChallengeRow[]
  const mine = challengesPourEmploye(all, poste)
  return Promise.all(mine.map(c => leaderboardChallenge(c, periode, employe_id)))
}

function matchPoste(empPoste: string | null, target: string): boolean {
  if (!empPoste) return false
  const aliases: Record<string, string[]> = {
    cuisine: ['cuisine','cuisinier'], cuisinier: ['cuisine','cuisinier'],
    bar: ['bar','barman'], barman: ['bar','barman'],
    salle: ['salle','serveur'], serveur: ['salle','serveur'],
    plonge: ['plonge','extra'], extra: ['plonge','extra'],
    manager: ['manager','gerant'], gerant: ['manager','gerant'],
  }
  const list = aliases[empPoste] ?? [empPoste]
  return list.includes(target)
}
