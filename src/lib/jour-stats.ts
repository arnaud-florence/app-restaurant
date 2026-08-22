// Détail complet d'UNE journée de vente — la page « retraçable » du journal.
//
// Tout ce que la comptabilité ou un contrôle peut demander sur un jour
// donné : les tickets un à un, la ventilation TVA, les paiements, chaque
// produit avec sa marge, la casse du soir. La journée est bornée en heure
// de PARIS (une vente à 23 h 30 UTC+2 appartient à son jour local, pas au
// lendemain UTC).

import { createClient } from '@/lib/supabase/server'

const PARIS = 'Europe/Paris'
const fmtJour = new Intl.DateTimeFormat('fr-CA', { timeZone: PARIS, year: 'numeric', month: '2-digit', day: '2-digit' })
const fmtHeureMin = new Intl.DateTimeFormat('fr-FR', { timeZone: PARIS, hour: '2-digit', minute: '2-digit', hour12: false })

export type JourStats = {
  date: string
  caTTC: number
  caHT: number
  tickets: number
  panierMoyen: number
  marge: { caHTCouvert: number; cout: number; brute: number; foodCostPct: number | null; couverturePct: number }
  casse: { total: number; pieces: number; lignes: Array<{ nom: string; quantite: number; eur: number }> }
  parHeure: Array<{ heure: number; ca: number; tickets: number }>
  produits: Array<{ nom: string; categorie: string; quantite: number; caTTC: number; marge: number | null; fc: number | null }>
  paiements: Array<{ nom: string; ca: number; n: number }>
  tva: Array<{ taux: string; montant: number }>
  /** Chaque ticket du jour — la traçabilité fine. */
  ticketsListe: Array<{
    heure: string; numero: string; source: string
    montant: number; paiement: string; nbArticles: number
  }>
}

export async function getJourStats(date: string): Promise<JourStats | null> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null
  const sb = await createClient()

  // Fenêtre élargie (±1 jour UTC) puis filtre exact sur le jour de Paris :
  // insensible aux changements d'heure été/hiver.
  const centre = new Date(date + 'T12:00:00Z')
  const { data: brutes } = await sb
    .from('commandes')
    .select(`id, numero, source, montant_total_ttc, mode_paiement, created_at, ventilation_tva,
             commande_articles(quantite, prix_unitaire_ttc, tva_taux, statut,
               recette:recettes(nom, categorie, cout_achat_ht, tva))`)
    .eq('statut', 'encaisse')
    .gte('created_at', new Date(centre.getTime() - 36 * 3600_000).toISOString())
    .lte('created_at', new Date(centre.getTime() + 36 * 3600_000).toISOString())

  type Art = {
    quantite: number | string; prix_unitaire_ttc: number | string | null
    tva_taux: number | string | null; statut: string
    recette: { nom?: string; categorie?: string; cout_achat_ht?: number | string | null; tva?: number | string | null } | null
  }
  type Cmd = {
    id: string; numero: string; source: string
    montant_total_ttc: number | string | null; mode_paiement: string | null
    created_at: string; ventilation_tva: Record<string, number> | null
    commande_articles: Art[]
  }
  const cmds = ((brutes ?? []) as unknown as Cmd[])
    .filter(c => fmtJour.format(new Date(c.created_at)) === date)
    .sort((a, b) => a.created_at.localeCompare(b.created_at))

  let caTTC = 0, caHT = 0, mCaHTc = 0, mCout = 0
  const parHeure = new Map<number, { ca: number; n: number }>()
  const produits = new Map<string, { cat: string; q: number; ca: number; caHT: number; cout: number; couvert: boolean }>()
  const paiements = new Map<string, { ca: number; n: number }>()
  const tvaMap = new Map<string, number>()
  const ticketsListe: JourStats['ticketsListe'] = []

  const libellePaiement = (mp: string | null) => {
    const v = String(mp ?? 'autre').toLowerCase()
    return v.includes('cash') || v.includes('espece') ? 'Espèces'
      : v.includes('pos') || v.includes('carte') || v.includes('cb') ? 'Carte'
      : v === 'caisse_agreee' ? 'Caisse agréée' : v
  }

  for (const c of cmds) {
    const montant = Number(c.montant_total_ttc ?? 0)
    caTTC += montant
    const d = new Date(c.created_at)
    const h = Number(new Intl.DateTimeFormat('fr-FR', { timeZone: PARIS, hour: '2-digit', hour12: false })
      .formatToParts(d).find(p => p.type === 'hour')?.value ?? NaN)
    if (Number.isFinite(h)) {
      const b = parHeure.get(h) ?? { ca: 0, n: 0 }
      b.ca += montant; b.n++; parHeure.set(h, b)
    }
    const pay = libellePaiement(c.mode_paiement)
    const pb = paiements.get(pay) ?? { ca: 0, n: 0 }
    pb.ca += montant; pb.n++; paiements.set(pay, pb)
    for (const [taux, v] of Object.entries(c.ventilation_tva ?? {})) {
      tvaMap.set(taux, (tvaMap.get(taux) ?? 0) + Number(v))
    }

    let nbArt = 0
    for (const a of c.commande_articles ?? []) {
      if (a.statut === 'annule') continue
      const q = Number(a.quantite ?? 0)
      nbArt += q
      const ca = q * Number(a.prix_unitaire_ttc ?? 0)
      const taux = Number(a.tva_taux ?? a.recette?.tva ?? 5.5)
      const ht = ca / (1 + taux / 100)
      caHT += ht
      const coutU = a.recette?.cout_achat_ht == null ? null : Number(a.recette.cout_achat_ht)
      const couvert = coutU != null && coutU > 0
      if (couvert) { mCaHTc += ht; mCout += q * coutU }
      const nom = a.recette?.nom ?? '—'
      const p = produits.get(nom) ?? {
        cat: a.recette?.categorie ?? '—', q: 0, ca: 0, caHT: 0, cout: 0, couvert: false,
      }
      p.q += q; p.ca += ca; p.caHT += ht
      if (couvert) { p.cout += q * coutU; p.couvert = true }
      produits.set(nom, p)
    }

    ticketsListe.push({
      heure: fmtHeureMin.format(d),
      numero: c.numero,
      source: c.source,
      montant: Math.round(montant * 100) / 100,
      paiement: pay,
      nbArticles: nbArt,
    })
  }

  // ── Casse du jour ───────────────────────────────────────────────────
  const { data: inv } = await sb.from('invendus')
    .select('quantite, cout_unitaire_ht, recette:recettes(nom)')
    .eq('date_invendu', date)
  let casseTotal = 0, cassePieces = 0
  const casseLignes = (inv ?? []).map(l => {
    const q = Number(l.quantite ?? 0)
    const eur = q * Number(l.cout_unitaire_ht ?? 0)
    casseTotal += eur; cassePieces += q
    return { nom: (l.recette as { nom?: string } | null)?.nom ?? '—', quantite: q, eur: Math.round(eur * 100) / 100 }
  }).sort((a, b) => b.eur - a.eur)

  const r2 = (n: number) => Math.round(n * 100) / 100
  return {
    date,
    caTTC: r2(caTTC),
    caHT: r2(caHT),
    tickets: cmds.length,
    panierMoyen: cmds.length ? r2(caTTC / cmds.length) : 0,
    marge: {
      caHTCouvert: r2(mCaHTc), cout: r2(mCout), brute: r2(mCaHTc - mCout),
      foodCostPct: mCaHTc > 0 ? Math.round(mCout / mCaHTc * 1000) / 10 : null,
      couverturePct: caHT > 0 ? Math.round(mCaHTc / caHT * 100) : 0,
    },
    casse: { total: r2(casseTotal), pieces: Math.round(cassePieces), lignes: casseLignes },
    parHeure: [...parHeure.entries()]
      .map(([heure, v]) => ({ heure, ca: r2(v.ca), tickets: v.n }))
      .sort((a, b) => a.heure - b.heure),
    produits: [...produits.entries()]
      .map(([nom, v]) => ({
        nom, categorie: v.cat, quantite: v.q, caTTC: r2(v.ca),
        marge: v.couvert ? r2(v.caHT - v.cout) : null,
        fc: v.couvert && v.caHT > 0 ? Math.round(v.cout / v.caHT * 1000) / 10 : null,
      }))
      .sort((a, b) => b.caTTC - a.caTTC),
    paiements: [...paiements.entries()]
      .map(([nom, v]) => ({ nom, ca: r2(v.ca), n: v.n }))
      .sort((a, b) => b.ca - a.ca),
    tva: [...tvaMap.entries()]
      .map(([taux, montant]) => ({ taux, montant: r2(montant) }))
      .sort((a, b) => Number(a.taux) - Number(b.taux)),
    ticketsListe,
  }
}
