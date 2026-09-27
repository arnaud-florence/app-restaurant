// ─── Agent 3 — Gestionnaire de stock ───────────────────────────
// Cron : toutes les 2 heures.
//
// Tâches :
//   (1) Prédit les ruptures à J+3 (conso moy 30j × stock actuel)
//   (2) Alerte stock minimum dépassé
//   (3) Génère des bons de commande EN BROUILLON groupés par fournisseur
//       (1 BC par fournisseur, regroupe tous ses ingrédients à racheter)
//   (4) Compare prix sur 90j entre fournisseurs → suggère switch si économie > 10%
//   (5) Alerte DLC proche (J+0, J+1, J+2) sur les lots reçus
//
// Anti-spam : avant chaque emitFinding, dédup par (type, ingredient_id) pour
// ne pas créer 12× le même finding par jour (cron toutes les 2h).
// Anti-doublon BC : si un brouillon agent existe < 6h pour ce fournisseur, on skip.
//
// Auth : Bearer CRON_SECRET. Manuel : GET /api/cron/agents/stock

import { NextResponse } from 'next/server'
import { runAgent, emitFinding, authCron, type AgentContext } from '@/lib/agents/runner'
import { comparer, prixReference, type LigneTarif } from '@/lib/tarifs-fournisseurs'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

const NOTE_AGENT_BC = '🤖 Bon de commande généré automatiquement par l\'Agent Stock'
const JOURS_AVANT_RUPTURE_CRITIQUE = 3

export async function GET(req: Request) {
  try { authCron(req) } catch { return new NextResponse('Unauthorized', { status: 401 }) }

  const result = await runAgent('stock', async (ctx) => {
    // (A) Charge tous les ingrédients actifs + leurs 2 fournisseurs
    const { data: ingredients } = await ctx.supabase
      .from('ingredients')
      .select('id, nom, unite, prix_achat_ht, stock_actuel, stock_minimum, stock_maximum, fournisseur_principal, fournisseur_secondaire')
      .eq('actif', true)
    if (!ingredients || ingredients.length === 0) {
      return {
        summary: 'Aucun ingrédient actif',
        data: { nbIngredients: 0, nbRuptures: 0, nbAlerteMin: 0, bonsCreated: 0, bonsDetails: [], compares: [], dlcAlertes: 0 },
      }
    }
    type Ing = (typeof ingredients)[number]

    // (B) Charge tous les fournisseurs actifs (la colonne `fournisseur_principal`
    // sur ingredients est un TEXTE libre — nom du fournisseur — pas un UUID).
    // On matche par nom exact (ou insensible casse).
    const { data: fournisseurs } = await ctx.supabase
      .from('fournisseurs')
      .select('id, nom, delai_livraison_jours, minimum_commande')
      .eq('actif', true)
    // Map nom (lowercase trimmed) → infos fournisseur (avec son id réel)
    const fournisseurParNom = new Map<string, { id: string; nom: string; delai: number; minCmd: number }>()
    for (const f of (fournisseurs ?? [])) {
      const key = (f.nom as string).toLowerCase().trim()
      fournisseurParNom.set(key, {
        id: f.id as string,
        nom: f.nom as string,
        delai: Number(f.delai_livraison_jours ?? 1),
        minCmd: Number(f.minimum_commande ?? 0),
      })
    }
    function trouverFournisseur(nom: string | null): { id: string; nom: string; delai: number; minCmd: number } | null {
      if (!nom) return null
      return fournisseurParNom.get(nom.toLowerCase().trim()) ?? null
    }

    // (C) Consommation moyenne 30j par ingrédient (sorties uniquement)
    const trente = new Date()
    trente.setDate(trente.getDate() - 30)
    const { data: sorties } = await ctx.supabase
      .from('mouvements_stock')
      .select('ingredient_id, quantite, type')
      .eq('type', 'sortie')
      .gte('created_at', trente.toISOString())
    const consoParIngredient = new Map<string, number>()  // total sortie / 30 jours
    for (const m of (sorties ?? []) as Array<{ ingredient_id: string | null; quantite: number | null }>) {
      if (!m.ingredient_id) continue
      consoParIngredient.set(m.ingredient_id, (consoParIngredient.get(m.ingredient_id) ?? 0) + Math.abs(Number(m.quantite ?? 0)))
    }

    // (D) Pour chaque ingrédient : calcule jours_avant_rupture + classifie
    type BesoinAchat = { ing: Ing; quantite: number; jours_restants: number; urgence: 'rouge' | 'jaune' }
    const besoinsParFournisseur = new Map<string, BesoinAchat[]>()
    let nbRuptures = 0
    let nbAlerteMin = 0

    for (const ing of ingredients) {
      const stock = Number(ing.stock_actuel ?? 0)
      const conso30j = consoParIngredient.get(ing.id as string) ?? 0
      const consoJour = conso30j / 30
      const joursRestants = consoJour > 0 ? stock / consoJour : 999

      const enRupture = joursRestants <= JOURS_AVANT_RUPTURE_CRITIQUE && consoJour > 0
      const enAlerteMin = stock <= Number(ing.stock_minimum ?? 0)

      if (!enRupture && !enAlerteMin) continue   // ingrédient sain → skip

      const urgence: 'rouge' | 'jaune' = enRupture ? 'rouge' : 'jaune'
      if (enRupture) nbRuptures++
      else nbAlerteMin++

      // Finding individuel (avec dédup sur ingredient_id non résolu)
      const dejaEmis = await findingDejaActif(ctx, enRupture ? 'rupture_stock' : 'stock_minimum', { ingredient_id: ing.id })
      if (!dejaEmis) {
        const dateRupture = consoJour > 0 ? new Date(Date.now() + joursRestants * 86400_000) : null
        await emitFinding(ctx, {
          urgence,
          type: enRupture ? 'rupture_stock' : 'stock_minimum',
          titre: enRupture
            ? `${ing.nom} : rupture prévue ${dateRupture ? formatJour(dateRupture) : ''}`
            : `${ing.nom} : stock sous le minimum (${stock} ${ing.unite ?? ''})`,
          message: `Conso moyenne : ${consoJour.toFixed(1)} ${ing.unite ?? ''}/jour · Stock actuel : ${stock} ${ing.unite ?? ''} · ${enRupture ? `Épuisement dans ${Math.max(0, joursRestants).toFixed(1)} jour(s)` : `Minimum : ${ing.stock_minimum} ${ing.unite ?? ''}`}`,
          action_label: 'Voir le stock',
          action_url:   '/admin/stock',
          data: { ingredient_id: ing.id, nom: ing.nom, stock, conso_jour: consoJour, jours_restants: joursRestants },
        })
      }

      // Calcule la quantité à commander : amener au stock_max (ou si pas défini, conso 14 jours)
      const stockMax = Number(ing.stock_maximum ?? 0)
      const cible = stockMax > 0 ? stockMax : consoJour * 14
      const aCommander = Math.max(0, Math.ceil(cible - stock))

      const fourn = trouverFournisseur(ing.fournisseur_principal as string | null)
      if (fourn && aCommander > 0) {
        const list = besoinsParFournisseur.get(fourn.id) ?? []
        list.push({ ing, quantite: aCommander, jours_restants: joursRestants, urgence })
        besoinsParFournisseur.set(fourn.id, list)
      }
    }

    // (E) Génère bons de commande EN BROUILLON, 1 par fournisseur
    const six_h = new Date(Date.now() - 6 * 3600_000).toISOString()
    let bonsCreated = 0
    // ── Purge des propositions périmées ─────────────────────────────
    // L'agent propose un brouillon par fournisseur toutes les 6 h. Sans
    // ménage, ils s'empilent : 1 816 avaient été accumulés en trois mois,
    // au point de bloquer la suppression d'un fournisseur (contrainte de
    // clé étrangère). Un brouillon d'agent que personne n'a ouvert en une
    // semaine est une proposition morte — les besoins ont changé depuis.
    // On ne touche QUE ce que l'agent a écrit et que personne n'a validé :
    // statut brouillon, notes signées « Agent Stock », rien de réceptionné.
    try {
      const il7j = new Date(Date.now() - 7 * 86_400_000).toISOString()
      const { data: perimes } = await ctx.supabase
        .from('bons_commande')
        .select('id')
        .eq('statut', 'brouillon')
        .ilike('notes', '%Agent Stock%')
        .lt('created_at', il7j)
        .limit(500)
      const idsPerimes = (perimes ?? []).map(b => b.id as string)
      if (idsPerimes.length > 0) {
        await ctx.supabase.from('bon_commande_lignes').delete().in('bon_commande_id', idsPerimes)
        await ctx.supabase.from('bons_commande').delete().in('id', idsPerimes)
      }
    } catch { /* le ménage ne doit jamais faire échouer l'agent */ }

    const bonsDetails: Array<{ fournisseur: string; nb_lignes: number; montant: number; bc_id: string }> = []
    for (const [fournId, lignes] of besoinsParFournisseur) {
      const fournInfo = [...fournisseurParNom.values()].find(f => f.id === fournId)
      if (!fournInfo) continue

      // Skip si un BC agent existe déjà < 6h pour ce fournisseur (anti-doublon)
      const { data: bcExistants } = await ctx.supabase
        .from('bons_commande')
        .select('id, notes, created_at')
        .eq('fournisseur_id', fournId)
        .eq('statut', 'brouillon')
        .gte('created_at', six_h)
        .ilike('notes', '%Agent Stock%')
      if (bcExistants && bcExistants.length > 0) continue

      // Calcule date livraison prévue = today + délai fournisseur
      const dateLiv = new Date()
      dateLiv.setDate(dateLiv.getDate() + fournInfo.delai)

      // Montant total HT estimé
      const montantHt = lignes.reduce((s, l) => s + l.quantite * Number(l.ing.prix_achat_ht ?? 0), 0)

      // Si minimum commande non atteint → ajoute une note mais crée quand même
      const minNonAtteint = montantHt < fournInfo.minCmd
      const notes = [
        NOTE_AGENT_BC,
        `${lignes.length} ingrédient(s) à racheter`,
        lignes.filter(l => l.urgence === 'rouge').length > 0 ? `dont ${lignes.filter(l => l.urgence === 'rouge').length} en rupture imminente` : null,
        minNonAtteint ? `⚠ Sous le minimum commande (${fournInfo.minCmd.toFixed(2)}€)` : null,
      ].filter(Boolean).join(' · ')

      const { data: bc, error: bcErr } = await ctx.supabase.from('bons_commande').insert({
        fournisseur_id: fournId,
        statut: 'brouillon',
        date_commande: new Date().toISOString().slice(0, 10),
        date_livraison_prevue: dateLiv.toISOString().slice(0, 10),
        montant_total_ht: Math.round(montantHt * 100) / 100,
        notes,
      }).select('id').single()
      if (bcErr || !bc) continue

      // Insère les lignes
      const lignesPayload = lignes.map(l => ({
        bon_commande_id: bc.id,
        ingredient_id:   l.ing.id,
        quantite_commandee: l.quantite,
        prix_unitaire_ht: Number(l.ing.prix_achat_ht ?? 0),
      }))
      await ctx.supabase.from('bon_commande_lignes').insert(lignesPayload)

      bonsCreated++
      bonsDetails.push({ fournisseur: fournInfo.nom, nb_lignes: lignes.length, montant: montantHt, bc_id: bc.id as string })

      // Finding (avec dédup sur ce fournisseur)
      const urgenceBc: 'rouge' | 'jaune' = lignes.some(l => l.urgence === 'rouge') ? 'rouge' : 'jaune'
      await emitFinding(ctx, {
        urgence: urgenceBc,
        type: 'bon_commande_brouillon',
        titre: `Bon de commande ${fournInfo.nom} prêt à valider`,
        message: `${lignes.length} produit(s) · ${montantHt.toFixed(2)}€ HT · Livraison prévue ${formatJour(dateLiv)}${minNonAtteint ? ' · ⚠ Sous le minimum commande' : ''}`,
        action_label: 'Voir le bon',
        action_url:   `/admin/fournisseurs`,
        data: { bon_commande_id: bc.id, fournisseur_id: fournId, fournisseur: fournInfo.nom, montant: montantHt, lignes: lignes.length },
      })
    }

    // (F) Comparateur de prix, sur le CATALOGUE des fournisseurs
    const compares = await comparerPrixFournisseurs(ctx)

    // (G) DLC proche : check bon_commande_lignes.dlc_observee
    const dlcAlertes = await detecterDlcProche(ctx)

    // Résumé
    const summary = [
      nbRuptures > 0 ? `${nbRuptures} rupture${nbRuptures > 1 ? 's' : ''} imminente${nbRuptures > 1 ? 's' : ''}` : null,
      nbAlerteMin > 0 ? `${nbAlerteMin} alerte${nbAlerteMin > 1 ? 's' : ''} stock min` : null,
      bonsCreated > 0 ? `${bonsCreated} bon${bonsCreated > 1 ? 's' : ''} commande à valider` : null,
      compares.length > 0 ? `${compares.length} économie${compares.length > 1 ? 's' : ''} détectée${compares.length > 1 ? 's' : ''}` : null,
      dlcAlertes > 0 ? `${dlcAlertes} DLC proche` : null,
    ].filter(Boolean).join(' · ')

    return {
      summary: summary || `${ingredients.length} ingrédients OK`,
      data: { nbIngredients: ingredients.length, nbRuptures, nbAlerteMin, bonsCreated, bonsDetails, compares, dlcAlertes },
    }
  })

  return NextResponse.json(result)
}

export const POST = GET

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────

async function findingDejaActif(ctx: AgentContext, type: string, data: Record<string, string | null>): Promise<boolean> {
  // Construit le filtre JSONB sur la 1ère clé fournie (suffit pour la dédup)
  const [key, val] = Object.entries(data)[0] ?? []
  if (!key || !val) return false
  const jsonPath = `data->>${key}` as unknown as 'id'
  const { count } = await ctx.supabase
    .from('agent_findings')
    .select('*', { count: 'exact', head: true })
    .eq('agent_id', ctx.agentId)
    .eq('type', type)
    .eq('resolu', false)
    .eq(jsonPath, val)
  return (count ?? 0) > 0
}

function formatJour(d: Date): string {
  const JOURS = ['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam']
  const aujourdhui = new Date()
  const demain = new Date(); demain.setDate(demain.getDate() + 1)
  if (d.toDateString() === aujourdhui.toDateString()) return "aujourd'hui"
  if (d.toDateString() === demain.toDateString()) return 'demain'
  return `${JOURS[d.getDay()]} ${d.getDate()}/${d.getMonth() + 1}`
}

/**
 * Où acheter moins cher — sur les TARIFS, plus sur nos entrées de stock.
 *
 * ⚠️ L'ancienne version moyennait `mouvements_stock` sur 90 jours et
 * regroupait par NOM DE FOURNISSEUR EN TEXTE LIBRE. Elle ignorait donc
 * `catalogue_fournisseur` — soit, depuis le 26/09/2026, 3 303 tarifs dont
 * 503 confirmés. Elle ne pouvait rien dire d'un fournisseur chez qui on
 * n'avait encore rien acheté, ce qui est justement la question.
 *
 * ⚠️ TOUTE la discipline de comparaison est REPRISE de
 * `lib/tarifs-fournisseurs.ts`, pas réécrite : ramener à l'unité, exiger
 * la même base, refuser les formats qui ne concordent pas. Une seconde
 * implémentation finirait par désigner un « moins cher » que l'écran ne
 * montre pas — et c'est l'écran que le gérant croira.
 */
async function comparerPrixFournisseurs(
  ctx: AgentContext,
): Promise<Array<{ ingredient: string; fournActuel: string; fournAlternatif: string; economiePct: number }>> {
  // ⚠️ PostgREST plafonne à 1 000 lignes SANS le dire. Le catalogue en compte
  // plus de 3 300 : sans pagination, l'agent comparerait un tiers des tarifs
  // et annoncerait un « moins cher » choisi dedans.
  const lignes: LigneTarif[] = []
  for (let de = 0; de < 20000; de += 1000) {
    const { data } = await ctx.supabase
      .from('catalogue_fournisseur')
      .select('id, fournisseur_id, reference, designation, famille, unite, prix_ht, colis_quantite, colis_libelle, contenance_valeur, contenance_unite, cle_comparaison, ingredient_id, recette_id, date_tarif, source, nature, achete')
      .eq('actif', true)
      .not('cle_comparaison', 'is', null)
      // ⚠️ Tri sur une colonne UNIQUE : sans lui la pagination saute et
      // duplique des lignes, et le « moins cher » change d'un passage à
      // l'autre sans qu'aucune erreur ne le signale.
      .order('id')
      .range(de, de + 999)
    const lot = data ?? []
    for (const l of lot) {
      lignes.push({
        ...(l as unknown as LigneTarif),
        // ⚠️ `Number(null)` vaut ZÉRO : un « prix sur demande » sortirait
        // le moins cher de tout le catalogue.
        prix_ht: l.prix_ht === null ? null : Number(l.prix_ht),
        colis_quantite: l.colis_quantite === null ? null : Number(l.colis_quantite),
        contenance_valeur: l.contenance_valeur === null ? null : Number(l.contenance_valeur),
      })
    }
    if (lot.length < 1000) break
  }
  if (!lignes.length) return []

  const { data: fourns } = await ctx.supabase.from('fournisseurs').select('id, nom')
  const nomF = new Map((fourns ?? []).map(f => [f.id as string, f.nom as string]))

  const out: Array<{ ingredient: string; fournActuel: string; fournAlternatif: string; economiePct: number }> = []

  for (const g of comparer(lignes)) {
    // ⚠️ Trois conditions, et chacune écarte un faux positif :
    //   · `comparable` — toutes les lignes ramenées à la MÊME base, sinon on
    //     compare une poche de 600 g à une poche d'un kilo ;
    //   · deux fournisseurs DISTINCTS — sinon on compare deux de nos propres
    //     références chez le même vendeur ;
    //   · un écart franc — sous 10 %, c'est du bruit de conditionnement.
    if (!g.comparable || g.fournisseurs < 2 || (g.ecartPct ?? 0) < 10) continue

    const chiffrees = g.lignes.filter(l => l.ref)
    const tri = [...chiffrees].sort((a, b) => a.ref!.prix - b.ref!.prix)
    const moinsCher = tri[0]

    // ⚠️ Ce qu'on achète DÉJÀ : une ligne tirée d'une facture (un prix
    // réellement payé) ou marquée « Mes articles » au portail. Sans ce
    // repère, l'agent crierait « moins cher ailleurs » alors qu'on y est
    // déjà — et on cesserait de le lire.
    const incumbent = chiffrees.find(l => l.nature === 'facture' || (l as { achete?: boolean }).achete)
    if (!incumbent) continue
    if (incumbent.id === moinsCher.id) continue

    const economiePct = ((incumbent.ref!.prix - moinsCher.ref!.prix) / incumbent.ref!.prix) * 100
    if (economiePct < 10) continue

    const nomActuel = nomF.get(incumbent.fournisseur_id) ?? '—'
    const nomAlt = nomF.get(moinsCher.fournisseur_id) ?? '—'
    if (nomActuel === nomAlt) continue

    const dejaEmis = await findingDejaActif(ctx, 'comparaison_fournisseur', { cle: g.cle })
    if (!dejaEmis) {
      const u = moinsCher.ref!.unite
      // ⚠️ La NATURE de chaque prix est dite. Un devis est une PROPOSITION —
      // il peut être un tarif d'appel consenti pour emporter un client ;
      // une facture est une preuve. Arbitrer un fournisseur sur le premier
      // en croyant lire le second se paie pendant des mois (0152).
      const nature = (n: string) => n === 'facture' ? 'payé' : n === 'portail' ? 'tarif portail' : 'devis'
      await emitFinding(ctx, {
        urgence: 'jaune',
        type: 'comparaison_fournisseur',
        titre: `${g.cle} : ${economiePct.toFixed(0)} % moins cher chez ${nomAlt}`,
        message: `${nomActuel} : ${incumbent.ref!.prix.toFixed(3)} €/${u} (${nature(incumbent.nature)}). `
          + `${nomAlt} : ${moinsCher.ref!.prix.toFixed(3)} €/${u} (${nature(moinsCher.nature)}). `
          + `⚠️ Un devis est une proposition, pas une preuve de prix — et l'écart ne décide de rien tant qu'il n'est pas multiplié par les quantités réelles.`,
        action_label: 'Comparer les tarifs',
        action_url: '/admin/tarifs-fournisseurs',
        data: { cle: g.cle, fournActuel: nomActuel, fournAlternatif: nomAlt, economiePct },
      })
    }
    out.push({ ingredient: g.cle, fournActuel: nomActuel, fournAlternatif: nomAlt, economiePct })
  }
  return out
}

// Détecte les DLC proches via bon_commande_lignes.dlc_observee (lots réceptionnés)
async function detecterDlcProche(ctx: AgentContext): Promise<number> {
  const today = new Date()
  const dans2j = new Date()
  dans2j.setDate(dans2j.getDate() + 2)
  const { data } = await ctx.supabase
    .from('bon_commande_lignes')
    .select('id, ingredient_id, quantite_recue, dlc_observee, ingredient:ingredients(nom)')
    .not('dlc_observee', 'is', null)
    .gte('dlc_observee', today.toISOString().slice(0, 10))
    .lte('dlc_observee', dans2j.toISOString().slice(0, 10))

  let nb = 0
  type LigneDlc = { id: string; ingredient_id: string; quantite_recue: number | null; dlc_observee: string; ingredient: { nom: string } | Array<{ nom: string }> | null }
  for (const ligne of (data ?? []) as LigneDlc[]) {
    if (!ligne.quantite_recue || Number(ligne.quantite_recue) <= 0) continue
    const dlc = new Date(ligne.dlc_observee)
    const jours = Math.ceil((dlc.getTime() - today.getTime()) / 86400_000)
    const urgence: 'rouge' | 'jaune' = jours <= 1 ? 'rouge' : 'jaune'
    // Supabase peut renvoyer ingredient comme tableau ou objet selon le typage du join
    const ingObj = Array.isArray(ligne.ingredient) ? ligne.ingredient[0] : ligne.ingredient
    const nom = ingObj?.nom ?? 'Ingrédient'

    const dejaEmis = await findingDejaActif(ctx, 'dlc_proche', { ligne_id: ligne.id })
    if (dejaEmis) { nb++; continue }

    await emitFinding(ctx, {
      urgence,
      type: 'dlc_proche',
      titre: `DLC proche : ${nom} (${formatJour(dlc)})`,
      message: `${ligne.quantite_recue} unités reçues, DLC le ${dlc.toLocaleDateString('fr-FR')}. À utiliser en priorité (plat du jour ?).`,
      action_label: 'Voir le lot',
      action_url:   '/admin/hygiene',
      data: { ligne_id: ligne.id, ingredient_id: ligne.ingredient_id, nom, dlc: ligne.dlc_observee, quantite: ligne.quantite_recue },
    })
    nb++
  }
  return nb
}
