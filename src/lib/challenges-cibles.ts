// Suggestion automatique de cibles pour la création d'un challenge,
// à partir des données économiques saisies + historique 30 derniers jours.
//
// Server-only.

import { createClient } from '@/lib/supabase/server'
import { calculerMetrique, periodeMoisCourant, type Metrique } from '@/lib/challenges-metrics'
import { suggererPointMort } from '@/lib/economie-helpers'

export type CibleSuggeree = {
  valeur: number
  unite: string
  source: string                                                 // explication courte
}

export async function suggererCible(metrique: Metrique): Promise<CibleSuggeree> {
  const sb = await createClient()
  const periode = periodeMoisCourant()

  // Période 30 derniers jours pour les moyennes.
  const debut30 = new Date(); debut30.setDate(debut30.getDate() - 30)
  const periode30 = { debut: debut30.toISOString().slice(0, 10), fin: periode.fin }

  switch (metrique) {
    case 'ca_personnel_serveur': {
      const sugg = await suggererPointMort()
      const { count: nbServeurs } = await sb.from('employes')
        .select('id', { count: 'exact', head: true })
        .in('poste', ['serveur', 'salle']).eq('actif', true)
      const N = Math.max(1, nbServeurs ?? 1)
      const cible = (sugg.ca_seuil_calcule / N) / 1.2     // marge sécurité 20%
      return {
        valeur: Math.round(cible),
        unite:  '€',
        source: `${sugg.ca_seuil_calcule.toFixed(0)} € seuil / ${N} serveur(s) / 1.2 marge`,
      }
    }
    case 'tables_servies_personnelles': {
      // Moyenne historique tables/serveur sur 30j
      const { data: cmds } = await sb.from('commandes')
        .select('serveur_id, created_at')
        .not('serveur_id', 'is', null)
        .gte('created_at', periode30.debut + 'T00:00:00')
      const total = (cmds ?? []).length
      const { count: nbServeurs } = await sb.from('employes')
        .select('id', { count: 'exact', head: true }).in('poste', ['serveur', 'salle']).eq('actif', true)
      const moy = (nbServeurs ?? 1) > 0 ? total / (nbServeurs ?? 1) : 25
      return { valeur: Math.round(moy * 1.1), unite: 'tables', source: `moyenne historique × 1.1 (${moy.toFixed(0)} → +10%)` }
    }
    case 'pourboires_personnels': {
      // 8% du CA personnel suggéré
      const ca = await suggererCible('ca_personnel_serveur')
      return { valeur: Math.round(ca.valeur * 0.08), unite: '€', source: '8% du CA personnel suggéré' }
    }
    case 'plats_prepares_equipe_cuisine':
    case 'plats_prepares_equipe_pizza':
    case 'boissons_servies_equipe':
    case 'reservations_recues': {
      const v30 = await calculerMetrique(metrique, periode30)
      return { valeur: Math.round(v30 * 1.1), unite:
        metrique === 'plats_prepares_equipe_pizza' ? 'pizzas'
        : metrique === 'boissons_servies_equipe'   ? 'boissons'
        : metrique === 'reservations_recues'       ? 'résas'
        : 'plats',
        source: `moyenne 30 derniers jours × 1.1 (${v30.toFixed(0)})` }
    }
    case 'no_shows_pct':
      return { valeur: 5, unite: '%', source: 'standard secteur (≤ 5% no-show)' }
    case 'taches_obligatoires_pct': {
      // Cible = 30 cochages obligatoires / mois (plancher solide)
      return { valeur: 30, unite: 'tâches', source: '~1 cochage oblig / jour, sur 30 jours' }
    }
    case 'nc_critiques_count':
      return { valeur: 0, unite: 'NC', source: 'cible idéale : zéro NC critique' }
    case 'food_cost_pct': {
      const v = await calculerMetrique('food_cost_pct', periode30)
      const cible = Math.max(20, Math.round(v * 0.95))
      return { valeur: cible, unite: '%', source: `food cost moyen 30j × 0.95 (${v.toFixed(1)} → -5%)` }
    }
    case 'ca_restaurant': {
      const sugg = await suggererPointMort()
      return { valeur: Math.round(sugg.ca_seuil_calcule * 1.1), unite: '€', source: `point mort × 1.1 (${sugg.ca_seuil_calcule.toFixed(0)} → +10%)` }
    }
    case 'ca_surplus_point_mort':
      return { valeur: 0, unite: '€', source: 'cible : atteindre le point mort (surplus ≥ 0 €)' }
  }
}
