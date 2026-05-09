// Evaluation des challenges pour un employé donné — calcule la valeur live,
// l'avancement % vers la cible, et la prime estimée pour la période courante.

import { createClient } from '@/lib/supabase/server'
import {
  calculerMetrique, cibleAtteinte, periodeMoisCourant,
  type Metrique, type Periode,
} from '@/lib/challenges-metrics'

export type ChallengeRow = {
  id: string
  titre: string
  description: string | null
  type: 'individuel' | 'equipe' | 'restaurant'
  poste_concerne: string | null
  metrique: Metrique
  cible_operateur: '>=' | '<=' | '='
  cible_valeur: number
  cible_unite: string
  recompense_type: 'fixe' | 'pct_surplus'
  recompense_montant: number
  periode: 'jour' | 'semaine' | 'mois'
  date_debut: string
  date_fin: string | null
  leaderboard_public: boolean
  actif: boolean
}

export type EvaluationChallenge = {
  challenge: ChallengeRow
  valeur_atteinte: number
  cible_atteinte: boolean
  progression_pct: number          // 0-100, capé à 100
  prime_estimee_eur: number
  applicable: boolean              // s'applique à cet employé ?
}

/** Renvoie la liste des challenges actifs qui s'appliquent à un employé donné. */
export function challengesPourEmploye(challenges: ChallengeRow[], poste: string | null): ChallengeRow[] {
  return challenges.filter(c => {
    if (!c.actif) return false
    if (c.type === 'restaurant') return true                          // tout le monde
    if (c.type === 'equipe' && c.poste_concerne) {
      return matchPoste(poste, c.poste_concerne)
    }
    if (c.type === 'equipe' && !c.poste_concerne) return true        // équipe = tous postes
    if (c.type === 'individuel') {
      if (!c.poste_concerne) return true
      return matchPoste(poste, c.poste_concerne)
    }
    return false
  })
}

/** Match alias entre poste employé et poste cible challenge. */
function matchPoste(empPoste: string | null, target: string): boolean {
  if (!empPoste) return false
  const aliases: Record<string, string[]> = {
    cuisine:   ['cuisine', 'cuisinier'],
    cuisinier: ['cuisine', 'cuisinier'],
    bar:       ['bar', 'barman'],
    barman:    ['bar', 'barman'],
    salle:     ['salle', 'serveur'],
    serveur:   ['salle', 'serveur'],
    plonge:    ['plonge', 'extra'],
    extra:     ['plonge', 'extra'],
    manager:   ['manager', 'gerant'],
    gerant:    ['manager', 'gerant'],
  }
  const list = aliases[empPoste] ?? [empPoste]
  return list.includes(target)
}

/** Calcule la valeur live + progression + prime estimée pour un challenge × employé. */
export async function evaluerChallenge(
  challenge: ChallengeRow,
  employe_id: string,
  periode: Periode = periodeMoisCourant(),
): Promise<EvaluationChallenge> {
  // Pour les challenges 'restaurant' on ne passe pas employe_id (métrique globale).
  const valeur = await calculerMetrique(
    challenge.metrique,
    periode,
    challenge.type === 'individuel' ? employe_id : undefined,
  )
  const atteint = cibleAtteinte(challenge.cible_operateur, valeur, Number(challenge.cible_valeur))

  // Progression % : si >= cible alors 100, sinon ratio (capé à 100).
  let progPct: number
  const cible = Number(challenge.cible_valeur)
  if (challenge.cible_operateur === '>=') {
    progPct = cible > 0 ? Math.min(100, Math.round((valeur / cible) * 100)) : (atteint ? 100 : 0)
  } else if (challenge.cible_operateur === '<=') {
    // Plus bas = mieux. Si valeur ≤ cible → 100%. Sinon décroît.
    progPct = atteint ? 100 : Math.max(0, Math.round((cible / Math.max(0.01, valeur)) * 100))
  } else {
    progPct = atteint ? 100 : 0
  }

  // Prime estimée
  let primeEstimee = 0
  if (atteint) {
    if (challenge.recompense_type === 'fixe') {
      primeEstimee = Number(challenge.recompense_montant)
    } else if (challenge.recompense_type === 'pct_surplus' && challenge.metrique === 'ca_surplus_point_mort') {
      // On distribue % du surplus pondéré heures de l'employé.
      // Pour cette estimation simple : renvoyer le montant total ; la pondération
      // par employé sera faite en aval (calcEstimationPrimeSurplus).
      primeEstimee = (valeur * Number(challenge.recompense_montant)) / 100
    } else {
      primeEstimee = Number(challenge.recompense_montant)
    }
  }

  return {
    challenge,
    valeur_atteinte: valeur,
    cible_atteinte: atteint,
    progression_pct: progPct,
    prime_estimee_eur: primeEstimee,
    applicable: true,
  }
}

/** Évalue tous les challenges qui s'appliquent à un employé. */
export async function evaluerChallengesEmploye(
  employe_id: string,
  poste: string | null,
  periode: Periode = periodeMoisCourant(),
): Promise<EvaluationChallenge[]> {
  const sb = await createClient()
  const { data } = await sb.from('challenges').select('*').eq('actif', true)
  const all = (data ?? []) as ChallengeRow[]
  const mine = challengesPourEmploye(all, poste)
  return Promise.all(mine.map(c => evaluerChallenge(c, employe_id, periode)))
}

/** Calcule la part de surplus revenant à un employé donné, pondérée par ses heures. */
export async function partSurplusPondereeHeures(
  employe_id: string,
  periode: Periode = periodeMoisCourant(),
): Promise<{ surplus: number; pct_redistribution: number; pool_equipe: number; mes_heures: number; total_heures: number; ma_part: number }> {
  const sb = await createClient()

  // 1. Surplus = max(0, CA mois - point_mort.ca_seuil)
  const surplus = await calculerMetrique('ca_surplus_point_mort', periode)

  // 2. % redistribution
  const { data: cfg } = await sb.from('config_economique').select('pct_redistribution_surplus').limit(1).maybeSingle()
  const pct = Number(cfg?.pct_redistribution_surplus ?? 30)
  const pool = surplus * pct / 100

  // 3. Heures travaillées de l'employé sur la période + total équipe
  const [meRes, allRes] = await Promise.all([
    sb.from('pointage')
      .select('heures_travaillees')
      .eq('employe_id', employe_id)
      .gte('date_pointage', periode.debut).lte('date_pointage', periode.fin),
    sb.from('pointage')
      .select('heures_travaillees')
      .gte('date_pointage', periode.debut).lte('date_pointage', periode.fin),
  ])
  const mes_heures   = (meRes.data  ?? []).reduce((s, r) => s + Number(r.heures_travaillees ?? 0), 0)
  const total_heures = (allRes.data ?? []).reduce((s, r) => s + Number(r.heures_travaillees ?? 0), 0)
  const ma_part      = total_heures > 0 ? (pool * mes_heures) / total_heures : 0

  return {
    surplus,
    pct_redistribution: pct,
    pool_equipe: pool,
    mes_heures,
    total_heures,
    ma_part,
  }
}
