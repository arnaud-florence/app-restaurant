// /admin/economie — Centre économique : config + charges fixes + charges variables
// + contrats équipe + point mort. Manager only.

import { createClient } from '@/lib/supabase/server'
import { requireManager } from '@/lib/auth'
import EconomieClient from './EconomieClient'
import {
  totalChargesFixesMensuelles, suggererPointMort,
  listerChargesVariables, calculerTauxVariableEffectif,
  coutMasseSalarialePrev, calculerTauxVariableMoyen,
  type ChargeRow,
} from '@/lib/economie-helpers'
import { calculerMetrique, periodeMoisCourant } from '@/lib/challenges-metrics'

export const metadata = { title: 'Centre économique — Admin' }
export const dynamic = 'force-dynamic'

export default async function EconomiePage() {
  await requireManager()
  const supabase = await createClient()
  const periode = periodeMoisCourant()

  const [
    configRes, pmRes, chargesInfo, suggestion,
    chargesVar, tauxEffectif, salariale, caRest, tauxAuto,
  ] = await Promise.all([
    supabase.from('config_economique').select('*').limit(1).maybeSingle(),
    supabase.from('point_mort_mensuel').select('*').order('mois', { ascending: false }).limit(24),
    totalChargesFixesMensuelles(),
    suggererPointMort(),
    listerChargesVariables(),
    calculerTauxVariableEffectif(30),
    coutMasseSalarialePrev(),
    calculerMetrique('ca_restaurant', periode),
    calculerTauxVariableMoyen(30),
  ])

  type Config  = { id: string; smic_horaire_brut: number; pct_redistribution_surplus: number; notes: string | null; updated_at: string }
  type PMMois  = { id: string; mois: string; charges_fixes_eur: number; taux_charges_variables_pct: number; ca_seuil_calcule: number; notes: string | null }

  const config     = (configRes.data ?? null) as Config | null
  const pointsMort = (pmRes.data ?? []) as PMMois[]

  // Vue d'ensemble live
  const ca_mois = caRest
  const seuilMois = pointsMort.find(p => p.mois.slice(0, 7) === periode.debut.slice(0, 7))?.ca_seuil_calcule
    ?? suggestion.ca_seuil_calcule
  const overview = {
    ca_mois,
    seuil: Number(seuilMois),
    pct_atteint: Number(seuilMois) > 0 ? Math.min(200, Math.round((ca_mois / Number(seuilMois)) * 100)) : 0,
    charges_fixes: chargesInfo.total,
    cout_employeur_total: salariale.total_eur,
    food_cost_pct: tauxAuto.food_cost_pct,
    commissions_pct: tauxAuto.commissions_pct,
    autres_var_pct: tauxEffectif.taux_total_pct - tauxAuto.food_cost_pct - tauxAuto.commissions_pct,
    taux_variable_total: tauxEffectif.taux_total_pct,
    marge_brute_estimee_pct: 100 - tauxEffectif.taux_total_pct,
  }

  return (
    <EconomieClient
      config={config}
      pointsMort={pointsMort}
      charges={chargesInfo.charges as ChargeRow[]}
      chargesTotal={chargesInfo.total}
      chargesParCategorie={chargesInfo.par_categorie}
      chargesVariables={chargesVar}
      tauxVariableEffectif={tauxEffectif.taux_total_pct}
      salariale={salariale}
      overview={overview}
      suggestion={suggestion}
    />
  )
}
