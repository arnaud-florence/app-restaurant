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
import { chargerLignesReassort } from '@/lib/reassort-donnees'
import { lignesCommandables, comptagePerime, sansComptagePerime, etat as etatReassort } from '@/lib/reassort'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

const NOTE_AGENT_BC = '🤖 Bon de commande généré automatiquement par l\'Agent Stock'
const JOURS_AVANT_RUPTURE_CRITIQUE = 3

export async function GET(req: Request) {
  try { authCron(req) } catch { return new NextResponse('Unauthorized', { status: 401 }) }

  const result = await runAgent('stock', async (ctx) => {
    // (A) Charge tous les ingrédients actifs + leurs 2 fournisseurs
    // ⚠️ Le périmètre de l'agent est le RÉASSORT (produits ET matières),
    // plus la seule table `ingredients` : une table vide ne veut plus dire
    // « rien à faire ». Le modèle du Fournil est l'achat-revente — on
    // commande des croissants et des fûts, pas des matières.

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

    // ⚠️ La consommation moyenne sur 30 jours a disparu avec
    // `stock_actuel` : elle se calculait sur `mouvements_stock`, alimenté
    // par le même compteur qui dérive. La quantité vient désormais de la
    // CIBLE (0163), posée à partir des ventes réelles ou des fiches
    // techniques — c'est-à-dire d'une décision, pas d'une extrapolation.

    // (D) ⚠️⚠️ CE QU'IL FAUT COMMANDER VIENT DU RÉASSORT, PAS DE
    // `stock_actuel`. L'agent lisait le compteur entretenu à chaque
    // mouvement — celui qui dérive au premier oubli (café offert, saisie
    // manquée, ticket non remonté) et auquel « personne ne croit » (0135).
    // Mesuré le 27/09/2026 : il trouvait **2 lignes** à commander là où
    // `/admin/reassort` en trouvait **126**. Deux chiffres pour la même
    // question, et c'est l'agent qu'on lit le matin.
    //
    // Il lit désormais EXACTEMENT les mêmes lignes que l'écran —
    // `chargerLignesReassort()` : dernier COMPTAGE (périmé au-delà de
    // 30 jours), seuil et cible (0163), fournisseur déduit de faits, et le
    // moins cher quand la comparaison tient.
    // ⚠️ `sansComptagePerime()` est la MÊME fonction que l'écran. Sans
    // elle, l'agent lisait les comptages du 24 août comme du stock et
    // voyait 31 références « au niveau » dans une maison fermée.
    const lignesR = sansComptagePerime(await chargerLignesReassort(ctx.supabase))

    // ⚠️ RÈGLE DU GÉRANT : on commande au moins cher. Même appel que
    // l'écran, donc même arbitrage — une seconde règle finirait par
    // envoyer le bon ailleurs.
    const { prets, sansFournisseur } = lignesCommandables(lignesR, true)

    type BesoinAchat = {
      ligne: (typeof prets)[number]
      urgence: 'rouge' | 'jaune'
    }
    const besoinsParFournisseur = new Map<string, BesoinAchat[]>()
    let nbRuptures = 0
    let nbAlerteMin = 0

    const enRupture: string[] = []
    const sousSeuil: string[] = []
    for (const l of lignesR) {
      if (etatReassort(l) !== 'a_commander') continue
      // ⚠️ « Jamais compté » et « compté il y a deux mois » ne sont pas un
      // stock : c'est une rupture tant que personne n'a regardé.
      const inconnu = l.tenu === null || comptagePerime(l)
      if (inconnu || (l.tenu ?? 0) <= 0) { nbRuptures++; enRupture.push(l.nom) }
      else { nbAlerteMin++; sousSeuil.push(l.nom) }
    }

    // ⚠️ UNE ALERTE GROUPÉE, PAS CENT VINGT-SIX. L'agent émettait un
    // finding PAR ingrédient : sur un stock d'ouverture à zéro, ça fait
    // 126 lignes rouges d'un coup, et un tableau de bord illisible n'est
    // pas lu — donc il ne protège plus de rien (même leçon que le test
    // rouge en permanence). Le détail est sur `/admin/reassort`, qui est
    // fait pour ça ; l'agent dit COMBIEN et renvoie là-bas.
    if (nbRuptures > 0 && !(await findingDejaActif(ctx, 'rupture_stock', {}))) {
      await emitFinding(ctx, {
        urgence: 'rouge',
        type: 'rupture_stock',
        titre: `${nbRuptures} référence(s) à zéro ou jamais comptées`,
        message: `${enRupture.slice(0, 10).join(', ')}${enRupture.length > 10 ? `… et ${enRupture.length - 10} autre(s)` : ''}. `
          + `⚠️ Un comptage de plus de 30 jours ne décrit plus le stock : il est traité comme inconnu, pas comme un stock plein.`,
        action_label: 'Voir le réassort',
        action_url: '/admin/reassort',
        data: { nb: nbRuptures },
      })
    }
    if (nbAlerteMin > 0 && !(await findingDejaActif(ctx, 'stock_minimum', {}))) {
      await emitFinding(ctx, {
        urgence: 'jaune',
        type: 'stock_minimum',
        titre: `${nbAlerteMin} référence(s) sous leur seuil`,
        message: `${sousSeuil.slice(0, 10).join(', ')}${sousSeuil.length > 10 ? `… et ${sousSeuil.length - 10} autre(s)` : ''}.`,
        action_label: 'Voir le réassort',
        action_url: '/admin/reassort',
        data: { nb: nbAlerteMin },
      })
    }

    for (const l of prets) {
      const inconnu = l.tenu === null || comptagePerime(l)
      besoinsParFournisseur.set(l.retenu.id, [
        ...(besoinsParFournisseur.get(l.retenu.id) ?? []),
        { ligne: l, urgence: (inconnu || (l.tenu ?? 0) <= 0) ? 'rouge' : 'jaune' },
      ])
    }

    // ⚠️ Ce qu'on NE PEUT PAS commander est REMONTÉ, pas perdu : sans ça
    // l'agent annoncerait une commande complète alors qu'il manque un
    // morceau, et personne n'irait chercher pourquoi.
    if (sansFournisseur.length) {
      const dejaEmis = await findingDejaActif(ctx, 'stock_sans_fournisseur', {})
      if (!dejaEmis) {
        await emitFinding(ctx, {
          urgence: 'jaune',
          type: 'stock_sans_fournisseur',
          titre: `${sansFournisseur.length} référence(s) à commander sans fournisseur connu`,
          message: `Elles sont écartées des bons de commande — on ne peut écrire à personne. `
            + `Exemples : ${sansFournisseur.slice(0, 6).map(l => l.nom).join(', ')}`
            + `${sansFournisseur.length > 6 ? '…' : ''}. `
            + `⚠️ Un fournisseur ne se devine pas : un bon parti chez le mauvais interlocuteur se découvre à la livraison.`,
          action_label: 'Voir le réassort',
          action_url: '/admin/reassort',
          data: { nb: sansFournisseur.length },
        })
      }
    }

    // Le comparateur tourne pour SIGNALER les écarts ; le réaiguillage,
    // lui, est déjà fait par `lignesCommandables()` ci-dessus.
    const compares = await comparerPrixFournisseurs(ctx)

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
    // ⚠️ Ce qu'on n'a PAS créé se dit : sans ça on croit cinq bons créés et on
    // n'en trouve que trois, sans savoir pourquoi.
    const bonsIgnores: string[] = []

    // ⚠️⚠️ L'AGENT NE CRÉE PLUS DE BONS DE COMMANDE — décision du gérant,
    // 04/10/2026 : « enlève-moi toutes ces estimations de BDC, elles servent
    // à rien ». 153 brouillons s'étaient accumulés, bâtis sur des prix
    // ESTIMÉS : 56 des 62 références restauration n'ont jamais été facturées.
    // Un bon chiffré sur une hypothèse n'est pas une commande, c'est un
    // brouillon de plus à trier.
    //
    // ⚠️ CE QUI RESTE EST L'ESSENTIEL : l'agent compte toujours ce qu'il faut
    // commander et le DIT. C'est l'alerte qui a de la valeur, pas le document
    // — et le document se crée en un clic depuis `/admin/reassort`, où le
    // gérant voit les quantités, les prix et chez qui basculer avant de
    // s'engager. La commande redevient un geste délibéré, comme l'envoi l'est
    // déjà depuis la 0160.
    //
    // Pour rétablir la création automatique : repasser AGENT_CREE_LES_BONS à
    // true. Rien d'autre n'a été retiré.
    const AGENT_CREE_LES_BONS = false
    // ⚠️ On garde le type de `besoinsParFournisseur` en vidant la boucle
    // plutôt qu'en la remplaçant par une Map nue : un `new Map()` sans type
    // fait perdre l'inférence et casse la compilation plus bas.
    for (const [fournId, lignes] of besoinsParFournisseur) {
      if (!AGENT_CREE_LES_BONS) break
      const fournInfo = [...fournisseurParNom.values()].find(f => f.id === fournId)
      if (!fournInfo) continue

      // ⚠️⚠️ UN BROUILLON NON ENVOYÉ BLOQUE, QUEL QUE SOIT SON ÂGE.
      // La fenêtre de 6 h laissait l'agent — qui tourne toutes les 2 h —
      // recréer le MÊME brouillon indéfiniment tant que le besoin n'était pas
      // traité. Mesuré le 04/10 : six bons identiques en deux jours pour UNE
      // ligne de 0,9 kg d'oignons, et rien ne les arrêtait — au 12 octobre il
      // y en aurait eu une quarantaine. Un écran de bons de commande illisible
      // n'est plus lu, donc il ne protège plus de rien (même leçon que le test
      // rouge en permanence).
      //
      // Un brouillon JAMAIS ENVOYÉ dit que le besoin n'est pas traité : en
      // ajouter un second n'apprend rien. Dès qu'il part, `statut` quitte
      // « brouillon » et l'agent peut de nouveau proposer.
      const { data: bcExistants } = await ctx.supabase
        .from('bons_commande')
        .select('id, notes, created_at')
        .eq('fournisseur_id', fournId)
        .eq('statut', 'brouillon')
        .is('envoye_le', null)
        .ilike('notes', '%Agent Stock%')
      if (bcExistants && bcExistants.length > 0) { bonsIgnores.push(fournInfo.nom); continue }

      // Calcule date livraison prévue = today + délai fournisseur
      const dateLiv = new Date()
      dateLiv.setDate(dateLiv.getDate() + fournInfo.delai)

      // ⚠️⚠️ UNE LIGNE BASCULÉE N'A PAS DE PRIX. Notre coût est celui de
      // NOTRE conditionnement, pas du leur : les convertir écrirait un faux
      // prix sur un document qui engage de l'argent, et un faux prix ne se
      // signale pas — il se découvre à la facture.
      const prixLigne = (b: BesoinAchat): number | null => b.ligne.prix

      // ⚠️ ET LE TOTAL NON PLUS. Sommer des NULL donnerait 0,00 € sur un bon
      // de douze lignes, et un zéro se lit « gratuit » — la faute de
      // `statutFoodCost(0)`. Un montant inconnu reste NULL.
      const chiffrees = lignes.filter(l => prixLigne(l) != null)
      const montantHt = chiffrees.reduce((s, b) => s + b.ligne.quantite * (prixLigne(b) ?? 0), 0)
      const montantConnu = chiffrees.length > 0

      // Si minimum commande non atteint → ajoute une note mais crée quand même
      // ⚠️ Un minimum de commande ne se contrôle que sur un montant CONNU :
      // sur un bon sans prix, l'annoncer « sous le minimum » serait faux.
      const minNonAtteint = montantConnu && montantHt < fournInfo.minCmd
      const notes = [
        NOTE_AGENT_BC,
        `${lignes.length} ingrédient(s) à racheter`,
        lignes.filter(l => l.urgence === 'rouge').length > 0 ? `dont ${lignes.filter(l => l.urgence === 'rouge').length} en rupture imminente` : null,
        minNonAtteint ? `⚠ Sous le minimum commande (${fournInfo.minCmd.toFixed(2)}€)` : null,
        // ⚠️ RÈGLE DU GÉRANT : on commande au moins cher. Les lignes qui
        // ARRIVENT ici depuis un autre fournisseur le disent en toutes
        // lettres — sans ça, on recevrait un bon d'un fournisseur chez qui
        // on n'a jamais commandé sans comprendre pourquoi.
        ...(() => {
          const venues = lignes.filter(b => b.ligne.retenu.bascule)
          if (!venues.length) return []
          const top = [...venues].sort((a, b) => (b.ligne.ailleurs?.ecartPct ?? 0) - (a.ligne.ailleurs?.ecartPct ?? 0))[0]
          return [`↪ ${venues.length} ligne(s) réaiguillée(s) ici car moins chères `
            + `(jusqu'à −${(top.ligne.ailleurs?.ecartPct ?? 0).toFixed(0)} % vs ${top.ligne.fournisseur ?? 'notre fournisseur'})`
            + ` · tarif à confirmer : notre conditionnement n'est pas le leur`]
        })(),
      ].filter(Boolean).join(' · ')

      const { data: bc, error: bcErr } = await ctx.supabase.from('bons_commande').insert({
        fournisseur_id: fournId,
        statut: 'brouillon',
        date_commande: new Date().toISOString().slice(0, 10),
        date_livraison_prevue: dateLiv.toISOString().slice(0, 10),
        montant_total_ht: montantConnu ? Math.round(montantHt * 100) / 100 : null,
        notes,
      }).select('id').single()
      if (bcErr || !bc) continue

      // Insère les lignes
      // ⚠️ Une ligne vise SOIT une matière SOIT un produit vendu : la clé
      // porte le préfixe `ing:` pour la première (0133). Se tromper de
      // colonne écrirait la commande sur un objet qui n'existe pas.
      const lignesPayload = lignes.map(b => ({
        bon_commande_id: bc.id,
        ingredient_id: b.ligne.cle.startsWith('ing:') ? b.ligne.cle.slice(4) : null,
        recette_id:    b.ligne.cle.startsWith('ing:') ? null : b.ligne.cle,
        libelle: b.ligne.nom,
        unite: b.ligne.unite ?? 'unité',
        quantite_commandee: b.ligne.quantite,
        prix_unitaire_ht: prixLigne(b),
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
      // ⚠️ Le périmètre du bilan est celui du RÉASSORT, pas la table des
      // ingrédients : il couvre aussi les produits vendus (croissants,
      // fûts), que le modèle achat-revente fait commander tels quels.
      summary: summary || `${lignesR.length} référence(s) au niveau`,
      data: {
        nbReferences: lignesR.length,
        nbRuptures, nbAlerteMin, bonsCreated, bonsDetails,
        // ⚠️ Les fournisseurs pour lesquels un brouillon attendait déjà. Les
        // taire ferait croire que l'agent n'a rien trouvé à commander chez eux.
        bonsIgnores,
        compares, dlcAlertes, sansFournisseur: sansFournisseur.length,
      } as Record<string, unknown>,
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
): Promise<Array<{
  ingredient: string; fournActuel: string; fournAlternatif: string; economiePct: number
  /** ⚠️ L'identifiant, pas le nom : c'est lui qui permet de RÉAIGUILLER le
   *  bon. Se contenter du nom obligeait à le rapprocher ensuite, et un
   *  rapprochement par le nom est exactement ce que le projet évite. */
  fournAlternatifId: string
  /** Les matières concernées par ce groupe de comparaison. */
  ingredientIds: string[]
}>> {
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

  // ── CHEZ QUI ON ACHÈTE AUJOURD'HUI ───────────────────────────────────
  //
  // ⚠️⚠️ SANS CECI, L'AGENT CRIE SUR DES ÉCONOMIES DÉJÀ PRISES. Mesuré le
  // 28/09/2026 : 13 de ses 17 trouvailles disaient « Gineys → Félix Potin »
  // alors que la matière était PASSÉE chez Félix Potin depuis. Il lisait le
  // fournisseur sur la ligne de FACTURE — c'est-à-dire un fait du passé, pas
  // notre fournisseur actuel — et un écran qui redemande ce qui est fait
  // cesse d'être lu, ce qui coûte les quatre trouvailles qui, elles, sont
  // vraies.
  //
  // L'ordre est donc : notre fournisseur ENREGISTRÉ d'abord, la facture
  // ensuite. La facture reste le repli — beaucoup de matières n'ont pas
  // encore de fournisseur attitré, et sans elle on ne comparerait rien.
  const notreFournisseur = new Map<string, string>()   // cible → fournisseur_id
  const { data: ingsF } = await ctx.supabase
    .from('ingredients').select('id, fournisseur_principal').eq('actif', true)
  const idParNom = new Map([...nomF].map(([id, n]) => [n, id]))
  for (const i of ingsF ?? []) {
    const id = idParNom.get((i.fournisseur_principal ?? '') as string)
    if (id) notreFournisseur.set(i.id as string, id)
  }
  for (let de = 0; de < 20000; de += 1000) {
    const { data } = await ctx.supabase
      .from('recettes').select('id, fournisseur_id')
      .not('fournisseur_id', 'is', null).order('id').range(de, de + 999)
    for (const r of data ?? []) notreFournisseur.set(r.id as string, r.fournisseur_id as string)
    if ((data ?? []).length < 1000) break
  }

  const out: Array<{
    ingredient: string; fournActuel: string; fournAlternatif: string; economiePct: number
    fournAlternatifId: string; ingredientIds: string[]
  }> = []

  for (const g of comparer(lignes)) {
    // ⚠️ Deux conditions, et chacune écarte un faux positif :
    //   · `comparable` — toutes les lignes ramenées à la MÊME base, sinon on
    //     compare une poche de 600 g à une poche d'un kilo ;
    //   · deux fournisseurs DISTINCTS — sinon on compare deux de nos propres
    //     références chez le même vendeur.
    //
    // ⚠️ IL N'Y A PLUS DE SEUIL D'ÉCART — décision du gérant du 28/09/2026 :
    // « même moins 1 %, un produit se change ». Les 10 % qui dormaient ici
    // taisaient le Coca-Cola à −9 % chez Euro-Cash. Ce sont deux choses
    // différentes : un écart qu'on ne sait pas MESURER (unités qui ne
    // concordent pas) est un faux positif et reste écarté ; un écart petit
    // mais MESURÉ est une information, et c'est le gérant qui décide s'il
    // vaut un changement de fournisseur.
    if (!g.comparable || g.fournisseurs < 2 || g.ecartPct == null) continue

    const chiffrees = g.lignes.filter(l => l.ref)
    const tri = [...chiffrees].sort((a, b) => a.ref!.prix - b.ref!.prix)
    const moinsCher = tri[0]

    // ⚠️ Ce qu'on achète DÉJÀ. D'abord le fournisseur ENREGISTRÉ sur la
    // matière ou le produit — c'est la décision en vigueur. À défaut, une
    // ligne tirée d'une facture (un prix réellement payé) ou marquée « Mes
    // articles » au portail. Sans ce repère, l'agent crierait « moins cher
    // ailleurs » alors qu'on y est déjà — et on cesserait de le lire.
    //
    // ⚠️ La résolution se fait au niveau du GROUPE, pas de la ligne. La
    // ligne qui porte notre cible est presque toujours celle de la
    // FACTURE — un devis reçu par mail n'est rattaché à rien. Chercher
    // « la ligne dont la cible désigne son propre fournisseur » ne
    // trouvait donc jamais le nouveau : le Coca restait « Promocash →
    // Euro-Cash » alors qu'on achète chez Euro-Cash depuis.
    let notreF: string | null = null
    for (const l of g.lignes) {
      for (const cible of [l.ingredient_id, l.recette_id]) {
        const f = cible ? notreFournisseur.get(cible) : undefined
        if (f) { notreF = f; break }
      }
      if (notreF) break
    }
    const incumbent = (notreF ? chiffrees.find(l => l.fournisseur_id === notreF) : undefined)
      ?? chiffrees.find(l => l.nature === 'facture' || (l as { achete?: boolean }).achete)
    if (!incumbent) continue
    if (incumbent.id === moinsCher.id) continue

    // Strictement moins cher, rien de plus : à égalité de prix il n'y a
    // pas d'économie, et « 0 % moins cher » n'est pas une alerte.
    const economiePct = ((incumbent.ref!.prix - moinsCher.ref!.prix) / incumbent.ref!.prix) * 100
    if (economiePct <= 0) continue

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
        titre: `${g.cle} : ${economiePct.toFixed(economiePct < 10 ? 1 : 0)} % moins cher chez ${nomAlt}`,
        message: `${nomActuel} : ${incumbent.ref!.prix.toFixed(3)} €/${u} (${nature(incumbent.nature)}). `
          + `${nomAlt} : ${moinsCher.ref!.prix.toFixed(3)} €/${u} (${nature(moinsCher.nature)}). `
          + `⚠️ Un devis est une proposition, pas une preuve de prix — et l'écart ne décide de rien tant qu'il n'est pas multiplié par les quantités réelles.`,
        action_label: 'Comparer les tarifs',
        action_url: '/admin/tarifs-fournisseurs',
        data: { cle: g.cle, fournActuel: nomActuel, fournAlternatif: nomAlt, economiePct },
      })
    }
    out.push({
      ingredient: g.cle, fournActuel: nomActuel, fournAlternatif: nomAlt, economiePct,
      fournAlternatifId: moinsCher.fournisseur_id,
      ingredientIds: [...new Set(g.lignes.map(l => l.ingredient_id).filter((x): x is string => !!x))],
    })
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
