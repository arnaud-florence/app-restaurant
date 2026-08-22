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
  topProduits: Array<{
    nom: string; quantite: number; ca: number; part: number
    /** Marge brute HT (null si le coût d'achat du produit est inconnu) */
    marge: number | null
    /** Food cost % (coût / CA HT), null si coût inconnu */
    fc: number | null
  }>
  parCategorie: Array<{ nom: string; quantite: number; ca: number; part: number }>
  parPaiement: Array<{ nom: string; ca: number; part: number }>
  tva: Array<{ taux: string; montant: number }>
  /** Produits actifs qui n'ont RIEN vendu sur la période. */
  dormants: Array<{ nom: string; categorie: string }>
  /** Marges de la période — calculées sur les produits au coût d'achat connu. */
  marge: {
    caHT: number
    /** CA HT du périmètre couvert par un coût (les autres produits n'entrent
        pas dans le food cost pondéré, ils sont dits « non couverts »). */
    caHTCouvert: number
    cout: number
    brute: number
    foodCostPct: number | null
    couverturePct: number
  }
  /** Casse (invendus du soir) sur la même période — vient en déduction. */
  casse: {
    total: number
    pieces: number
    top: Array<{ nom: string; quantite: number; eur: number }>
  }
}

const PARIS = 'Europe/Paris'
const fmtJour = new Intl.DateTimeFormat('fr-CA', { timeZone: PARIS, year: 'numeric', month: '2-digit', day: '2-digit' })
const fmtLabel = new Intl.DateTimeFormat('fr-FR', { timeZone: PARIS, weekday: 'short', day: 'numeric' })
// ⚠️ On passe par formatToParts : en français, `format()` renvoie « 09 h »,
// que Number() transforme en NaN. Toutes les ventes tombaient alors dans une
// seule barre « NaNh » et le graphe des heures de pointe ne montrait rien.
const fmtHeure = new Intl.DateTimeFormat('fr-FR', { timeZone: PARIS, hour: '2-digit', hour12: false })
const heureParis = (d: Date): number =>
  Number(fmtHeure.formatToParts(d).find(p => p.type === 'hour')?.value ?? NaN)

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

    // Le garde ne protège QUE le compartiment horaire : un `continue` ici
    // priverait aussi la commande de son paiement et de sa TVA.
    const h = heureParis(d)
    if (Number.isFinite(h)) {
      const hb = parHeureMap.get(h) ?? { ca: 0, n: 0 }
      hb.ca += montant; hb.n++
      parHeureMap.set(h, hb)
    }

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
  const prodMap = new Map<string, { q: number; ca: number; caHT: number; cout: number; couvert: boolean }>()
  const catMap = new Map<string, { q: number; ca: number }>()
  const vendus = new Set<string>()
  let mCaHT = 0, mCaHTCouvert = 0, mCout = 0

  if (ids.length > 0) {
    // Supabase borne la taille d'un `in` : on découpe.
    for (let i = 0; i < ids.length; i += 200) {
      const { data: arts } = await sb
        .from('commande_articles')
        .select('quantite, prix_unitaire_ttc, tva_taux, recette:recettes(nom, categorie, cout_achat_ht, tva)')
        .in('commande_id', ids.slice(i, i + 200))
      for (const a of arts ?? []) {
        const r = a.recette as { nom?: string; categorie?: string; cout_achat_ht?: number | string | null; tva?: number | string | null } | null
        const nom = r?.nom ?? '—'
        const cat = r?.categorie ?? 'Sans catégorie'
        const q = Number(a.quantite ?? 0)
        const ca = q * Number(a.prix_unitaire_ttc ?? 0)
        // Marge : CA HT au taux réellement facturé (repli : taux du produit),
        // coût = quantité × coût d'achat (achat-revente, cf. 0126).
        const taux = Number(a.tva_taux ?? r?.tva ?? 5.5)
        const caHT = ca / (1 + taux / 100)
        const coutU = r?.cout_achat_ht == null ? null : Number(r.cout_achat_ht)
        const couvert = coutU != null && coutU > 0
        mCaHT += caHT
        if (couvert) { mCaHTCouvert += caHT; mCout += q * coutU }
        vendus.add(nom)
        const p = prodMap.get(nom) ?? { q: 0, ca: 0, caHT: 0, cout: 0, couvert: false }
        p.q += q; p.ca += ca; p.caHT += caHT
        if (couvert) { p.cout += q * coutU; p.couvert = true }
        prodMap.set(nom, p)
        const c2 = catMap.get(cat) ?? { q: 0, ca: 0 }; c2.q += q; c2.ca += ca; catMap.set(cat, c2)
      }
    }
  }

  const caLignes = [...prodMap.values()].reduce((s, v) => s + v.ca, 0) || 1
  const rangProduits = [...prodMap.entries()]
    .map(([nom, v]) => ({
      nom, quantite: v.q, ca: Math.round(v.ca * 100) / 100, part: v.ca / caLignes,
      marge: v.couvert ? Math.round((v.caHT - v.cout) * 100) / 100 : null,
      fc: v.couvert && v.caHT > 0 ? Math.round(v.cout / v.caHT * 1000) / 10 : null,
    }))
    .sort((a, b) => b.ca - a.ca)
  const rangCategories = [...catMap.entries()]
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

  // ── Casse : invendus du soir sur la même période (0129) ────────────
  const { data: inv } = await sb
    .from('invendus')
    .select('quantite, cout_unitaire_ht, recette:recettes(nom)')
    .gte('date_invendu', fmtJour.format(debut))
  let casseTotal = 0, cassePieces = 0
  const casseMap = new Map<string, { q: number; eur: number }>()
  for (const l of inv ?? []) {
    const q = Number(l.quantite ?? 0)
    const eur = q * Number(l.cout_unitaire_ht ?? 0)
    casseTotal += eur; cassePieces += q
    const nom = (l.recette as { nom?: string } | null)?.nom ?? '—'
    const cur = casseMap.get(nom) ?? { q: 0, eur: 0 }
    cur.q += q; cur.eur += eur; casseMap.set(nom, cur)
  }

  return {
    periode, debut: debut.toISOString(), fin: fin.toISOString(),
    ca: delta(caAct, caPrec),
    tickets: delta(actuelles.length, precedentes.length),
    panierMoyen: delta(pmAct, pmPrec),
    parJour,
    parHeure: [...parHeureMap.entries()]
      .map(([heure, v]) => ({ heure, ca: Math.round(v.ca * 100) / 100, tickets: v.n }))
      .sort((a, b) => a.heure - b.heure),
    topProduits: rangProduits.slice(0, 15),
    parCategorie: rangCategories,
    parPaiement: [...paiements.entries()]
      .map(([nom, ca]) => ({ nom, ca: Math.round(ca * 100) / 100, part: ca / caPaiements }))
      .sort((a, b) => b.ca - a.ca),
    tva: [...tvaMap.entries()]
      .map(([taux, montant]) => ({ taux, montant: Math.round(montant * 100) / 100 }))
      .sort((a, b) => Number(a.taux) - Number(b.taux)),
    dormants,
    marge: {
      caHT: Math.round(mCaHT * 100) / 100,
      caHTCouvert: Math.round(mCaHTCouvert * 100) / 100,
      cout: Math.round(mCout * 100) / 100,
      brute: Math.round((mCaHTCouvert - mCout) * 100) / 100,
      foodCostPct: mCaHTCouvert > 0 ? Math.round(mCout / mCaHTCouvert * 1000) / 10 : null,
      couverturePct: mCaHT > 0 ? Math.round(mCaHTCouvert / mCaHT * 100) : 0,
    },
    casse: {
      total: Math.round(casseTotal * 100) / 100,
      pieces: Math.round(cassePieces),
      top: [...casseMap.entries()]
        .map(([nom, v]) => ({ nom, quantite: v.q, eur: Math.round(v.eur * 100) / 100 }))
        .sort((a, b) => b.eur - a.eur).slice(0, 5),
    },
  }
}
