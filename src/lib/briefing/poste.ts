// Briefing personnalisé par poste — agrège toutes les infos dont un employé a
// besoin à l'arrivée pour bien travailler (réservations, allergies, stock,
// DLC, météo, plat du jour, KPIs perso).
//
// Utilisé par le composant <BriefingPoste /> en haut de chaque page ops.
// Server-side : appelé depuis Server Components (cuisine/page.tsx, etc.).
//
// Économie de requêtes : les Server Components peuvent appeler getBriefingForPoste()
// en parallèle des autres queries (Promise.all).

import type { SupabaseClient } from '@supabase/supabase-js'

export type PosteBriefing =
  | 'cuisinier'        // /cuisine colonne CUISINE
  | 'pizzaiolo'        // /cuisine colonne PIZZA
  | 'serveur'          // /serveur
  | 'barman'           // /bar
  | 'caisse'           // /caisse
  | 'caisse_snacking'  // /emporter (snack)

export type ReservationBriefing = {
  id: string
  client_nom: string
  client_id: string | null
  heure_arrivee: string             // HH:MM
  nb_personnes: number
  zone: string | null
  allergies: string[]               // tirées du client lié (pas de la résa elle-même)
  notes: string | null
  statut: string
}

export type AlerteStockBriefing = {
  ingredient_nom: string
  stock_actuel: number
  unite: string
  type: 'rupture' | 'min' | 'dlc'
  message: string
}

export type Briefing = {
  date: string                       // YYYY-MM-DD
  poste: PosteBriefing
  prenom: string | null              // employé connecté
  // ─── Commun à tous postes ──────────────────────────────
  meteo: {
    conditions: string | null        // 'ensoleille', 'pluie_forte', etc.
    temp_min: number | null
    temp_max: number | null
    impact_ca_pct: number             // ex +10 = beau temps, -20 = orage
    libelle: string                   // "Ensoleillé"
    emoji: string                     // "☀️"
  } | null
  platsDuJour: Array<{
    nom: string
    prix_special: number | null
    description: string | null
  }>
  alertesStock: AlerteStockBriefing[]   // filtrés par poste
  dlcCritiques: Array<{                 // DLC ≤ J+2 sur lots_produits
    nom: string
    quantite: number
    unite: string
    dlc: string                          // YYYY-MM-DD
    joursRestants: number
  }>
  // ─── Spécifique par poste ──────────────────────────────
  reservations?: ReservationBriefing[]       // pour serveur uniquement
  reservationsTotalCouverts?: number         // somme nb_personnes (serveur)
  temperatureFrigo?: {                       // pour cuisinier/pizzaiolo/barman
    equipement: string
    temperature: number
    conforme: boolean
    moment: string
    heure: string
  } | null
  caJour?: number                            // pour serveur, barman, caisse — temps réel
  nbCommandesJour?: number
  ticketMoyenJour?: number
  ruptureSignaleeParCuisine?: string[]       // pour caisse_snacking
}

// Mapping poste → tag_destination(s) concernés pour les alertes stock
const POSTE_TAGS: Record<PosteBriefing, string[]> = {
  cuisinier:       ['CUISINE'],
  pizzaiolo:       ['PIZZA'],
  serveur:         [],                       // pas de tag stock spécifique
  barman:          ['BAR'],
  caisse:          [],
  caisse_snacking: ['SNACKING', 'PIZZA', 'BAR'],
}

// Heuristique : ingrédients liés à un tag via recettes qui ont ce tag
async function chargerAlertesStockPoste(
  supabase: SupabaseClient,
  poste: PosteBriefing,
  limit = 5,
): Promise<AlerteStockBriefing[]> {
  const tags = POSTE_TAGS[poste]
  if (tags.length === 0) return []

  // Trouve les recettes du tag → ingredients utilisés → alertes stock
  const { data: recettes } = await supabase
    .from('recettes')
    .select('id')
    .eq('actif', true)
    .in('tag_destination', tags)
  const recetteIds = (recettes ?? []).map(r => r.id)
  if (recetteIds.length === 0) return []

  const { data: liens } = await supabase
    .from('recette_ingredients')
    .select('ingredient_id')
    .in('recette_id', recetteIds)
  const ingredientIds = [...new Set((liens ?? []).map(l => l.ingredient_id).filter(Boolean) as string[])]
  if (ingredientIds.length === 0) {
    // Fallback : pas de recette_ingredients configuré, on prend les alertes globales
    // (tout ingrédient en rupture ou sous minimum)
    const { data: ings } = await supabase
      .from('ingredients')
      .select('id, nom, unite, stock_actuel, stock_minimum')
      .eq('actif', true)
      .limit(50)
    return (ings ?? [])
      .filter(i => Number(i.stock_actuel ?? 0) <= Number(i.stock_minimum ?? 0))
      .slice(0, limit)
      .map(i => ({
        ingredient_nom: i.nom as string,
        stock_actuel: Number(i.stock_actuel ?? 0),
        unite: (i.unite as string) ?? '',
        type: Number(i.stock_actuel ?? 0) <= 0 ? 'rupture' as const : 'min' as const,
        message: Number(i.stock_actuel ?? 0) <= 0 ? 'Rupture' : `Sous minimum (${i.stock_minimum})`,
      }))
  }

  const { data: ings } = await supabase
    .from('ingredients')
    .select('id, nom, unite, stock_actuel, stock_minimum')
    .in('id', ingredientIds)
    .eq('actif', true)
  return (ings ?? [])
    .filter(i => Number(i.stock_actuel ?? 0) <= Number(i.stock_minimum ?? 0))
    .sort((a, b) => Number(a.stock_actuel ?? 0) - Number(b.stock_actuel ?? 0))
    .slice(0, limit)
    .map(i => ({
      ingredient_nom: i.nom as string,
      stock_actuel: Number(i.stock_actuel ?? 0),
      unite: (i.unite as string) ?? '',
      type: Number(i.stock_actuel ?? 0) <= 0 ? 'rupture' as const : 'min' as const,
      message: Number(i.stock_actuel ?? 0) <= 0 ? 'Rupture' : `Sous minimum (${i.stock_minimum})`,
    }))
}

const CONDITIONS_INFO: Record<string, { libelle: string; emoji: string; impact: number }> = {
  ensoleille:   { libelle: 'Ensoleillé',    emoji: '☀️', impact: 10 },
  peu_nuageux:  { libelle: 'Peu nuageux',   emoji: '🌤️', impact: 5 },
  nuageux:      { libelle: 'Nuageux',       emoji: '☁️', impact: 0 },
  pluie_legere: { libelle: 'Pluie légère',  emoji: '🌦️', impact: -5 },
  pluie_forte:  { libelle: 'Pluie forte',   emoji: '🌧️', impact: -20 },
  orage:        { libelle: 'Orage',         emoji: '⛈️', impact: -25 },
  neige:        { libelle: 'Neige',         emoji: '🌨️', impact: -30 },
  brouillard:   { libelle: 'Brouillard',    emoji: '🌫️', impact: -10 },
}

// ─────────────────────────────────────────────────────────────
// Fonction principale
// ─────────────────────────────────────────────────────────────
export async function getBriefingForPoste(
  supabase: SupabaseClient,
  poste: PosteBriefing,
  options: { prenom?: string | null; date?: string } = {},
): Promise<Briefing> {
  const dateStr = options.date ?? new Date().toISOString().slice(0, 10)
  const dayStart = new Date(`${dateStr}T00:00:00`).toISOString()
  const dayEnd = new Date(`${dateStr}T23:59:59`).toISOString()
  const dans2j = new Date(); dans2j.setDate(dans2j.getDate() + 2)

  // Parallélisation : météo + plats du jour + alertes stock + DLC + (selon poste : réservations, T°, CA)
  const promesseMeteo = supabase
    .from('releves_meteo')
    .select('conditions, temperature_min, temperature_max')
    .eq('date_meteo', dateStr)
    .eq('est_prevision', true)
    .order('source')   // OWM avant manuel
    .limit(1)
    .maybeSingle()

  const promessePlats = supabase
    .from('plats_du_jour')
    .select('prix_special, description_speciale, ordre, recette:recettes(nom)')
    .eq('actif', true)
    .lte('date_debut', dateStr)
    .or(`date_fin.is.null,date_fin.gte.${dateStr}`)
    .order('ordre')

  const promesseAlertes = chargerAlertesStockPoste(supabase, poste)

  const promesseDLC = supabase
    .from('lots_produits')
    .select('lot_numero, dlc, quantite, unite, ingredient:ingredients(nom)')
    .eq('statut', 'en_stock')
    .not('dlc', 'is', null)
    .lte('dlc', dans2j.toISOString().slice(0, 10))
    .order('dlc')
    .limit(5)

  // Spécifique serveur : réservations + clients liés (allergies)
  const promesseResas = poste === 'serveur'
    ? supabase
        .from('reservations_tables')
        .select('id, client_nom, client_id, client_telephone, heure_arrivee, nb_personnes, zone, statut, notes, client:clients(allergies)')
        .eq('date_resa', dateStr)
        .not('statut', 'in', '(annulee,no_show)')
        .order('heure_arrivee')
    : Promise.resolve({ data: [] })

  // Spécifique cuisinier/pizzaiolo/barman : T° frigo du matin
  const equipementParPoste: Record<PosteBriefing, string | null> = {
    cuisinier: null,       // on prend le 1er frigo du jour
    pizzaiolo: null,
    barman: 'bar',         // match LIKE %bar%
    serveur: null,
    caisse: null,
    caisse_snacking: null,
  }
  const promesseTemp = (poste === 'cuisinier' || poste === 'pizzaiolo' || poste === 'barman')
    ? supabase
        .from('releves_temperatures')
        .select('equipement, temperature, conforme, moment, created_at, type_equipement')
        .gte('created_at', dayStart)
        .lte('created_at', dayEnd)
        .order('created_at', { ascending: false })
        .limit(20)
    : Promise.resolve({ data: [] })

  // KPI live : CA et nb commandes encaissées aujourd'hui
  const promesseCmds = (poste === 'serveur' || poste === 'barman' || poste === 'caisse' || poste === 'caisse_snacking')
    ? supabase
        .from('commandes')
        .select('montant_total_ttc, source, statut')
        .eq('statut', 'encaisse')
        .gte('created_at', dayStart)
        .lte('created_at', dayEnd)
    : Promise.resolve({ data: [] })

  const [
    meteoRes, platsRes, alertesStock, dlcRes, resasRes, tempRes, cmdsRes,
  ] = await Promise.all([
    promesseMeteo, promessePlats, promesseAlertes, promesseDLC, promesseResas, promesseTemp, promesseCmds,
  ])

  // Construction de la météo
  const meteoData = meteoRes.data as { conditions: string | null; temperature_min: number | null; temperature_max: number | null } | null
  const meteo = meteoData?.conditions ? {
    conditions: meteoData.conditions,
    temp_min: meteoData.temperature_min,
    temp_max: meteoData.temperature_max,
    impact_ca_pct: CONDITIONS_INFO[meteoData.conditions]?.impact ?? 0,
    libelle: CONDITIONS_INFO[meteoData.conditions]?.libelle ?? meteoData.conditions,
    emoji: CONDITIONS_INFO[meteoData.conditions]?.emoji ?? '·',
  } : null

  // Plats du jour
  type PlatRow = { prix_special: number | null; description_speciale: string | null; recette: { nom: string } | Array<{ nom: string }> | null }
  const platsDuJour = ((platsRes.data ?? []) as PlatRow[]).map(p => {
    const recObj = Array.isArray(p.recette) ? p.recette[0] : p.recette
    return {
      nom: recObj?.nom ?? '—',
      prix_special: p.prix_special,
      description: p.description_speciale,
    }
  })

  // DLC critiques
  type LotRow = { lot_numero: string; dlc: string; quantite: number | null; unite: string | null; ingredient: { nom: string } | Array<{ nom: string }> | null }
  const today = new Date()
  const dlcCritiques = ((dlcRes.data ?? []) as LotRow[]).map(l => {
    const ingObj = Array.isArray(l.ingredient) ? l.ingredient[0] : l.ingredient
    const j = Math.ceil((new Date(l.dlc).getTime() - today.getTime()) / 86400_000)
    return {
      nom: ingObj?.nom ?? l.lot_numero,
      quantite: Number(l.quantite ?? 0),
      unite: l.unite ?? '',
      dlc: l.dlc,
      joursRestants: j,
    }
  })

  // Réservations + allergies
  type ResaRow = {
    id: string; client_nom: string; client_id: string | null; heure_arrivee: string;
    nb_personnes: number; zone: string | null; statut: string; notes: string | null;
    client: { allergies: string[] | null } | Array<{ allergies: string[] | null }> | null
  }
  const reservations = ((resasRes.data ?? []) as ResaRow[]).map(r => {
    const cl = Array.isArray(r.client) ? r.client[0] : r.client
    return {
      id: r.id,
      client_nom: r.client_nom,
      client_id: r.client_id,
      heure_arrivee: (r.heure_arrivee as string)?.slice(0, 5) ?? '',
      nb_personnes: r.nb_personnes,
      zone: r.zone,
      allergies: cl?.allergies ?? [],
      notes: r.notes,
      statut: r.statut,
    } as ReservationBriefing
  })
  const reservationsTotalCouverts = reservations.reduce((s, r) => s + r.nb_personnes, 0)

  // Température frigo : on prend la plus récente correspondant au poste
  type TempRow = { equipement: string; temperature: number | null; conforme: boolean | null; moment: string | null; created_at: string; type_equipement: string | null }
  const tempRows = (tempRes.data ?? []) as TempRow[]
  let temperatureFrigo: Briefing['temperatureFrigo'] = null
  if (tempRows.length > 0) {
    const filtre = equipementParPoste[poste]
    const choisi = filtre
      ? tempRows.find(t => t.equipement.toLowerCase().includes(filtre.toLowerCase())) ?? tempRows[0]
      : tempRows[0]
    if (choisi && choisi.temperature !== null) {
      temperatureFrigo = {
        equipement: choisi.equipement,
        temperature: Number(choisi.temperature),
        conforme: choisi.conforme !== false,
        moment: choisi.moment ?? 'autre',
        heure: new Date(choisi.created_at).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }),
      }
    }
  }

  // KPIs CA jour
  const cmds = (cmdsRes.data ?? []) as Array<{ montant_total_ttc: number | null; source: string }>
  let cmdsFiltrees = cmds
  if (poste === 'caisse_snacking') {
    // CA snacking = commandes COMPTOIR + ONLINE
    cmdsFiltrees = cmds.filter(c => c.source === 'COMPTOIR' || c.source === 'ONLINE')
  } else if (poste === 'serveur') {
    cmdsFiltrees = cmds.filter(c => c.source === 'TABLE')
  } else if (poste === 'barman') {
    cmdsFiltrees = cmds.filter(c => c.source === 'COMPTOIR')
  }
  const caJour = cmdsFiltrees.reduce((s, c) => s + Number(c.montant_total_ttc ?? 0), 0)
  const nbCommandesJour = cmdsFiltrees.length
  const ticketMoyenJour = nbCommandesJour > 0 ? caJour / nbCommandesJour : 0

  return {
    date: dateStr,
    poste,
    prenom: options.prenom ?? null,
    meteo,
    platsDuJour,
    alertesStock,
    dlcCritiques,
    reservations: poste === 'serveur' ? reservations : undefined,
    reservationsTotalCouverts: poste === 'serveur' ? reservationsTotalCouverts : undefined,
    temperatureFrigo,
    caJour: poste === 'serveur' || poste === 'barman' || poste === 'caisse' || poste === 'caisse_snacking' ? caJour : undefined,
    nbCommandesJour: poste === 'serveur' || poste === 'barman' || poste === 'caisse' || poste === 'caisse_snacking' ? nbCommandesJour : undefined,
    ticketMoyenJour: poste === 'serveur' || poste === 'barman' || poste === 'caisse' || poste === 'caisse_snacking' ? ticketMoyenJour : undefined,
  }
}
