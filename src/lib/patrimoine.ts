// Lecture patrimoniale : ce que l'affaire VAUT, pas seulement ce qu'elle encaisse.
//
// Le reste de l'outil mesure le chiffre d'affaires et les marges. C'est le
// niveau « gagner de l'argent ». Un actif se mesure autrement : à son EBE
// RÉCURRENT, parce que c'est lui qu'on multiplie pour obtenir la valeur d'un
// fonds de commerce.
//
// L'effet de levier est le point : 1 000 € de résultat mensuel supplémentaire
// valent 12 000 € par an, donc 30 000 à 48 000 € de valeur de fonds. Un euro
// qui reste et se répète vaut trente fois un euro sorti une fois — et sorti,
// il est en plus taxé deux fois.
//
// ⚠️ HONNÊTETÉ DU CHIFFRE. Une valorisation calculée sur huit jours d'activité
// n'a aucun sens. Le résultat porte donc toujours son niveau de fiabilité et
// le nombre de jours réellement observés ; la page refuse d'afficher une
// valeur en gros caractères tant que la base est trop mince.
//
// Server-only (accès base).

import { createClient } from '@/lib/supabase/server'

export type Fiabilite = 'insuffisant' | 'indicatif' | 'solide'

export type Patrimoine = {
  periode: { debut: string; fin: string; joursObserves: number; joursAvecVente: number }
  fiabilite: Fiabilite
  /** Ce qui entre, ramené au mois. */
  caTtcMensuel: number
  caHtMensuel: number
  /** Part du CA dont le coût d'achat est connu — sans elle, le reste est une estimation. */
  couverturePct: number
  tauxChargesVariables: number
  chargesFixes: number
  /** Remboursement du crédit du fonds — exclu de l'EBE, mais bien décaissé. */
  chargesFinancieres: number
  masseSalariale: number
  /** Excédent brut d'exploitation (AVANT financement), mensuel puis annualisé. */
  ebeMensuel: number
  ebeAnnuel: number
  /** Ce qui reste réellement en caisse, une fois le crédit remboursé. */
  resultatDisponibleMensuel: number
  valorisation: {
    parEbeBas: number; parEbeHaut: number
    parCaBas: number; parCaHaut: number
    /** Fourchette retenue : l'intersection des deux méthodes quand elle existe. */
    basse: number; haute: number
  }
  prixAchat: number | null
  plusValueLatente: { basse: number; haute: number } | null
  creditRestantDu: number | null
  /** Ce que vaut, en valeur de fonds, un euro de résultat mensuel de plus. */
  levierEuroRecurrent: { bas: number; haut: number }
  /** Le CA mensuel qu'il faudrait pour atteindre ces valorisations. */
  paliers: Array<{ caTtcMensuel: number; ebeAnnuel: number; valeurBasse: number; valeurHaute: number }>
}

const arrondi = (n: number) => Math.round(n * 100) / 100
const jourParis = (d: Date) =>
  new Intl.DateTimeFormat('fr-CA', { timeZone: 'Europe/Paris', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d)

export async function getPatrimoine(jours = 90): Promise<Patrimoine> {
  const sb = await createClient()
  const fin = new Date()
  const debut = new Date(fin.getTime() - jours * 86_400_000)

  const [cfgRes, cmdRes, fixesRes, empRes] = await Promise.all([
    sb.from('config_patrimoine').select('*').limit(1).maybeSingle(),
    sb.from('commandes').select('id, montant_total_ttc, created_at')
      .eq('statut', 'encaisse').gte('created_at', debut.toISOString()),
    sb.from('charges_fixes_recurrentes').select('libelle, montant_mensuel_eur').eq('actif', true),
    sb.from('employes').select('salaire_horaire, heures_contrat, coef_charges_patronales, avantages_mensuel_eur')
      .eq('actif', true),
  ])

  const cfg = (cfgRes.data ?? {}) as Record<string, number | string | null>
  type Cmd = { id: string; montant_total_ttc: number | string | null; created_at: string }
  const cmds = (cmdRes.data ?? []) as unknown as Cmd[]

  // Jours RÉELLEMENT travaillés, pas jours calendaires : un établissement
  // fermé trois semaines pour incendie ne doit pas voir son EBE divisé par la
  // durée de la fermeture.
  const joursDistincts = new Set(cmds.map(c => jourParis(new Date(c.created_at))))
  const joursAvecVente = joursDistincts.size
  const caTtcPeriode = cmds.reduce((s, c) => s + Number(c.montant_total_ttc ?? 0), 0)
  const caTtcJour = joursAvecVente > 0 ? caTtcPeriode / joursAvecVente : 0
  const caTtcMensuel = caTtcJour * 30

  // ── Coût des marchandises, mesuré sur les lignes ──────────────────
  let caHtCouvert = 0, caHtTotal = 0, cout = 0
  const ids = cmds.map(c => String(c.id))
  for (let i = 0; i < ids.length; i += 200) {
    const { data: arts } = await sb.from('commande_articles')
      .select('quantite, prix_unitaire_ttc, tva_taux, recette:recettes(tva, cout_achat_ht, type_revenu)')
      .in('commande_id', ids.slice(i, i + 200))
    for (const a of arts ?? []) {
      const r = a.recette as { tva?: number | string | null; cout_achat_ht?: number | string | null; type_revenu?: string | null } | null
      // Les commissions (tabac, presse, FDJ) n'ont pas de coût matière et
      // fausseraient le taux : on les exclut du calcul.
      if (r?.type_revenu === 'commission') continue
      const q = Number(a.quantite ?? 0)
      const ttc = q * Number(a.prix_unitaire_ttc ?? 0)
      const taux = Number(a.tva_taux ?? r?.tva ?? 5.5)
      const ht = ttc / (1 + taux / 100)
      caHtTotal += ht
      const cu = r?.cout_achat_ht == null ? null : Number(r.cout_achat_ht)
      if (cu != null && cu > 0) { caHtCouvert += ht; cout += q * cu }
    }
  }
  // Le taux mesuré sur le périmètre couvert est extrapolé au reste : c'est
  // une hypothèse, et la couverture est affichée pour qu'on sache ce qu'elle vaut.
  const tauxChargesVariables = caHtCouvert > 0 ? cout / caHtCouvert : 0.40
  const couverturePct = caHtTotal > 0 ? Math.round(caHtCouvert / caHtTotal * 100) : 0

  // ⚠️ L'EBE se calcule AVANT le financement. Le remboursement du crédit du
  // fonds n'est pas une charge d'exploitation : c'est le prix d'acquisition
  // étalé. Le laisser dans les charges fixes revient à faire payer deux fois
  // le même fonds — une fois à l'achat, une fois dans sa propre valorisation —
  // et sous-estime la valeur d'environ un multiple × la mensualité annuelle.
  // Il reste affiché à part, parce qu'il sort bel et bien de la trésorerie.
  const EST_FINANCIER = /cr[ée]dit|emprunt|remboursement|pr[êe]t\b/i
  const fixesLignes = (fixesRes.data ?? []) as Array<{ libelle: string | null; montant_mensuel_eur: number | string | null }>
  let chargesFixes = 0, chargesFinancieres = 0
  for (const c of fixesLignes) {
    const m = Number(c.montant_mensuel_eur ?? 0)
    if (EST_FINANCIER.test(String(c.libelle ?? ''))) chargesFinancieres += m
    else chargesFixes += m
  }
  const masseSalariale = (empRes.data ?? []).reduce((s, e) => {
    const h = Number(e.heures_contrat ?? 0), t = Number(e.salaire_horaire ?? 0)
    const c = Number(e.coef_charges_patronales ?? 1.42)
    return s + (h * 52 / 12 * t * c) + Number(e.avantages_mensuel_eur ?? 0)
  }, 0)

  const caHtMensuel = caTtcMensuel / 1.07
  const ebeMensuel = caHtMensuel * (1 - tauxChargesVariables) - chargesFixes - masseSalariale
  const ebeAnnuel = ebeMensuel * 12

  const nb = (k: string, d: number) => { const v = Number(cfg[k]); return Number.isFinite(v) && v !== 0 ? v : d }
  const mBas = nb('multiple_ebe_bas', 2.5), mHaut = nb('multiple_ebe_haut', 4)
  const cBas = nb('pct_ca_bas', 0.5), cHaut = nb('pct_ca_haut', 0.9)

  // Une valorisation négative n'existe pas : un fonds déficitaire ne vaut pas
  // moins que rien, il vaut ce que valent son bail et son emplacement.
  const parEbeBas = Math.max(0, ebeAnnuel * mBas)
  const parEbeHaut = Math.max(0, ebeAnnuel * mHaut)
  const caAnnuel = caTtcMensuel * 12
  const parCaBas = caAnnuel * cBas, parCaHaut = caAnnuel * cHaut

  const prixAchat = cfg.prix_achat_fonds == null ? null : Number(cfg.prix_achat_fonds)
  const basse = Math.min(parEbeBas, parCaBas), haute = Math.max(parEbeHaut, parCaHaut)

  // ── Reste dû sur le crédit ────────────────────────────────────────
  let creditRestantDu: number | null = null
  const cap = cfg.credit_capital == null ? null : Number(cfg.credit_capital)
  const duree = cfg.credit_duree_mois == null ? null : Number(cfg.credit_duree_mois)
  const debutCredit = cfg.credit_debut ? new Date(String(cfg.credit_debut)) : null
  if (cap && duree && debutCredit) {
    const ecoules = Math.max(0, Math.floor((Date.now() - debutCredit.getTime()) / (30.44 * 86_400_000)))
    creditRestantDu = Math.max(0, cap * (1 - Math.min(1, ecoules / duree)))
  }

  // ── Fiabilité ─────────────────────────────────────────────────────
  // Le seuil n'est pas cosmétique : annualiser huit jours d'ouverture, avec
  // leur effet de nouveauté, produirait un chiffre faux affiché en grand.
  const fiabilite: Fiabilite =
    joursAvecVente < 30 ? 'insuffisant' : joursAvecVente < 90 ? 'indicatif' : 'solide'

  const paliers = [25000, 31200, 40000, 45000, 55000].map(caTtc => {
    const ht = caTtc / 1.07
    const e = (ht * (1 - tauxChargesVariables) - chargesFixes - masseSalariale) * 12  // EBE, hors financement
    return {
      caTtcMensuel: caTtc,
      ebeAnnuel: arrondi(e),
      valeurBasse: arrondi(Math.min(Math.max(0, e * mBas), caTtc * 12 * cBas)),
      valeurHaute: arrondi(Math.max(Math.max(0, e * mHaut), caTtc * 12 * cHaut)),
    }
  })

  return {
    periode: {
      debut: jourParis(debut), fin: jourParis(fin),
      joursObserves: jours, joursAvecVente,
    },
    fiabilite,
    caTtcMensuel: arrondi(caTtcMensuel),
    caHtMensuel: arrondi(caHtMensuel),
    couverturePct,
    tauxChargesVariables: arrondi(tauxChargesVariables * 100) / 100,
    chargesFixes: arrondi(chargesFixes),
    chargesFinancieres: arrondi(chargesFinancieres),
    masseSalariale: arrondi(masseSalariale),
    ebeMensuel: arrondi(ebeMensuel),
    resultatDisponibleMensuel: arrondi(ebeMensuel - chargesFinancieres),
    ebeAnnuel: arrondi(ebeAnnuel),
    valorisation: {
      parEbeBas: arrondi(parEbeBas), parEbeHaut: arrondi(parEbeHaut),
      parCaBas: arrondi(parCaBas), parCaHaut: arrondi(parCaHaut),
      basse: arrondi(basse), haute: arrondi(haute),
    },
    prixAchat,
    plusValueLatente: prixAchat == null ? null
      : { basse: arrondi(basse - prixAchat), haute: arrondi(haute - prixAchat) },
    creditRestantDu: creditRestantDu == null ? null : arrondi(creditRestantDu),
    // Le chiffre qui résume tout : ce que vaut, en patrimoine, un euro de
    // résultat mensuel récurrent gagné.
    levierEuroRecurrent: { bas: arrondi(12 * mBas), haut: arrondi(12 * mHaut) },
    paliers,
  }
}
