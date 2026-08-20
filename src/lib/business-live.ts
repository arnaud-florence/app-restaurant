// Les chiffres du business, tels qu'on veut les voir en ouvrant l'app.
//
// Une seule lecture de `commandes` + une de `commande_articles`, filtrées sur
// statut = 'encaisse' — la même règle que le reste de l'outil, pour qu'aucun
// écran ne raconte une histoire différente d'un autre.

import { createClient } from '@/lib/supabase/server'

export type JourCA = { date: string; jour: string; ca: number; tickets: number; aujourdhui: boolean }

export type BusinessLive = {
  caJour: number
  ticketsJour: number
  ticketMoyen: number
  /** CA d'hier À LA MÊME HEURE. Comparer une matinée à une journée entière
   *  ferait paraître catastrophique tous les matins du monde. */
  caHierMemeHeure: number
  caHierComplet: number
  /** Sept derniers jours, du plus ancien au plus récent. */
  semaine: JourCA[]
  caSemaine: number
  especes: number
  carte: number
  /** Meilleures ventes du jour, quantité décroissante. */
  topJour: Array<{ nom: string; quantite: number; ca: number }>
  /** Fiches créées automatiquement depuis un libellé de caisse, à relire. */
  aClasser: number
}

const PARIS = 'Europe/Paris'

function jourParis(d: Date): string {
  return new Intl.DateTimeFormat('fr-CA', { timeZone: PARIS, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d)
}
function libelleJour(iso: string): string {
  return new Intl.DateTimeFormat('fr-FR', { timeZone: PARIS, weekday: 'short' }).format(new Date(iso + 'T12:00:00Z'))
}

export async function getBusinessLive(): Promise<BusinessLive> {
  const sb = await createClient()
  const maintenant = new Date()
  const debut = new Date(maintenant.getTime() - 7 * 86_400_000)

  const { data: cmds } = await sb
    .from('commandes')
    .select('id, montant_total_ttc, mode_paiement, created_at')
    .eq('statut', 'encaisse')
    .gte('created_at', debut.toISOString())

  const lignes = cmds ?? []
  const ajd = jourParis(maintenant)
  const hier = jourParis(new Date(maintenant.getTime() - 86_400_000))

  // Regroupement par jour de Paris — pas par jour UTC : à 1 h du matin en été,
  // les deux ne désignent pas la même journée de travail.
  const parJour = new Map<string, { ca: number; n: number }>()
  for (let i = 6; i >= 0; i--) parJour.set(jourParis(new Date(maintenant.getTime() - i * 86_400_000)), { ca: 0, n: 0 })

  let caJour = 0, ticketsJour = 0, caHierComplet = 0, caHierMemeHeure = 0, especes = 0, carte = 0
  const heureLimite = maintenant.getTime() - 86_400_000
  const idsJour = new Set<string>()

  for (const c of lignes) {
    const montant = Number(c.montant_total_ttc ?? 0)
    const j = jourParis(new Date(c.created_at as string))
    const bucket = parJour.get(j)
    if (bucket) { bucket.ca += montant; bucket.n++ }

    if (j === ajd) {
      caJour += montant; ticketsJour++
      idsJour.add(String(c.id))
      const mp = String(c.mode_paiement ?? '').toLowerCase()
      if (mp.includes('cash') || mp.includes('espece')) especes += montant
      else carte += montant
    }
    if (j === hier) {
      caHierComplet += montant
      if (new Date(c.created_at as string).getTime() <= heureLimite) caHierMemeHeure += montant
    }
  }

  const semaine: JourCA[] = [...parJour.entries()].map(([date, v]) => ({
    date, jour: libelleJour(date), ca: Math.round(v.ca * 100) / 100, tickets: v.n, aujourdhui: date === ajd,
  }))

  // Meilleures ventes du jour. Sans commandes du jour, on épargne la requête.
  const topJour: BusinessLive['topJour'] = []
  if (idsJour.size > 0) {
    const { data: arts } = await sb
      .from('commande_articles')
      .select('quantite, prix_unitaire_ttc, recette:recettes(nom)')
      .in('commande_id', [...idsJour])
    const agg = new Map<string, { q: number; ca: number }>()
    for (const a of arts ?? []) {
      const nom = (a.recette as { nom?: string } | null)?.nom ?? '—'
      const cur = agg.get(nom) ?? { q: 0, ca: 0 }
      cur.q += Number(a.quantite ?? 0)
      cur.ca += Number(a.quantite ?? 0) * Number(a.prix_unitaire_ttc ?? 0)
      agg.set(nom, cur)
    }
    topJour.push(...[...agg.entries()]
      .map(([nom, v]) => ({ nom, quantite: v.q, ca: Math.round(v.ca * 100) / 100 }))
      .sort((a, b) => b.quantite - a.quantite)
      .slice(0, 5))
  }

  const { count: aClasser } = await sb
    .from('recettes')
    .select('id', { count: 'exact', head: true })
    .eq('cree_par_caisse', true)

  return {
    caJour: Math.round(caJour * 100) / 100,
    ticketsJour,
    ticketMoyen: ticketsJour > 0 ? Math.round((caJour / ticketsJour) * 100) / 100 : 0,
    caHierMemeHeure: Math.round(caHierMemeHeure * 100) / 100,
    caHierComplet: Math.round(caHierComplet * 100) / 100,
    semaine,
    caSemaine: Math.round(semaine.reduce((s, j) => s + j.ca, 0) * 100) / 100,
    especes: Math.round(especes * 100) / 100,
    carte: Math.round(carte * 100) / 100,
    topJour,
    aClasser: aClasser ?? 0,
  }
}
