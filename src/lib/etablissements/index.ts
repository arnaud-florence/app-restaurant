// Couche multi-établissement / multi-activité — HELPERS.
//
// ⚠️ PRÉPARÉ — NON CÂBLÉ. Aucune page n'importe encore ce module. Il fournit la
// logique d'agrégation flexible (consolidé / par activité + exclusion hors-CA)
// que le dashboard utilisera une fois la config activée.
//
// Activation : exécuter 0090 (config) puis brancher `getEtablissements()` +
// `agregerCA()` dans le centre opérationnel / le pilotage.

import { createClient } from '@/lib/supabase/server'
import type {
  Etablissement, VenteParEtablissement, AgregatCA, ModeDashboard,
} from './types'

const COLS =
  'id, nom, slug, type, categorie, inclus_ca_principal, couleur, ordre, mode_fiscal, actif, is_principal'

/**
 * Liste les établissements/activités. Nécessite la migration 0090 (colonnes de config).
 * Trié par `ordre` puis principal en tête.
 */
export async function getEtablissements(opts: { actifsOnly?: boolean } = {}): Promise<Etablissement[]> {
  const sb = await createClient()
  let q = sb.from('etablissements').select(COLS)
    .order('ordre', { ascending: true })
    .order('is_principal', { ascending: false })
  if (opts.actifsOnly) q = q.eq('actif', true)
  const { data } = await q
  return (data ?? []) as Etablissement[]
}

/** L'établissement principal (le restaurant), ou null. */
export function etablissementPrincipal(etabs: Etablissement[]): Etablissement | null {
  return etabs.find(e => e.is_principal) ?? etabs[0] ?? null
}

/**
 * Agrégation flexible du CA :
 *  - sépare le CA principal (activités incluses) du CA « hors principal »
 *    (activités flag `inclus_ca_principal = false` → encaissements pour compte de tiers) ;
 *  - renvoie aussi le détail par établissement.
 * Le même calcul sert au mode consolidé ET au mode par-activité (on lit le détail).
 */
export function agregerCA(
  ventes: VenteParEtablissement[],
  etabs: Etablissement[],
): AgregatCA {
  const cumul = new Map<string, { ca: number; n: number }>()
  for (const v of ventes) {
    const cur = cumul.get(v.etablissement_id) ?? { ca: 0, n: 0 }
    cur.ca += Number(v.ca_ttc ?? 0)
    cur.n += Number(v.nb_tickets ?? 0)
    cumul.set(v.etablissement_id, cur)
  }

  let caPrincipal = 0
  let caHorsPrincipal = 0
  const parEtablissement = etabs.map(e => {
    const agg = cumul.get(e.id) ?? { ca: 0, n: 0 }
    if (e.inclus_ca_principal) caPrincipal += agg.ca
    else caHorsPrincipal += agg.ca
    return { etablissement: e, ca_ttc: agg.ca, nb_tickets: agg.n, inclus: e.inclus_ca_principal }
  })

  return {
    caPrincipal: Math.round(caPrincipal * 100) / 100,
    caHorsPrincipal: Math.round(caHorsPrincipal * 100) / 100,
    parEtablissement,
  }
}

/**
 * Filtre des ventes selon le mode dashboard :
 *  - 'consolide'    → toutes les ventes (tout ensemble) ;
 *  - 'par_activite' → uniquement l'établissement sélectionné.
 */
export function filtrerVentes(
  ventes: VenteParEtablissement[],
  opts: { mode: ModeDashboard; etablissementId?: string | null },
): VenteParEtablissement[] {
  if (opts.mode === 'par_activite' && opts.etablissementId) {
    return ventes.filter(v => v.etablissement_id === opts.etablissementId)
  }
  return ventes
}
