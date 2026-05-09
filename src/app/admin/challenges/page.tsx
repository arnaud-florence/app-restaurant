// /admin/challenges — CRUD challenges (manager).
// Affiche aussi la valeur live de chaque challenge sur la période courante
// pour que le manager voie où en est l'équipe.

import { createClient } from '@/lib/supabase/server'
import { requireManager } from '@/lib/auth'
import {
  calculerMetrique, periodeMoisCourant, cibleAtteinte,
  type Metrique, METRIQUE_LABEL,
} from '@/lib/challenges-metrics'
import { suggererCible, type CibleSuggeree } from '@/lib/challenges-cibles'
import ChallengesAdminClient from './ChallengesAdminClient'

export const metadata = { title: 'Challenges — Admin' }
export const dynamic = 'force-dynamic'

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

export type ChallengeAvecLive = ChallengeRow & {
  valeur_live: number       // pour challenges 'restaurant' uniquement (équipe globale)
  cible_atteinte: boolean
}

export default async function ChallengesAdminPage() {
  await requireManager()
  const supabase = await createClient()
  const periode  = periodeMoisCourant()

  const { data } = await supabase.from('challenges').select('*').order('created_at', { ascending: false })
  const challenges = (data ?? []) as ChallengeRow[]

  // Pour les challenges 'restaurant', on calcule la valeur live (pas par employé)
  const live: ChallengeAvecLive[] = await Promise.all(
    challenges.map(async c => {
      let valeur_live = 0
      let atteint = false
      if (c.type === 'restaurant') {
        valeur_live    = await calculerMetrique(c.metrique, periode)
        atteint        = cibleAtteinte(c.cible_operateur, valeur_live, Number(c.cible_valeur))
      }
      return { ...c, valeur_live, cible_atteinte: atteint }
    }),
  )

  // Suggestions de cibles pour chaque métrique (computed once)
  const METRIQUES: Metrique[] = [
    'ca_personnel_serveur','tables_servies_personnelles','pourboires_personnels',
    'plats_prepares_equipe_cuisine','plats_prepares_equipe_pizza','boissons_servies_equipe',
    'reservations_recues','no_shows_pct','taches_obligatoires_pct',
    'nc_critiques_count','food_cost_pct','ca_restaurant','ca_surplus_point_mort',
  ]
  const suggestions = Object.fromEntries(
    await Promise.all(METRIQUES.map(async m => [m, await suggererCible(m)])),
  ) as Record<Metrique, CibleSuggeree>

  return <ChallengesAdminClient challenges={live} periode={periode} suggestions={suggestions} />
}
