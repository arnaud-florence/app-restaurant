// Helpers serveur pour calculer les métriques d'un challenge sur une période.
// Importé depuis Server Components / Server Actions UNIQUEMENT.
//
// Chaque métrique = une fonction async qui retourne un nombre.
// Le contrat : (periode, employe_id?) → valeur dans l'unité du challenge.

import { createClient } from '@/lib/supabase/server'
import type { SupabaseClient } from '@supabase/supabase-js'

export type Metrique =
  | 'ca_personnel_serveur'
  | 'tables_servies_personnelles'
  | 'pourboires_personnels'
  | 'plats_prepares_equipe_cuisine'
  | 'plats_prepares_equipe_pizza'
  | 'boissons_servies_equipe'
  | 'reservations_recues'
  | 'no_shows_pct'
  | 'taches_obligatoires_pct'
  | 'nc_critiques_count'
  | 'food_cost_pct'
  | 'ca_restaurant'
  | 'ca_surplus_point_mort'

export type Periode = { debut: string; fin: string }   // ISO YYYY-MM-DD

/** Renvoie debut = 1er jour du mois, fin = jour courant (ou dernier jour du mois). */
export function periodeMoisCourant(today = new Date()): Periode {
  const debut = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-01`
  const fin   = today.toISOString().slice(0, 10)
  return { debut, fin }
}

/** Renvoie les IDs de commandes créées dans la période. Cache simple via le sb client. */
async function commandesIdsPeriode(sb: Awaited<ReturnType<typeof createClient>>, debut: string, fin: string): Promise<string[]> {
  const { data } = await sb.from('commandes').select('id').gte('created_at', debut).lte('created_at', fin)
  return (data ?? []).map(d => d.id as string)
}

/** Calcule une métrique pour un employé donné (ou équipe entière si employe_id absent). */
export async function calculerMetrique(
  metrique: Metrique,
  periode: Periode,
  employe_id?: string,
): Promise<number> {
  const sb = await createClient()
  const debut = periode.debut + 'T00:00:00'
  const fin   = periode.fin   + 'T23:59:59'

  switch (metrique) {
    case 'ca_personnel_serveur': {
      if (!employe_id) return 0
      const { data } = await sb.from('commandes')
        .select('montant_total_ttc')
        .eq('serveur_id', employe_id)
        .gte('created_at', debut).lte('created_at', fin)
      return (data ?? []).reduce((s, r) => s + Number(r.montant_total_ttc ?? 0), 0)
    }

    case 'tables_servies_personnelles': {
      if (!employe_id) return 0
      const { count } = await sb.from('commandes')
        .select('id', { count: 'exact', head: true })
        .eq('serveur_id', employe_id)
        .gte('created_at', debut).lte('created_at', fin)
      return count ?? 0
    }

    case 'pourboires_personnels': {
      if (!employe_id) return 0
      const { data } = await sb.from('commandes')
        .select('pourboire_total')
        .eq('serveur_id', employe_id)
        .gte('created_at', debut).lte('created_at', fin)
      return (data ?? []).reduce((s, r) => s + Number(r.pourboire_total ?? 0), 0)
    }

    case 'plats_prepares_equipe_cuisine': {
      const ids = await commandesIdsPeriode(sb, debut, fin)
      if (ids.length === 0) return 0
      const { count } = await sb.from('commande_articles')
        .select('id', { count: 'exact', head: true })
        .in('commande_id', ids)
        .eq('tag_destination', 'CUISINE')
        .in('statut', ['pret', 'servi'])
      return count ?? 0
    }

    case 'plats_prepares_equipe_pizza': {
      const ids = await commandesIdsPeriode(sb, debut, fin)
      if (ids.length === 0) return 0
      const { count } = await sb.from('commande_articles')
        .select('id', { count: 'exact', head: true })
        .in('commande_id', ids)
        .eq('tag_destination', 'PIZZA')
        .in('statut', ['pret', 'servi'])
      return count ?? 0
    }

    case 'boissons_servies_equipe': {
      const ids = await commandesIdsPeriode(sb, debut, fin)
      if (ids.length === 0) return 0
      const { count } = await sb.from('commande_articles')
        .select('id', { count: 'exact', head: true })
        .in('commande_id', ids)
        .eq('tag_destination', 'BAR')
        .in('statut', ['pret', 'servi'])
      return count ?? 0
    }

    case 'reservations_recues': {
      const { count } = await sb.from('reservations_tables')
        .select('id', { count: 'exact', head: true })
        .gte('created_at', debut).lte('created_at', fin)
      return count ?? 0
    }

    case 'no_shows_pct': {
      const [{ data: total }, { data: noShows }] = await Promise.all([
        sb.from('reservations_tables').select('id', { count: 'exact', head: false })
          .gte('created_at', debut).lte('created_at', fin),
        sb.from('reservations_tables').select('id', { count: 'exact', head: false })
          .eq('statut', 'no_show')
          .gte('created_at', debut).lte('created_at', fin),
      ])
      const totalN = (total ?? []).length
      const nsN    = (noShows ?? []).length
      return totalN > 0 ? Math.round((nsN / totalN) * 10000) / 100 : 0
    }

    case 'taches_obligatoires_pct': {
      const filter = sb.from('taches_completees')
        .select('id', { count: 'exact', head: true })
        .eq('obligatoire', true)
        .gte('date', periode.debut).lte('date', periode.fin)
      const { count: faites } = employe_id ? await filter.eq('employe_id', employe_id) : await filter
      // Pour le total théorique, on multiplie le nb de jours × nb tâches obligatoires de la période.
      // Heuristique simple : pour MVP on retourne juste le NOMBRE de cochages obligatoires.
      // L'opérateur du challenge compare un nombre absolu (ex >= 30 cochages).
      return faites ?? 0
    }

    case 'nc_critiques_count': {
      const { count } = await sb.from('non_conformites')
        .select('id', { count: 'exact', head: true })
        .eq('gravite', 'critique')
        .gte('created_at', debut).lte('created_at', fin)
      return count ?? 0
    }

    case 'food_cost_pct': {
      // Food cost moyen = sum(qty × cout_matière_recette) / sum(qty × prix HT).
      try {
        const ids = await commandesIdsPeriode(sb, debut, fin)
        if (ids.length === 0) return 30
        const [artsRes, recIngRes] = await Promise.all([
          sb.from('commande_articles')
            .select('recette_id, quantite, prix_unitaire_ht')
            .in('commande_id', ids),
          sb.from('recette_ingredients')
            .select('recette_id, quantite, ingredient:ingredients(prix_achat_ht)'),
        ])
        // Coût matière par recette
        const coutParRecette = new Map<string, number>()
        for (const ri of (recIngRes.data ?? []) as Array<{ recette_id: string; quantite: number; ingredient?: { prix_achat_ht?: number } | null }>) {
          const cout = Number(ri.quantite ?? 0) * Number(ri.ingredient?.prix_achat_ht ?? 0)
          coutParRecette.set(ri.recette_id, (coutParRecette.get(ri.recette_id) ?? 0) + cout)
        }
        // Agrégat pondéré par ventes
        let caTotal = 0, foodCostTotal = 0
        for (const a of (artsRes.data ?? []) as Array<{ recette_id: string; quantite: number; prix_unitaire_ht: number }>) {
          const qty = Number(a.quantite ?? 0)
          caTotal       += qty * Number(a.prix_unitaire_ht ?? 0)
          foodCostTotal += qty * Number(coutParRecette.get(a.recette_id) ?? 0)
        }
        return caTotal > 0 ? Math.round((foodCostTotal / caTotal) * 10000) / 100 : 30
      } catch {
        return 30   // fallback safe
      }
    }

    case 'ca_restaurant': {
      const { data } = await sb.from('commandes')
        .select('montant_total_ttc')
        .gte('created_at', debut).lte('created_at', fin)
      return (data ?? []).reduce((s, r) => s + Number(r.montant_total_ttc ?? 0), 0)
    }

    case 'ca_surplus_point_mort': {
      // Surplus = max(0, CA_periode - CA_seuil_du_mois)
      const ca = await calculerMetrique('ca_restaurant', periode)
      const seuil = await getCaSeuilDuMois(sb, periode.debut)
      return Math.max(0, ca - seuil)
    }
  }
}

/** Récupère le CA seuil (point mort) du mois contenant la date donnée. */
async function getCaSeuilDuMois(sb: SupabaseClient, dateISO: string): Promise<number> {
  const moisStart = dateISO.slice(0, 7) + '-01'
  const { data } = await sb.from('point_mort_mensuel')
    .select('ca_seuil_calcule')
    .eq('mois', moisStart)
    .maybeSingle()
  return Number(data?.ca_seuil_calcule ?? 0)
}

/** Vérifie si une valeur atteint la cible. */
export function cibleAtteinte(operateur: '>=' | '<=' | '=', valeur: number, cible: number): boolean {
  switch (operateur) {
    case '>=':  return valeur >= cible
    case '<=':  return valeur <= cible
    case '=':   return Math.abs(valeur - cible) < 0.01
  }
}

/** Libellé humain d'une métrique. */
export const METRIQUE_LABEL: Record<Metrique, string> = {
  ca_personnel_serveur:           'CA personnel (serveur)',
  tables_servies_personnelles:    'Tables servies (perso)',
  pourboires_personnels:          'Pourboires perçus (perso)',
  plats_prepares_equipe_cuisine:  'Plats préparés cuisine (équipe)',
  plats_prepares_equipe_pizza:    'Pizzas préparées (équipe)',
  boissons_servies_equipe:        'Boissons servies (équipe)',
  reservations_recues:            'Réservations reçues',
  no_shows_pct:                   'Taux no-show (%)',
  taches_obligatoires_pct:        'Tâches obligatoires cochées',
  nc_critiques_count:             'NC critiques sur la période',
  food_cost_pct:                  'Food cost moyen (%)',
  ca_restaurant:                  'CA restaurant total',
  ca_surplus_point_mort:          'Surplus CA vs point mort',
}
