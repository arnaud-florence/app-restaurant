// Centre opérationnel — agrège l'état temps réel de TOUS les postes en un seul
// objet, pour le hub /service. Réutilise les mêmes règles que les écrans de poste
// (retard cuisine > 20 min, tables à encaisser, etc.) → cohérence garantie.
//
// Server-side uniquement (appelé depuis le Server Component /service/page.tsx).

import { createClient } from '@/lib/supabase/server'

export type PosteCle = 'salle' | 'cuisine' | 'pizza' | 'bar' | 'snack' | 'caisse' | 'livreur' | 'reception' | 'reservations' | 'fournil' | 'bar-comptoir' | 'snack-comptoir'

export type GroupePoste = 'production' | 'salle' | 'hotel'

export type CartePoste = {
  cle: PosteCle
  href: string
  emoji: string
  titre: string
  /** Zone d'affichage : production (cuisine/pizza/bar) · salle (salle/caisse/snack/livreur) · hotel (réception/résa). */
  groupe: GroupePoste
  /** Chiffre principal (gros). */
  valeur: number
  /** Légende sous le chiffre. */
  legende: string
  /** Lignes de détail secondaires. */
  details: string[]
  /** 'vert' = calme · 'orange' = à surveiller · 'rouge' = urgent. */
  urgence: 'vert' | 'orange' | 'rouge'
}

export type ActiviteEvenement = {
  id: string
  emoji: string
  texte: string
  zone: string | null
  created_at: string
}

export type CentreOperationnel = {
  // Pouls global
  ouvertDepuis: string | null      // ISO de l'ouverture du service (session caisse ou 1ʳᵉ commande)
  caJour: number                   // CA encaissé aujourd'hui
  caEnCours: number                // valeur des commandes en cours (non encaissées)
  commandesEnCours: number
  couvertsServis: number           // approximation : commandes table servies/encaissées du jour
  alertesRouges: number
  // ─── Pouls enrichi (Vague 1) ───
  nbTickets: number                // nb de commandes encaissées aujourd'hui
  ticketMoyen: number              // CA jour / nb tickets
  caS1: number                     // CA encaissé le même jour la semaine dernière (réf.)
  deltaS1Pct: number | null        // variation % vs S-1 (null si pas de réf.)
  objectifJour: number | null      // objectif CA du jour (objectif mensuel ÷ jours du mois)
  objectifPct: number | null       // % de l'objectif atteint (null si objectif non défini)
  mixCanaux: { table: number; online: number; comptoir: number } // CA encaissé par canal
  caParHeure: number[]             // CA encaissé par heure (24 cases, index = heure Paris) — sparkline cadence
  topPlats: { nom: string; qte: number }[]  // top 3 plats vendus aujourd'hui (à pousser)
  // Cartes par poste
  cartes: CartePoste[]
  // Fil d'actualité
  activite: ActiviteEvenement[]
}

const ACTIONS_EMOJI: Record<string, string> = {
  encaissement: '💰', cloture_caisse: '🔒', ouverture_caisse: '🔓',
  commande_creee: '🧾', annulation: '🗑️', statut: '🔄',
  sortie_caisse: '💸', entree_caisse: '➕',
}

export async function getCentreOperationnel(): Promise<CentreOperationnel> {
  const sb = await createClient()
  const now = Date.now()
  const today = new Date(now).toISOString().slice(0, 10)
  const tomorrow = new Date(now + 86_400_000).toISOString().slice(0, 10)
  const startToday = today + 'T00:00:00'
  // Fenêtre « même jour la semaine dernière » : [J-7 00:00, J-6 00:00)
  const startTodayMinus7 = new Date(now - 7 * 86_400_000).toISOString().slice(0, 10) + 'T00:00:00'
  const startTodayMinus6 = new Date(now - 6 * 86_400_000).toISOString().slice(0, 10) + 'T00:00:00'
  // Objectif mensuel (Module 25) → objectif du jour = objectif mensuel ÷ jours du mois
  const moisCourant = today.slice(0, 7)             // yyyy-MM
  const anneeCourante = Number(today.slice(0, 4))
  const joursDansMois = new Date(anneeCourante, Number(today.slice(5, 7)), 0).getDate()

  const [
    cmdRes, tablesRes, sessionRes, encaisseRes,
    resaTablesRes, resaChambresRes, findingsRes, activiteRes,
    caS1Res, objectifRes, topPlatsRes,
  ] = await Promise.all([
    // Commandes EN COURS (non encaissées / non annulées) + leurs articles
    sb.from('commandes')
      .select('id, numero, numero_table, source, statut, montant_total_ttc, mode_paiement, created_at, commande_articles(tag_destination, statut)')
      .not('statut', 'in', '(encaisse,annule)'),
    // État des tables
    sb.from('tables_restaurant').select('statut'),
    // Session caisse ouverte
    sb.from('sessions_caisse').select('id, ouverte_at, fond_initial').is('fermee_at', null).order('ouverte_at', { ascending: false }).limit(1).maybeSingle(),
    // Commandes encaissées aujourd'hui (CA jour + couverts + mix canaux + cadence horaire)
    sb.from('commandes').select('montant_total_ttc, numero_table, source, created_at').eq('statut', 'encaisse').gte('created_at', startToday),
    // Réservations tables du jour
    sb.from('reservations_tables').select('nb_personnes').gte('date_resa', today).lt('date_resa', tomorrow),
    // Réservations chambres (arrivées/départs/demandes du jour)
    sb.from('reservations_chambres').select('date_arrivee, date_depart, statut').or(`date_arrivee.eq.${today},date_depart.eq.${today}`),
    // Alertes rouges non résolues
    sb.from('agent_findings').select('id', { count: 'exact', head: true }).eq('resolu', false).eq('urgence', 'rouge'),
    // Fil d'actualité (dernières actions)
    sb.from('journal_activite').select('id, action, zone, cible, created_at').order('created_at', { ascending: false }).limit(18),
    // CA encaissé le même jour la semaine dernière (référence de comparaison)
    sb.from('commandes').select('montant_total_ttc').eq('statut', 'encaisse').gte('created_at', startTodayMinus7).lt('created_at', startTodayMinus6),
    // Objectif CA mensuel (Module 25) → dérivé en objectif du jour
    sb.from('objectifs').select('valeur_cible').eq('periode', 'mensuel').eq('mois', moisCourant).eq('annee', anneeCourante).eq('kpi', 'ca').maybeSingle(),
    // Articles vendus aujourd'hui (hors annulé) → top plats (à pousser)
    sb.from('commandes').select('commande_articles(quantite, recette:recettes(nom))').gte('created_at', startToday).neq('statut', 'annule'),
  ])

  type ArtRow = { tag_destination: string | null; statut: string | null }
  type CmdRow = {
    id: string; numero: string | null; numero_table: string | null; source: string | null
    statut: string | null; montant_total_ttc: number | null; mode_paiement: string | null
    created_at: string; commande_articles: ArtRow[] | null
  }
  const cmds = (cmdRes.data ?? []) as CmdRow[]

  // ─── Agrégats par tag de production ──────────────────────────────
  const enProd = (a: ArtRow) => a.statut === 'en_attente' || a.statut === 'en_preparation'
  let cuisAtt = 0, pizzaAtt = 0, barAtt = 0
  let cuisRetard = 0, pizzaRetard = 0
  let caEnCours = 0, commandesEnCours = 0
  let snackEnCours = 0, ardoisesComptoir = 0, livreurEnCours = 0
  let fournilAtt = 0, snackAtt = 0
  // created_at (ISO) de la plus vieille commande ayant encore un article en attente au poste
  let cuisOldest: string | null = null, pizzaOldest: string | null = null, barOldest: string | null = null
  const plusVieux = (cur: string | null, iso: string) => !cur || iso < cur ? iso : cur
  const RETARD_MS = 20 * 60 * 1000

  for (const c of cmds) {
    commandesEnCours++
    caEnCours += Number(c.montant_total_ttc ?? 0)
    const arts = c.commande_articles ?? []
    const ageMs = now - new Date(c.created_at).getTime()
    let aCuisNonServi = false, aPizzaNonServi = false
    let aCuisProd = false, aPizzaProd = false, aBarProd = false
    for (const a of arts) {
      const t = a.tag_destination
      if (t === 'CUISINE') { if (enProd(a)) { cuisAtt++; aCuisProd = true } if (a.statut !== 'servi') aCuisNonServi = true }
      else if (t === 'PIZZA') { if (enProd(a)) { pizzaAtt++; aPizzaProd = true } if (a.statut !== 'servi') aPizzaNonServi = true }
      else if (t === 'BAR') { if (enProd(a)) { barAtt++; aBarProd = true } }
      else if (t === 'FOURNIL') { if (enProd(a)) fournilAtt++ }
      else if (t === 'SNACKING') { if (enProd(a)) snackAtt++ }
    }
    if (aCuisProd) cuisOldest = plusVieux(cuisOldest, c.created_at)
    if (aPizzaProd) pizzaOldest = plusVieux(pizzaOldest, c.created_at)
    if (aBarProd) barOldest = plusVieux(barOldest, c.created_at)
    if (aCuisNonServi && ageMs > RETARD_MS) cuisRetard++
    if (aPizzaNonServi && ageMs > RETARD_MS) pizzaRetard++
    if (c.source === 'ONLINE') snackEnCours++
    if (c.source === 'COMPTOIR' && c.statut !== 'encaisse' && !c.mode_paiement && c.statut !== 'en_attente_paiement_comptoir') ardoisesComptoir++
    if (c.statut === 'en_livraison') livreurEnCours++
  }
  const ageMin = (iso: string | null): number => iso ? Math.floor((now - new Date(iso).getTime()) / 60000) : 0

  // ─── Tables ──────────────────────────────────────────────────────
  const tables = (tablesRes.data ?? []) as { statut: string | null }[]
  const tOccupees = tables.filter(t => t.statut === 'occupee').length
  const tAEncaisser = tables.filter(t => t.statut === 'a_encaisser').length
  const tLibres = tables.filter(t => t.statut === 'libre').length

  // ─── Caisse / CA jour ────────────────────────────────────────────
  const session = sessionRes.data as { id: string; ouverte_at: string; fond_initial: number } | null
  const encaissees = (encaisseRes.data ?? []) as { montant_total_ttc: number | null; numero_table: string | null; source: string | null; created_at: string | null }[]
  const caJour = encaissees.reduce((s, c) => s + Number(c.montant_total_ttc ?? 0), 0)
  const couvertsServis = encaissees.length
  const nbTickets = couvertsServis
  const ticketMoyen = nbTickets > 0 ? caJour / nbTickets : 0
  const aEncaisser = cmds.filter(c => c.statut === 'servi').length

  // ─── Mix canaux (CA encaissé par source aujourd'hui) ─────────────
  let mixTable = 0, mixOnline = 0, mixComptoir = 0
  for (const e of encaissees) {
    const v = Number(e.montant_total_ttc ?? 0)
    if (e.source === 'ONLINE') mixOnline += v
    else if (e.source === 'COMPTOIR') mixComptoir += v
    else mixTable += v
  }

  // ─── Comparaison vs même jour S-1 ────────────────────────────────
  const caS1 = ((caS1Res.data ?? []) as { montant_total_ttc: number | null }[])
    .reduce((s, c) => s + Number(c.montant_total_ttc ?? 0), 0)
  const deltaS1Pct = caS1 > 0 ? ((caJour - caS1) / caS1) * 100 : null

  // ─── Objectif du jour (objectif mensuel ÷ jours du mois) ─────────
  const objMensuel = (objectifRes.data as { valeur_cible: number | null } | null)?.valeur_cible ?? null
  const objectifJour = objMensuel != null && joursDansMois > 0 ? Number(objMensuel) / joursDansMois : null
  const objectifPct = objectifJour && objectifJour > 0 ? (caJour / objectifJour) * 100 : null

  // ─── Cadence : CA encaissé par heure (heure de Paris, robuste au fuseau serveur) ──
  // ⚠ locale en-GB + hourCycle h23 : 'fr-FR' renvoie « 10 h » (suffixe) → Number()=NaN.
  const fmtHeureParis = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Paris', hour: '2-digit', hourCycle: 'h23' })
  const caParHeure = new Array(24).fill(0) as number[]
  for (const e of encaissees) {
    if (!e.created_at) continue
    const h = Number(fmtHeureParis.format(new Date(e.created_at)))
    if (h >= 0 && h < 24) caParHeure[h] += Number(e.montant_total_ttc ?? 0)
  }

  // ─── Top plats du jour (quantités vendues, hors annulé) ──────────
  type PlatArt = { quantite: number | null; recette: { nom: string | null } | { nom: string | null }[] | null }
  const platMap = new Map<string, number>()
  for (const cmd of (topPlatsRes.data ?? []) as { commande_articles: PlatArt[] | null }[]) {
    for (const a of (cmd.commande_articles ?? [])) {
      const rec = Array.isArray(a.recette) ? a.recette[0] : a.recette
      const nom = rec?.nom
      if (!nom) continue
      platMap.set(nom, (platMap.get(nom) ?? 0) + Number(a.quantite ?? 0))
    }
  }
  const topPlats = [...platMap.entries()]
    .map(([nom, qte]) => ({ nom, qte }))
    .sort((a, b) => b.qte - a.qte)
    .slice(0, 3)

  // ─── Réservations / réception ────────────────────────────────────
  const resaTables = (resaTablesRes.data ?? []) as { nb_personnes: number | null }[]
  const resaCount = resaTables.length
  const resaCouverts = resaTables.reduce((s, r) => s + Number(r.nb_personnes ?? 0), 0)
  const resaChambres = (resaChambresRes.data ?? []) as { date_arrivee: string; date_depart: string; statut: string }[]
  const arrivees = resaChambres.filter(r => r.date_arrivee === today && r.statut !== 'annulee').length
  const departs = resaChambres.filter(r => r.date_depart === today && r.statut !== 'annulee').length
  const demandes = resaChambres.filter(r => r.statut === 'demande').length

  const ouvertDepuis = session?.ouverte_at ?? (cmds.length ? cmds.reduce((min, c) => c.created_at < min ? c.created_at : min, cmds[0].created_at) : null)
  const alertesRouges = findingsRes.count ?? 0

  // ─── Construction des cartes ─────────────────────────────────────
  const u = (n: number, seuilOrange: number, seuilRouge: number): 'vert' | 'orange' | 'rouge' =>
    n >= seuilRouge ? 'rouge' : n >= seuilOrange ? 'orange' : 'vert'

  // Détails d'un poste de production : âge du plus vieux ticket + retards éventuels
  const prodDetails = (oldestIso: string | null, retard: number): string[] => {
    const l: string[] = []
    if (oldestIso) l.push(`⏱ + ancien ${ageMin(oldestIso)} min`)
    if (retard > 0) l.push(`🔥 ${retard} en retard +20 min`)
    return l.length ? l : ['à jour']
  }
  // Bar : âge du plus vieux ticket + ardoises comptoir à encaisser
  const barLignes: string[] = []
  if (barOldest) barLignes.push(`⏱ + ancien ${ageMin(barOldest)} min`)
  if (ardoisesComptoir > 0) barLignes.push(`🧾 ${ardoisesComptoir} ardoise(s) à encaisser`)
  if (barLignes.length === 0) barLignes.push('à jour')

  const cartes: CartePoste[] = [
    {
      cle: 'salle', href: '/serveur', emoji: '🪑', titre: 'Salle', groupe: 'salle',
      valeur: tOccupees, legende: 'tables occupées',
      details: [`${tAEncaisser} à encaisser`, `${tLibres} libres`],
      urgence: tAEncaisser > 0 ? 'orange' : 'vert',
    },
    {
      cle: 'cuisine', href: '/cuisine', emoji: '👨‍🍳', titre: 'Cuisine', groupe: 'production',
      valeur: cuisAtt, legende: 'plats en attente',
      details: prodDetails(cuisOldest, cuisRetard),
      urgence: cuisRetard > 0 ? 'rouge' : u(cuisAtt, 4, 8),
    },
    {
      cle: 'pizza', href: '/pizza', emoji: '🍕', titre: 'Pizza', groupe: 'production',
      valeur: pizzaAtt, legende: 'pizzas en attente',
      details: prodDetails(pizzaOldest, pizzaRetard),
      urgence: pizzaRetard > 0 ? 'rouge' : u(pizzaAtt, 3, 6),
    },
    {
      cle: 'bar', href: '/bar', emoji: '🍷', titre: 'Bar', groupe: 'production',
      valeur: barAtt, legende: 'boissons en attente',
      details: barLignes,
      urgence: u(barAtt, 4, 8),
    },
    {
      cle: 'snack', href: '/emporter', emoji: '🥪', titre: 'Snack / Emporter', groupe: 'salle',
      valeur: snackEnCours, legende: 'commandes en cours',
      details: [`${ardoisesComptoir} comptoir`],
      urgence: u(snackEnCours, 3, 6),
    },
    {
      cle: 'fournil', href: '/comptoir/fournil', emoji: '🥖', titre: 'Fournil', groupe: 'salle',
      valeur: fournilAtt, legende: 'articles en attente',
      details: ['prise de commande · caisse agréée'],
      urgence: u(fournilAtt, 4, 8),
    },
    {
      cle: 'bar-comptoir', href: '/comptoir/bar', emoji: '🍷', titre: 'Bar comptoir', groupe: 'salle',
      valeur: barAtt, legende: 'boissons en attente',
      details: ['vente directe · caisse agréée'],
      urgence: u(barAtt, 4, 8),
    },
    {
      cle: 'snack-comptoir', href: '/comptoir/snack-emporter', emoji: '🥪', titre: 'Snack comptoir', groupe: 'salle',
      valeur: snackAtt, legende: 'snacks en attente',
      details: ['vente directe · caisse agréée'],
      urgence: u(snackAtt, 3, 6),
    },
    {
      cle: 'caisse', href: '/caisse', emoji: '💰', titre: 'Caisse', groupe: 'salle',
      valeur: aEncaisser, legende: 'à encaisser',
      details: session ? [`Ouverte · fond ${Number(session.fond_initial ?? 0).toFixed(0)} €`, `CA jour ${caJour.toFixed(0)} €`] : ['⚠ Caisse fermée'],
      urgence: !session ? 'orange' : aEncaisser > 0 ? 'orange' : 'vert',
    },
    {
      cle: 'livreur', href: '/livreur', emoji: '🛵', titre: 'Livreur', groupe: 'salle',
      valeur: livreurEnCours, legende: 'en livraison',
      details: ['tournée du jour'],
      urgence: u(livreurEnCours, 3, 6),
    },
    {
      cle: 'reception', href: '/reception?tab=demandes', emoji: '🛎', titre: 'Réception (chambres)', groupe: 'hotel',
      valeur: arrivees + departs, legende: 'arrivées + départs',
      details: [`${arrivees} arrivée(s) · ${departs} départ(s)`, demandes > 0 ? `${demandes} demande(s)` : 'pas de demande'],
      urgence: demandes > 0 ? 'orange' : 'vert',
    },
    {
      cle: 'reservations', href: '/reception?tab=tables', emoji: '📅', titre: 'Réservations (tables)', groupe: 'hotel',
      valeur: resaCount, legende: 'réservations tables aujourd\'hui',
      details: [`${resaCouverts} couverts attendus`],
      urgence: 'vert',
    },
  ]

  // ─── Fil d'actualité ─────────────────────────────────────────────
  const activite: ActiviteEvenement[] = ((activiteRes.data ?? []) as { id: string; action: string; zone: string | null; cible: string | null; created_at: string }[])
    .map(a => ({
      id: a.id,
      emoji: ACTIONS_EMOJI[a.action] ?? '•',
      texte: `${a.cible ?? a.action}${a.zone ? ` · ${a.zone}` : ''}`,
      zone: a.zone,
      created_at: a.created_at,
    }))

  return {
    ouvertDepuis,
    caJour: Math.round(caJour * 100) / 100,
    caEnCours: Math.round(caEnCours * 100) / 100,
    commandesEnCours,
    couvertsServis,
    alertesRouges,
    nbTickets,
    ticketMoyen: Math.round(ticketMoyen * 100) / 100,
    caS1: Math.round(caS1 * 100) / 100,
    deltaS1Pct: deltaS1Pct != null ? Math.round(deltaS1Pct * 10) / 10 : null,
    objectifJour: objectifJour != null ? Math.round(objectifJour * 100) / 100 : null,
    objectifPct: objectifPct != null ? Math.round(objectifPct) : null,
    mixCanaux: {
      table: Math.round(mixTable * 100) / 100,
      online: Math.round(mixOnline * 100) / 100,
      comptoir: Math.round(mixComptoir * 100) / 100,
    },
    caParHeure: caParHeure.map(v => Math.round(v)),
    topPlats,
    cartes,
    activite,
  }
}
