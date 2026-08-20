// Statistiques de vente — ce que montre la caisse, plus ce qu'elle ne montre pas.
//
// Tout part de `commandes` + `commande_articles` filtrés sur statut='encaisse',
// la même règle que partout ailleurs dans l'outil. Les ventes SumUp y sont
// puisque le connecteur les matérialise en commandes 'CAISSE' avec leurs lignes.
//
// Chaque indicateur est calculé sur la période ET sur la période précédente de
// même longueur : un chiffre sans point de comparaison ne dit rien. 430 € un
// lundi, c'est bien ou mal ? La question n'a de sens que face au lundi d'avant.

import { createClient } from '@/lib/supabase/server'

export type Periode = 'jour' | 'semaine' | 'mois'

export const PERIODES: Record<Periode, { label: string; jours: number }> = {
  jour:    { label: "Aujourd'hui", jours: 1 },
  semaine: { label: '7 jours',     jours: 7 },
  mois:    { label: '30 jours',    jours: 30 },
}

export type Delta = { valeur: number; precedent: number; pct: number | null }

export type VentesStats = {
  periode: Periode
  debut: string
  fin: string
  ca: Delta
  tickets: Delta
  panierMoyen: Delta
  /** CA par jour sur la période, du plus ancien au plus récent. */
  parJour: Array<{ date: string; label: string; ca: number; tickets: number }>
  /** CA par heure d'ouverture — dit quand produire et quand staffer. */
  parHeure: Array<{ heure: number; ca: number; tickets: number }>
  topProduits: Array<{ nom: string; quantite: number; ca: number; part: number }>
  parCategorie: Array<{ nom: string; quantite: number; ca: number; part: number }>
  parPaiement: Array<{ nom: string; ca: number; part: number }>
  tva: Array<{ taux: string; montant: number }>
  /** Produits actifs qui n'ont RIEN vendu sur la période. */
  dormants: Array<{ nom: string; categorie: string }>
  caParTicketMax: number
}

const PARIS = 'Europe/Paris'
const fmtJour = new Intl.DateTimeFormat('fr-CA', { timeZone: PARIS, year: 'numeric', month: '2-digit', day: '2-digit' })
const fmtLabel = new Intl.DateTimeFormat('fr-FR', { timeZone: PARIS, weekday: 'short', day: 'numeric' })
const fmtHeure = new Intl.DateTimeFormat('fr-FR', { timeZone: PARIS, hour: '2-digit', hour12: false })

const delta = (v: number, p: number): Delta => ({
  valeur: Math.round(v * 100) / 100,
  precedent: Math.round(p * 100) / 100,
  pct: p > 0 ? Math.round(((v - p) / p) * 100) : null,
})

export async function getVentesStats(periode: Periode = 'semaine'): Promise<VentesStats> {
  const sb = await createClient()
  const jours = PERIODES[periode].jours
  const fin = new Date()
  const debut = new Date(fin.getTime() - jours * 86_400_000)
  const debutPrec = new Date(debut.getTime() - jours * 86_400_000)

  // Une seule lecture couvrant les deux périodes : on découpe ensuite en
  // mémoire plutôt que de refaire un aller-retour.
  const { data: cmds } = await sb
    .from('commandes')
    .select('id, montant_total_ttc, mode_paiement, created_at, ventilation_tva')
    .eq('statut', 'encaisse')
    .gte('created_at', debutPrec.toISOString())

  type Cmd = {
    id: string; montant_total_ttc: number | string | null
    mode_paiement: string | null; created_at: string
    ventilation_tva: Record<string, number> | null
  }
  const toutes = (cmds ?? []) as unknown as Cmd[]
  const actuelles: Cmd[] = [], precedentes: Cmd[] = []
  for (const c of toutes) {
    const t = new Date(c.created_at).getTime()
    if (t >= debut.getTime()) actuelles.push(c)
    else if (t >= debutPrec.getTime()) precedentes.push(c)
  }

  const somme = (l: Cmd[]) => l.reduce((s, c) => s + Number(c.montant_total_ttc ?? 0), 0)
  const caAct = somme(actuelles), caPrec = somme(precedentes)
  const pmAct = actuelles.length ? caAct / actuelles.length : 0
  const pmPrec = precedentes.length ? caPrec / precedentes.length : 0

  // ── Par jour ──────────────────────────────────────────────────────
  const parJourMap = new Map<string, { ca: number; n: number }>()
  for (let i = jours - 1; i >= 0; i--) {
    parJourMap.set(fmtJour.format(new Date(fin.getTime() - i * 86_400_000)), { ca: 0, n: 0 })
  }
  // ── Par heure ─────────────────────────────────────────────────────
  const parHeureMap = new Map<number, { ca: number; n: number }>()
  const paiements = new Map<string, number>()
  const tvaMap = new Map<string, number>()

  for (const c of actuelles) {
    const d = new Date(c.created_at)
    const montant = Number(c.montant_total_ttc ?? 0)

    const b = parJourMap.get(fmtJour.format(d))
    if (b) { b.ca += montant; b.n++ }

    const h = Number(fmtHeure.format(d))
    const hb = parHeureMap.get(h) ?? { ca: 0, n: 0 }
    hb.ca += montant; hb.n++
    parHeureMap.set(h, hb)

    const mp = String(c.mode_paiement ?? 'autre').toLowerCase()
    const nom = mp.includes('cash') || mp.includes('espece') ? 'Espèces'
      : mp.includes('pos') || mp.includes('carte') || mp.includes('cb') ? 'Carte'
      : mp === 'caisse_agreee' ? 'Caisse agréée' : mp
    paiements.set(nom, (paiements.get(nom) ?? 0) + montant)

    for (const [taux, v] of Object.entries(c.ventilation_tva ?? {})) {
      tvaMap.set(taux, (tvaMap.get(taux) ?? 0) + Number(v))
    }
  }

  // ── Lignes : produits et catégories ───────────────────────────────
  const ids = actuelles.map(c => String(c.id))
  const prodMap = new Map<string, { q: number; ca: number }>()
  const catMap = new Map<string, { q: number; ca: number }>()
  const vendus = new Set<string>()

  if (ids.length > 0) {
    // Supabase borne la taille d'un `in` : on découpe.
    for (let i = 0; i < ids.length; i += 200) {
      const { data: arts } = await sb
        .from('commande_articles')
        .select('quantite, prix_unitaire_ttc, recette:recettes(nom, categorie)')
        .in('commande_id', ids.slice(i, i + 200))
      for (const a of arts ?? []) {
        const r = a.recette as { nom?: string; categorie?: string } | null
        const nom = r?.nom ?? '—'
        const cat = r?.categorie ?? 'Sans catégorie'
        const q = Number(a.quantite ?? 0)
        const ca = q * Number(a.prix_unitaire_ttc ?? 0)
        vendus.add(nom)
        const p = prodMap.get(nom) ?? { q: 0, ca: 0 }; p.q += q; p.ca += ca; prodMap.set(nom, p)
        const c2 = catMap.get(cat) ?? { q: 0, ca: 0 }; c2.q += q; c2.ca += ca; catMap.set(cat, c2)
      }
    }
  }

  const caLignes = [...prodMap.values()].reduce((s, v) => s + v.ca, 0) || 1
  const rang = (m: Map<string, { q: number; ca: number }>) =>
    [...m.entries()]
      .map(([nom, v]) => ({ nom, quantite: v.q, ca: Math.round(v.ca * 100) / 100, part: v.ca / caLignes }))
      .sort((a, b) => b.ca - a.ca)

  // ── Dormants : actifs, jamais vendus sur la période ────────────────
  // C'est l'information que la caisse ne donne pas — elle ne connaît que ce
  // qui s'est vendu. Or savoir ce qui NE se vend pas, c'est ce qui permet
  // d'arrêter d'en produire.
  const { data: actifs } = await sb
    .from('recettes')
    .select('nom, categorie')
    .eq('actif', true)
    .eq('tag_destination', 'FOURNIL')
  const dormants = (actifs ?? [])
    .filter(r => !vendus.has(String(r.nom)))
    .map(r => ({ nom: String(r.nom), categorie: String(r.categorie ?? '—') }))
    .sort((a, b) => a.categorie.localeCompare(b.categorie) || a.nom.localeCompare(b.nom))

  const parJour = [...parJourMap.entries()].map(([date, v]) => ({
    date,
    label: fmtLabel.format(new Date(date + 'T12:00:00Z')),
    ca: Math.round(v.ca * 100) / 100,
    tickets: v.n,
  }))

  const caPaiements = [...paiements.values()].reduce((s, v) => s + v, 0) || 1

  return {
    periode, debut: debut.toISOString(), fin: fin.toISOString(),
    ca: delta(caAct, caPrec),
    tickets: delta(actuelles.length, precedentes.length),
    panierMoyen: delta(pmAct, pmPrec),
    parJour,
    parHeure: [...parHeureMap.entries()]
      .map(([heure, v]) => ({ heure, ca: Math.round(v.ca * 100) / 100, tickets: v.n }))
      .sort((a, b) => a.heure - b.heure),
    topProduits: rang(prodMap).slice(0, 15),
    parCategorie: rang(catMap),
    parPaiement: [...paiements.entries()]
      .map(([nom, ca]) => ({ nom, ca: Math.round(ca * 100) / 100, part: ca / caPaiements }))
      .sort((a, b) => b.ca - a.ca),
    tva: [...tvaMap.entries()]
      .map(([taux, montant]) => ({ taux, montant: Math.round(montant * 100) / 100 }))
      .sort((a, b) => Number(a.taux) - Number(b.taux)),
    dormants,
    caParTicketMax: Math.max(...parJour.map(j => j.ca), 1),
  }
}
