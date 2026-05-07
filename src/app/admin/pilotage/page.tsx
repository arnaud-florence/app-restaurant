// Module 25 — Page Pilotage stratégique.

import { createClient } from '@/lib/supabase/server'
import PilotageClient from './PilotageClient'
import { calculerKPIs, calculerSaisonnier, periodeMoisCourant } from '@/lib/pilotage'

export const metadata = { title: 'Pilotage stratégique — Admin' }
export const dynamic = 'force-dynamic'

export default async function PilotagePage() {
  const supabase = await createClient()
  const periode = periodeMoisCourant()

  const [kpis, saisonnier, objectifsRes, actionsRes, employesRes] = await Promise.all([
    calculerKPIs(supabase),
    calculerSaisonnier(supabase),
    supabase.from('objectifs').select('*').order('annee', { ascending: false }).order('mois', { ascending: false, nullsFirst: false }),
    supabase.from('actions_strategiques').select('*, responsable:employes!responsable_id(prenom, nom)')
      .order('priorite', { ascending: true }).order('echeance', { ascending: true, nullsFirst: false }),
    supabase.from('employes').select('id, prenom, nom').eq('actif', true).order('prenom'),
  ])

  return (
    <PilotageClient
      kpis={kpis}
      saisonnier={saisonnier}
      objectifs={objectifsRes.data ?? []}
      actions={(actionsRes.data ?? []) as unknown as ActionRow[]}
      employes={employesRes.data ?? []}
      periode={periode}
    />
  )
}

type ActionRow = {
  id: string; titre: string; description: string | null; kpi_lie: string | null
  statut: 'a_faire' | 'en_cours' | 'fait' | 'annule'
  priorite: 'haute' | 'normale' | 'basse'
  echeance: string | null; responsable_id: string | null; fait_le: string | null
  created_at: string
  responsable?: { prenom?: string; nom?: string } | null
}
