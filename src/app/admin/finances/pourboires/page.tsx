// /admin/finances/pourboires — répartition mensuelle des pourboires (manager).

import { createClient } from '@/lib/supabase/server'
import { requireManager } from '@/lib/auth'
import PourboiresClient from './PourboiresClient'
import { poolPourboiresMois } from '@/lib/pourboires'

export const metadata = { title: 'Pourboires — répartition' }
export const dynamic = 'force-dynamic'

export default async function PourboiresPage({ searchParams }: { searchParams: { mois?: string } }) {
  await requireManager()
  const moisIso = searchParams.mois ?? new Date().toISOString().slice(0, 7)
  const moisDate = `${moisIso}-01`

  const sb = await createClient()
  const [poolMois, distributionRes, lignesRes, employesRes, historyRes] = await Promise.all([
    poolPourboiresMois(moisIso),
    sb.from('pourboires_distribution').select('*').eq('mois', moisDate).maybeSingle(),
    sb.from('pourboires_distribution_lignes')
      .select('id, employe_id, heures_mois, part_pct, montant_eur, verse, employe:employes!employe_id(prenom, nom, poste)')
      .eq('distribution_id', '00000000-0000-0000-0000-000000000000'),  // placeholder, remplacé après
    sb.from('employes').select('id, prenom, nom, poste').eq('actif', true).order('prenom'),
    sb.from('pourboires_distribution').select('mois, pool_total_eur, cloture_at, methode')
      .order('mois', { ascending: false }).limit(12),
  ])
  // Re-fetch lignes if distribution exists
  let lignes: Array<{ id: string; employe_id: string | null; heures_mois: number; part_pct: number; montant_eur: number; verse: boolean; employe?: { prenom?: string; nom?: string; poste?: string } | null }> = []
  if (distributionRes.data?.id) {
    const r = await sb.from('pourboires_distribution_lignes')
      .select('id, employe_id, heures_mois, part_pct, montant_eur, verse, employe:employes!employe_id(prenom, nom, poste)')
      .eq('distribution_id', distributionRes.data.id)
    lignes = (r.data ?? []) as typeof lignes
  }

  return (
    <PourboiresClient
      moisIso={moisIso}
      poolMois={poolMois}
      distribution={distributionRes.data ?? null}
      lignes={lignes}
      employes={(employesRes.data ?? []) as Array<{ id: string; prenom: string; nom: string; poste: string }>}
      history={(historyRes.data ?? []) as Array<{ mois: string; pool_total_eur: number; cloture_at: string | null; methode: string }>}
    />
  )
}
