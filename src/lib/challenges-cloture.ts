// Calcul agrégé performance d'un mois + workflow de clôture.
// Server-only.

import { createClient } from '@/lib/supabase/server'
import {
  calculerMetrique, cibleAtteinte, periodeMoisCourant,
  type Metrique, type Periode,
} from '@/lib/challenges-metrics'
import type { ChallengeRow } from '@/lib/challenges-evaluation'
import { challengesPourEmploye, evaluerChallenge } from '@/lib/challenges-evaluation'

export type EmployeRow = {
  id: string
  prenom: string
  nom: string
  poste: string
}

export type EmployePerformance = {
  employe: EmployeRow
  heures: number
  primes_fixes: number                 // somme des primes fixes atteintes
  bonus_surplus: number                // part pondérée heures du pool surplus
  total: number                        // primes_fixes + bonus_surplus
  challenges_atteints: Array<{
    challenge_id: string
    titre: string
    prime: number
  }>
}

export type PerformanceMensuelle = {
  periode: Periode
  ca: number
  seuil: number
  surplus: number
  pct_redistribution: number
  pool_equipe: number
  total_heures: number
  cloture_le: string | null            // ISO si déjà clôturé sur cette période
  employes: EmployePerformance[]
}

export async function calculerPerformanceMensuelle(periode: Periode = periodeMoisCourant()): Promise<PerformanceMensuelle> {
  const sb = await createClient()

  // 1. Données globales
  const [caRes, pmRes, cfgRes, pointagesRes, employesRes, challengesRes, resultatsRes] = await Promise.all([
    calculerMetrique('ca_restaurant', periode).then(v => ({ ca: v })),
    sb.from('point_mort_mensuel').select('ca_seuil_calcule')
      .eq('mois', periode.debut.slice(0, 7) + '-01').maybeSingle(),
    sb.from('config_economique').select('pct_redistribution_surplus').limit(1).maybeSingle(),
    sb.from('pointage')
      .select('employe_id, heures_travaillees')
      .gte('date_pointage', periode.debut).lte('date_pointage', periode.fin),
    sb.from('employes').select('id, prenom, nom, poste').eq('actif', true).order('prenom'),
    sb.from('challenges').select('*').eq('actif', true),
    sb.from('challenges_resultats')
      .select('challenge_id, periode_debut, employe_id, valeur_atteinte, cible_atteinte, prime_calculee_eur')
      .eq('periode_debut', periode.debut),
  ])

  const ca       = caRes.ca
  const seuil    = Number(pmRes.data?.ca_seuil_calcule ?? 0)
  const surplus  = Math.max(0, ca - seuil)
  const pct      = Number(cfgRes.data?.pct_redistribution_surplus ?? 30)
  const pool     = surplus * pct / 100

  // Heures par employé
  const heuresParEmp = new Map<string, number>()
  for (const p of (pointagesRes.data ?? [])) {
    const k = p.employe_id as string
    heuresParEmp.set(k, (heuresParEmp.get(k) ?? 0) + Number(p.heures_travaillees ?? 0))
  }
  const total_heures = Array.from(heuresParEmp.values()).reduce((s, x) => s + x, 0)

  const challenges = (challengesRes.data ?? []) as ChallengeRow[]
  const employes   = (employesRes.data ?? []) as EmployeRow[]

  // Détecte si déjà clôturé (présence de résultats avec prime_versee = true ou idempotemment cloture_le)
  // Pour MVP : on regarde si AU MOINS un résultat existe pour cette période → considéré clôturé.
  const cloture_le = (resultatsRes.data ?? []).length > 0 ? periode.debut : null

  // 2. Pour chaque employé, évalue les challenges qui le concernent
  const employesPerf: EmployePerformance[] = await Promise.all(
    employes.map(async emp => {
      const heures = heuresParEmp.get(emp.id) ?? 0
      const mine   = challengesPourEmploye(challenges, emp.poste)
      const evals  = await Promise.all(mine.map(c => evaluerChallenge(c, emp.id, periode)))

      let primes_fixes = 0
      const challenges_atteints: EmployePerformance['challenges_atteints'] = []
      for (const e of evals) {
        if (!e.cible_atteinte) continue
        if (e.challenge.recompense_type === 'fixe') {
          primes_fixes += Number(e.prime_estimee_eur)
          challenges_atteints.push({
            challenge_id: e.challenge.id,
            titre:        e.challenge.titre,
            prime:        Number(e.prime_estimee_eur),
          })
        }
      }

      // Bonus surplus = part pondérée heures du pool
      const bonus_surplus = total_heures > 0 ? (pool * heures) / total_heures : 0
      // Si surplus, on ajoute une "ligne synthétique" dans challenges_atteints pour traçabilité
      if (bonus_surplus > 0.01) {
        challenges_atteints.push({
          challenge_id: '__surplus__',
          titre:        `Bonus surplus (${pct}% pondéré heures)`,
          prime:        bonus_surplus,
        })
      }

      return {
        employe:                emp,
        heures,
        primes_fixes,
        bonus_surplus,
        total:                  primes_fixes + bonus_surplus,
        challenges_atteints,
      }
    }),
  )

  return {
    periode,
    ca, seuil, surplus,
    pct_redistribution: pct,
    pool_equipe: pool,
    total_heures,
    cloture_le,
    employes: employesPerf,
  }
}

export type ResultatCloture = {
  ok: true
  nb_lignes_ecrites: number
  total_primes_eur: number
}

/**
 * Clôture un mois : persiste les résultats dans challenges_resultats.
 * Idempotent (UPSERT sur (challenge_id, employe_id, periode_debut)).
 *
 * Le bonus surplus n'est PAS persisté dans challenges_resultats (c'est une
 * mécanique config_economique, pas un challenge). Si l'utilisateur veut le
 * tracer, il doit créer un challenge type=restaurant metrique=ca_surplus_point_mort.
 */
export async function cloturerMoisPerf(periode: Periode): Promise<ResultatCloture> {
  const sb = await createClient()
  const { data: chs } = await sb.from('challenges').select('*').eq('actif', true)
  const challenges = (chs ?? []) as ChallengeRow[]

  const { data: emps } = await sb.from('employes').select('id, poste').eq('actif', true)
  const employes = (emps ?? []) as Array<{ id: string; poste: string }>

  let nb = 0
  let totalPrimes = 0

  for (const c of challenges) {
    if (c.type === 'restaurant') {
      // Une seule ligne sans employe_id
      const valeur = await calculerMetrique(c.metrique, periode)
      const atteint = cibleAtteinte(c.cible_operateur, valeur, Number(c.cible_valeur))
      let prime = 0
      if (atteint) {
        if (c.recompense_type === 'fixe') prime = Number(c.recompense_montant)
        else                              prime = (valeur * Number(c.recompense_montant)) / 100
      }
      const { error } = await sb.from('challenges_resultats').upsert({
        challenge_id:        c.id,
        employe_id:          null,
        periode_debut:       periode.debut,
        periode_fin:         periode.fin,
        valeur_atteinte:     valeur,
        cible_atteinte:      atteint,
        prime_calculee_eur:  prime,
        prime_versee:        false,
        updated_at:          new Date().toISOString(),
      }, { onConflict: 'challenge_id,employe_id,periode_debut' })
      if (!error) { nb++; totalPrimes += prime }
    } else {
      // Pour chaque employé concerné par le poste
      for (const emp of employes) {
        if (c.poste_concerne && !matchPoste(emp.poste, c.poste_concerne)) continue
        const valeur = await calculerMetrique(c.metrique, periode, c.type === 'individuel' ? emp.id : undefined)
        const atteint = cibleAtteinte(c.cible_operateur, valeur, Number(c.cible_valeur))
        const prime = atteint ? (c.recompense_type === 'fixe' ? Number(c.recompense_montant) : 0) : 0
        const { error } = await sb.from('challenges_resultats').upsert({
          challenge_id:        c.id,
          employe_id:          emp.id,
          periode_debut:       periode.debut,
          periode_fin:         periode.fin,
          valeur_atteinte:     valeur,
          cible_atteinte:      atteint,
          prime_calculee_eur:  prime,
          prime_versee:        false,
          updated_at:          new Date().toISOString(),
        }, { onConflict: 'challenge_id,employe_id,periode_debut' })
        if (!error) { nb++; totalPrimes += prime }
      }
    }
  }

  return { ok: true as const, nb_lignes_ecrites: nb, total_primes_eur: totalPrimes }
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
