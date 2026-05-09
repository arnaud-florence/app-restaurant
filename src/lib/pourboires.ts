// Helpers serveur pour calcul/distribution des pourboires.
// Server-only — types/constantes runtime dans lib/pourboires-types.ts.

import { createClient } from '@/lib/supabase/server'
import type { Methode } from '@/lib/pourboires-types'

export type { Methode }
export { METHODE_LABEL } from '@/lib/pourboires-types'

export type LigneCalcul = {
  employe_id: string
  prenom: string
  nom: string
  poste: string
  heures_mois: number
  part_pct: number
  montant_eur: number
}

/** Calcule le pool total (somme commandes.pourboire_total + paiements_caisse.pourboire) du mois. */
export async function poolPourboiresMois(moisIso: string): Promise<number> {
  const sb = await createClient()
  const debut = `${moisIso}-01T00:00:00`
  const finDate = new Date(moisIso + '-01')
  finDate.setMonth(finDate.getMonth() + 1)
  const fin = finDate.toISOString().slice(0, 10) + 'T00:00:00'

  // On agrège depuis paiements_caisse (plus fiable, payment-level)
  const { data } = await sb.from('paiements_caisse')
    .select('pourboire')
    .gte('encaisse_at', debut).lt('encaisse_at', fin)
  return Math.round(((data ?? []).reduce((s, p) => s + Number(p.pourboire ?? 0), 0)) * 100) / 100
}

/** Pour chaque employé actif, calcule sa part selon la méthode. */
export async function calculerLignes(
  moisIso: string,
  methode: Methode,
  pool: number,
  manuelLignes?: Array<{ employe_id: string; montant_eur: number }>,
): Promise<LigneCalcul[]> {
  const sb = await createClient()
  const debut = `${moisIso}-01`
  const finDate = new Date(moisIso + '-01')
  finDate.setMonth(finDate.getMonth() + 1)
  const fin = finDate.toISOString().slice(0, 10)

  const [empsRes, ptgRes] = await Promise.all([
    sb.from('employes').select('id, prenom, nom, poste').eq('actif', true).order('prenom'),
    sb.from('pointage')
      .select('employe_id, heures_travaillees')
      .gte('date_pointage', debut).lt('date_pointage', fin),
  ])
  const emps = (empsRes.data ?? []) as Array<{ id: string; prenom: string; nom: string; poste: string }>
  const heuresByEmp = new Map<string, number>()
  for (const p of (ptgRes.data ?? [])) {
    const k = p.employe_id as string
    heuresByEmp.set(k, (heuresByEmp.get(k) ?? 0) + Number(p.heures_travaillees ?? 0))
  }

  if (methode === 'manuel') {
    const map = new Map(manuelLignes?.map(m => [m.employe_id, m.montant_eur]) ?? [])
    return emps.map(e => {
      const m = Number(map.get(e.id) ?? 0)
      return {
        employe_id: e.id, prenom: e.prenom, nom: e.nom, poste: e.poste,
        heures_mois: round(heuresByEmp.get(e.id) ?? 0),
        part_pct: pool > 0 ? round((m / pool) * 100) : 0,
        montant_eur: round(m),
      }
    })
  }

  if (methode === 'parts_egales') {
    const N = emps.length
    const part = N > 0 ? pool / N : 0
    return emps.map(e => ({
      employe_id: e.id, prenom: e.prenom, nom: e.nom, poste: e.poste,
      heures_mois: round(heuresByEmp.get(e.id) ?? 0),
      part_pct: N > 0 ? round(100 / N) : 0,
      montant_eur: round(part),
    }))
  }

  // methode === 'heures'
  const totalHeures = Array.from(heuresByEmp.values()).reduce((s, h) => s + h, 0)
  return emps.map(e => {
    const heures = heuresByEmp.get(e.id) ?? 0
    const pct = totalHeures > 0 ? (heures / totalHeures) * 100 : 0
    const montant = totalHeures > 0 ? (pool * heures) / totalHeures : 0
    return {
      employe_id: e.id, prenom: e.prenom, nom: e.nom, poste: e.poste,
      heures_mois: round(heures),
      part_pct: round(pct),
      montant_eur: round(montant),
    }
  })
}

function round(n: number): number { return Math.round(n * 100) / 100 }
