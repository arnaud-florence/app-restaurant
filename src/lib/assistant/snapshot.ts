// Module 24 — Snapshot KPIs : photo du restaurant à un instant T pour
// alimenter le prompt système de l'assistant IA. Cible ~3-5 KB sérialisé.

import type { SupabaseClient } from '@supabase/supabase-js'
import { startOfMonth, endOfMonth, format, subDays } from 'date-fns'

export type SnapshotKPI = {
  genere_le: string                   // ISO datetime
  periode: { mois: string; debut: string; fin: string }
  ca: {
    mois_courant: number              // somme paiements_caisse mois en cours
    nb_couverts_mois: number          // commandes encaisse_at mois
    panier_moyen: number              // ca / nb_couverts
    jours_actifs: number              // nb jours du mois où il y a eu CA
  }
  rh: {
    masse_salariale_mois: number      // estimation : sum(heures pointage) × salaire_horaire
    nb_employes_actifs: number
    ratio_masse_ca: number            // masse / CA, en pct
  }
  food_cost: {
    moyen_pct: number                 // moyenne pondérée food_cost_pct des recettes vendues
    nb_recettes_alerte: number        // recettes > 30 %
    nb_recettes_rouge: number         // recettes > 32 %
  }
  hygiene: {
    nc_ouvertes: number
    nc_critiques: number              // gravite = critique ET ouvertes
    nc_anciennes_jours: number        // âge max NC ouverte
    controles_temp_jour: number       // relevés du jour
  }
  stock: {
    lots_dlc_critique: number         // dlc < J+1
    lots_dlc_proche: number           // dlc J+1 → J+3
    valeur_stock: number              // somme valeur_stock ingrédients
  }
  legal: {
    obligations_expirees: number
    obligations_proches_30j: number
  }
  finances: {
    factures_a_payer: number
    montant_factures_a_payer: number
    charges_fixes_mois: number
  }
  reservations: {
    couverts_jour: number
    couverts_semaine: number
  }
}

export async function genererSnapshot(supabase: SupabaseClient): Promise<SnapshotKPI> {
  const now = new Date()
  const debut = format(startOfMonth(now), 'yyyy-MM-dd')
  const fin   = format(endOfMonth(now),   'yyyy-MM-dd')
  const dansN = (n: number) => format(new Date(Date.now() + n * 86400000), 'yyyy-MM-dd')
  const ilYa  = (n: number) => format(subDays(now, n), 'yyyy-MM-dd')
  const aujourdhui = format(now, 'yyyy-MM-dd')

  // Lancement parallèle pour minimiser la latence — toutes les requêtes lèvent silencieusement
  const [
    paiementsRes, commandesRes, employesRes, pointageRes,
    recettesRes, ncRes, controlesRes, lotsRes,
    obligationsRes, facturesRes, chargesRes, ingredientsRes,
    resaTablesRes, resaChambresRes,
  ] = await Promise.all([
    supabase.from('paiements_caisse').select('montant, encaisse_at')
      .gte('encaisse_at', debut + 'T00:00:00').lte('encaisse_at', fin + 'T23:59:59'),
    supabase.from('commandes').select('id, created_at, statut', { count: 'exact' })
      .eq('statut', 'encaisse').gte('created_at', debut).lte('created_at', fin + 'T23:59:59'),
    supabase.from('employes').select('id, salaire_horaire, actif').eq('actif', true),
    supabase.from('pointage').select('employe_id, debut, fin')
      .gte('debut', debut + 'T00:00:00').lte('debut', fin + 'T23:59:59').not('fin', 'is', null),
    supabase.from('recettes').select('id, prix_vente_ht, food_cost_pct').not('food_cost_pct', 'is', null),
    supabase.from('non_conformites').select('id, gravite, date_constat, statut').eq('statut', 'ouverte'),
    supabase.from('releves_temperatures').select('id', { count: 'exact', head: true })
      .gte('created_at', aujourdhui + 'T00:00:00').lte('created_at', aujourdhui + 'T23:59:59'),
    supabase.from('lots_produits').select('id, dlc, statut').eq('statut', 'en_stock').not('dlc', 'is', null),
    supabase.from('obligations_legales').select('id, date_echeance, statut').neq('statut', 'fait'),
    supabase.from('factures_fournisseurs').select('id, montant_ttc, statut').eq('statut', 'a_payer'),
    supabase.from('charges_fixes').select('montant_ttc, frequence, actif').eq('actif', true),
    supabase.from('ingredients').select('quantite_stock, prix_achat_ht'),
    supabase.from('reservations_tables').select('nb_couverts, date_resa').gte('date_resa', aujourdhui).lte('date_resa', dansN(7)),
    supabase.from('reservations_chambres').select('id').gte('arrivee', aujourdhui).lt('arrivee', dansN(7)),
  ])

  // ─── CA ─────────────────────────────────────────────────────────
  const paiements = paiementsRes.data ?? []
  const ca_mois = paiements.reduce((s, p) => s + Number(p.montant ?? 0), 0)
  const nb_couverts = commandesRes.count ?? 0
  const panier_moyen = nb_couverts > 0 ? ca_mois / nb_couverts : 0
  const jours_actifs = new Set(paiements.map(p => String(p.encaisse_at).slice(0, 10))).size

  // ─── RH ──────────────────────────────────────────────────────────
  const employes = employesRes.data ?? []
  const tauxParId = new Map(employes.map(e => [e.id as string, Number(e.salaire_horaire ?? 0)]))
  const pointages = pointageRes.data ?? []
  const masseSalariale = pointages.reduce((s, p) => {
    const h = (new Date(p.fin as string).getTime() - new Date(p.debut as string).getTime()) / 3_600_000
    const taux = tauxParId.get(p.employe_id as string) ?? 0
    return s + (h > 0 ? h * taux : 0)
  }, 0)
  const ratio_masse_ca = ca_mois > 0 ? (masseSalariale / ca_mois) * 100 : 0

  // ─── Food cost ───────────────────────────────────────────────────
  const recettes = (recettesRes.data ?? []) as Array<{ food_cost_pct: number | null }>
  const fcs = recettes.map(r => Number(r.food_cost_pct ?? 0)).filter(n => n > 0)
  const fc_moyen = fcs.length > 0 ? fcs.reduce((a, b) => a + b, 0) / fcs.length : 0
  const fc_alerte = fcs.filter(n => n > 30).length
  const fc_rouge = fcs.filter(n => n > 32).length

  // ─── Hygiène ─────────────────────────────────────────────────────
  const ncs = (ncRes.data ?? []) as Array<{ gravite: string; date_constat: string }>
  const nc_critiques = ncs.filter(n => n.gravite === 'critique').length
  const nc_age_max = ncs.length > 0
    ? Math.max(...ncs.map(n => Math.floor((Date.now() - new Date(n.date_constat).getTime()) / 86_400_000)))
    : 0

  // ─── Stock & DLC ────────────────────────────────────────────────
  const lots = (lotsRes.data ?? []) as Array<{ dlc: string | null }>
  const dlcCritique = lots.filter(l => l.dlc && l.dlc <= dansN(1)).length
  const dlcProche   = lots.filter(l => l.dlc && l.dlc > dansN(1) && l.dlc <= dansN(3)).length
  const ingredients = (ingredientsRes.data ?? []) as Array<{ quantite_stock: number | null; prix_achat_ht: number | null }>
  const valeurStock = ingredients.reduce((s, i) => s + Number(i.quantite_stock ?? 0) * Number(i.prix_achat_ht ?? 0), 0)

  // ─── Légal ───────────────────────────────────────────────────────
  const obligations = (obligationsRes.data ?? []) as Array<{ date_echeance: string | null }>
  const obl_expirees = obligations.filter(o => o.date_echeance && o.date_echeance < aujourdhui).length
  const obl_proches  = obligations.filter(o => o.date_echeance && o.date_echeance >= aujourdhui && o.date_echeance <= dansN(30)).length

  // ─── Finances ────────────────────────────────────────────────────
  const factures = (facturesRes.data ?? []) as Array<{ montant_ttc: number | null }>
  const charges = (chargesRes.data ?? []) as Array<{ montant_ttc: number | null; frequence: string | null }>
  const FREQ_MULT: Record<string, number> = { mensuel: 1, bimestriel: 0.5, trimestriel: 1/3, semestriel: 1/6, annuel: 1/12 }
  const charges_fixes_mois = charges.reduce((s, c) => s + Number(c.montant_ttc ?? 0) * (FREQ_MULT[c.frequence ?? 'mensuel'] ?? 1), 0)

  // ─── Réservations ────────────────────────────────────────────────
  const resaTables = (resaTablesRes.data ?? []) as Array<{ nb_couverts: number | null; date_resa: string }>
  const couverts_jour = resaTables.filter(r => r.date_resa === aujourdhui).reduce((s, r) => s + Number(r.nb_couverts ?? 0), 0)
  const couverts_semaine = resaTables.reduce((s, r) => s + Number(r.nb_couverts ?? 0), 0)

  return {
    genere_le: now.toISOString(),
    periode: { mois: format(now, 'yyyy-MM'), debut, fin },
    ca: {
      mois_courant: round2(ca_mois),
      nb_couverts_mois: nb_couverts,
      panier_moyen: round2(panier_moyen),
      jours_actifs,
    },
    rh: {
      masse_salariale_mois: round2(masseSalariale),
      nb_employes_actifs: employes.length,
      ratio_masse_ca: round1(ratio_masse_ca),
    },
    food_cost: {
      moyen_pct: round1(fc_moyen),
      nb_recettes_alerte: fc_alerte,
      nb_recettes_rouge: fc_rouge,
    },
    hygiene: {
      nc_ouvertes: ncs.length,
      nc_critiques,
      nc_anciennes_jours: nc_age_max,
      controles_temp_jour: controlesRes.count ?? 0,
    },
    stock: {
      lots_dlc_critique: dlcCritique,
      lots_dlc_proche: dlcProche,
      valeur_stock: round2(valeurStock),
    },
    legal: {
      obligations_expirees: obl_expirees,
      obligations_proches_30j: obl_proches,
    },
    finances: {
      factures_a_payer: factures.length,
      montant_factures_a_payer: round2(factures.reduce((s, f) => s + Number(f.montant_ttc ?? 0), 0)),
      charges_fixes_mois: round2(charges_fixes_mois),
    },
    reservations: {
      couverts_jour,
      couverts_semaine,
    },
  }
}

const round1 = (n: number) => Math.round(n * 10) / 10
const round2 = (n: number) => Math.round(n * 100) / 100
