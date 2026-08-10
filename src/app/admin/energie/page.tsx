import { createClient } from '@/lib/supabase/server'
import EnergieClient from './EnergieClient'
import {
  type ReleveEnergie, type TypeEnergie, type UniteEnergie,
  intervalleAnneeIso, comparerNN1, coutEnergetiqueParPlat, genererSuggestions,
  agregerParMois,
} from '@/lib/energie'
import { format, startOfMonth, endOfMonth } from 'date-fns'

export const metadata = { title: 'Gestion énergie — Admin' }
export const dynamic = 'force-dynamic'

export type DataEnergie = {
  releves: ReleveEnergie[]
  moisCourant: string         // YYYY-MM
  comparaisons: Record<TypeEnergie, ReturnType<typeof comparerNN1>>
  agreges: Record<TypeEnergie, ReturnType<typeof agregerParMois>>
  cout_par_plat_mois: number
  nb_plats_mois: number
  total_energie_mois: number
  suggestions: ReturnType<typeof genererSuggestions>
}

export default async function EnergiePage() {
  const supabase = await createClient()
  const today = new Date()
  const moisCourant = format(today, 'yyyy-MM')
  const debutMois = format(startOfMonth(today), 'yyyy-MM-dd')
  const finMois = format(endOfMonth(today), 'yyyy-MM-dd')
  const periodeAn = intervalleAnneeIso(today)

  const [relevesRes, articlesRes] = await Promise.all([
    supabase.from('releves_energie')
      .select('*')
      .gte('periode_debut', format(new Date(today.getFullYear() - 2, today.getMonth(), 1), 'yyyy-MM-dd'))
      .order('periode_debut'),
    // Plats servis ce mois : on part de `commandes` (qui a created_at) et on
    // embarque les articles. commande_articles n'a PAS de colonne created_at.
    supabase.from('commandes')
      .select('statut, created_at, commande_articles(quantite)')
      .neq('statut', 'annule')
      .gte('created_at', debutMois)
      .lte('created_at', finMois + 'T23:59:59'),
  ])

  const releves: ReleveEnergie[] = (relevesRes.data ?? []).map(r => ({
    id: r.id as string,
    type: r.type as TypeEnergie,
    date_releve: r.date_releve as string,
    periode_debut: r.periode_debut as string,
    periode_fin: r.periode_fin as string,
    consommation: Number(r.consommation ?? 0),
    unite: r.unite as UniteEnergie,
    prix_unitaire_ht: r.prix_unitaire_ht != null ? Number(r.prix_unitaire_ht) : null,
    montant_ht: Number(r.montant_ht ?? 0),
    montant_ttc: Number(r.montant_ttc ?? 0),
    fournisseur: (r.fournisseur as string) ?? null,
    num_facture: (r.num_facture as string) ?? null,
    notes: (r.notes as string) ?? null,
    created_at: r.created_at as string,
  }))

  // Compte les plats servis ce mois (commandes non annulées → somme des quantités d'articles)
  type CmdRow = { statut?: string; commande_articles?: Array<{ quantite: number | string }> | null }
  const cmdsMois = (articlesRes.data ?? []) as CmdRow[]
  const nb_plats_mois = cmdsMois
    .filter(c => c.statut !== 'annule')
    .reduce((s, c) => s + (c.commande_articles ?? []).reduce((ss, a) => ss + Number(a.quantite ?? 0), 0), 0)

  // Total = somme des MÊMES types que la ventilation affichée (élec/gaz/eau), pour
  // que le « Total énergie mois » réconcilie avec les cartes par type. (Si un jour on
  // saisit des relevés type 'autre', il faudra aussi les afficher dans la ventilation.)
  const TYPES_ENERGIE_AFFICHES = ['electricite', 'gaz', 'eau']
  const total_energie_mois = releves
    .filter(r => r.periode_debut.slice(0, 7) === moisCourant && TYPES_ENERGIE_AFFICHES.includes(r.type))
    .reduce((s, r) => s + r.montant_ttc, 0)

  const cout_par_plat_mois = coutEnergetiqueParPlat(releves, moisCourant, nb_plats_mois)

  // Comparaison N vs N-1 sur les 12 derniers mois
  const debutComp = new Date(periodeAn.debut + 'T12:00:00')
  const finComp = new Date(periodeAn.fin + 'T12:00:00')
  const comparaisons = {
    electricite: comparerNN1(releves, 'electricite', debutComp, finComp),
    gaz:         comparerNN1(releves, 'gaz',         debutComp, finComp),
    eau:         comparerNN1(releves, 'eau',         debutComp, finComp),
    autre:       comparerNN1(releves, 'autre',       debutComp, finComp),
  }
  const agreges = {
    electricite: agregerParMois(releves, 'electricite'),
    gaz:         agregerParMois(releves, 'gaz'),
    eau:         agregerParMois(releves, 'eau'),
    autre:       agregerParMois(releves, 'autre'),
  }

  // Suggestions basées sur le mois courant
  const moisCourantComp = (t: TypeEnergie) => comparaisons[t].find(c => c.mois_iso === moisCourant) ?? null
  const suggestions = genererSuggestions(
    [
      { type: 'electricite', mois: moisCourantComp('electricite') },
      { type: 'gaz',         mois: moisCourantComp('gaz') },
      { type: 'eau',         mois: moisCourantComp('eau') },
    ],
    cout_par_plat_mois,
  )

  const data: DataEnergie = {
    releves, moisCourant, comparaisons, agreges,
    cout_par_plat_mois, nb_plats_mois, total_energie_mois,
    suggestions,
  }

  return <EnergieClient data={data} />
}
