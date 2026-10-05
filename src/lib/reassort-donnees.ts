// Les lignes du réassort — UNE SEULE construction, deux lecteurs.
//
// ⚠️⚠️ CE MODULE EXISTE POUR QU'IL N'Y EN AIT QU'UN. `/admin/reassort` et
// l'agent Stock répondent à la même question — que faut-il commander, et
// chez qui — et ils le faisaient séparément : l'écran sur un COMPTAGE et
// des cibles (0163), l'agent sur `ingredients.stock_actuel`, le compteur
// entretenu qui dérive au premier oubli (0135).
//
// Résultat mesuré le 27/09/2026 : l'écran trouvait **126 lignes** à
// commander, l'agent **2**. Deux chiffres pour la même question, et c'est
// l'agent qu'on lit le matin. Une seconde implémentation finit toujours
// par désigner autre chose.
//
// ⚠️ Le module est SERVER-ONLY (il prend un client Supabase). Les règles
// PURES restent dans `src/lib/reassort.ts`, testables sans base.

import type { SupabaseClient } from '@supabase/supabase-js'
import { lireTout } from '@/lib/supabase/pagine'
import {
  estStockable, cleMatiere, lireFournisseur, calculerEnCommande,
  type LigneReassort, type OffreConcurrente,
} from '@/lib/reassort'
import { comparer, type LigneTarif } from '@/lib/tarifs-fournisseurs'
import { calculerEntrees, type DocEntree } from '@/lib/stock-entrees'
import {
  besoinSemaine, VOLUME_CASATASIA,
  type PlatArdoise, type LigneComposition,
} from '@/lib/ardoise'

/**
 * @param pour Date (AAAA-MM-JJ) pour laquelle on dimensionne. Défaut :
 *   aujourd'hui.
 *
 * ⚠️⚠️ ON COMMANDE POUR LA SEMAINE QU'ON VA SERVIR, PAS POUR AUJOURD'HUI.
 * Le chargeur ne lisait que l'ardoise couvrant le jour même. Mesuré le
 * 05/10/2026, à sept jours de l'ouverture : l'ardoise du 12 au 18 octobre
 * existait, elle était saisie, et les 223 cibles tombaient quand même sur
 * le repli `stock_cible` — c'est-à-dire sur la carte ENTIÈRE, le scénario
 * le plus coûteux en reliquat (231 €/semaine contre 133 €). On aurait
 * commandé la carte complète pour servir une ardoise réduite, et rien ne
 * l'aurait signalé : l'écran affichait des cibles parfaitement plausibles.
 *
 * Un réassort se lit AVANT le service, et une commande se passe plusieurs
 * jours avant la livraison : la date du jour est presque toujours la
 * mauvaise borne.
 */
export async function chargerLignesReassort(
  sb: SupabaseClient,
  pour = new Date().toISOString().slice(0, 10),
): Promise<LigneReassort[]> {
  const [produits, matieres, inventaires, etabs, ardoiseBrute, compoFiches, compoPdj, lignesDoc] = await Promise.all([
    // ⚠️ Les catégories qui ne se stockent PAS sont exclues — un sandwich
    // ou un panini s'assemble, il ne se compte pas (règle de la 0133).
    lireTout<Record<string, unknown>>(() => sb.from('recettes')
      .select('id, nom, categorie, tag_destination, etablissement_id, cout_achat_ht, unites_par_achat, nom_matiere, libelle_achat, reference_fournisseur, fournisseur_id, stock_minimum, stock_cible')
      .eq('actif', true).order('nom').order('id')),
    lireTout<Record<string, unknown>>(() => sb.from('ingredients')
      .select('id, nom, unite, categorie, prix_achat_ht, prix_estime, fournisseur_principal, reference_fournisseur, stock_minimum, stock_cible, libelle_achat')
      .eq('actif', true).eq('stocke', true).order('nom').order('id')),
    lireTout<Record<string, unknown>>(() => sb.from('inventaires')
      .select('cible_id, date_inventaire, quantite').order('date_inventaire', { ascending: false }).order('cible_id')),
    sb.from('etablissements').select('id, nom'),
    // ⚠️⚠️ L'ARDOISE DE LA SEMAINE (0167). Sans elle, le réassort commandait
    // pour les 48 plats de la carte dont deux ou trois sont servis : 62
    // ingrédients mobilisés et 231 € de périssable jeté par semaine, contre
    // 133 € sur une ardoise de quatre plats. On ne lit que ce qui couvre
    // AUJOURD'HUI — une ardoise passée ne dit plus ce qu'on sert.
    sb.from('plats_du_jour')
      .select('id, recette_id, titre, date_debut, date_fin')
      .eq('actif', true)
      .lte('date_debut', pour),
    lireTout<Record<string, unknown>>(() => sb.from('recette_ingredients')
      .select('recette_id, ingredient_id, quantite, unite').order('recette_id').order('ingredient_id')),
    lireTout<Record<string, unknown>>(() => sb.from('plat_du_jour_ingredients')
      .select('plat_du_jour_id, ingredient_id, quantite, unite').order('id')),
    // ⚠️ LES ENTRÉES. Sans elles, `tenu` restait le COMPTAGE BRUT : après la
    // livraison France Boissons du 01/10 — 2 262 € et 801 unités — l'écran
    // affichait encore le zéro du comptage d'ouverture et proposait de tout
    // recommander. Le stock théorique se CALCULE (0135), et cet écran est
    // celui qui déclenche les commandes : il doit lire la même chose que
    // `(ops)/inventaire`, sinon les deux donnent deux stocks et c'est celui
    // qu'on regarde en commandant qui fait la faute.
    lireTout<Record<string, unknown>>(() => sb.from('facture_lignes')
      .select('description, quantite, unite, facture:factures_fournisseurs(date_emission, type_document, facture_liee_id)')
      .order('id')),
  ])

  const nomE = new Map((etabs.data ?? []).map(e => [e.id as string, e.nom as string]))

  // ── CHEZ QUI COMMANDE-T-ON ? ─────────────────────────────────────────
  //
  // Un écran qui dit « il faut 10 kg de beurre » sans dire à qui l'écrire
  // ne fait pas commander. `ingredients.fournisseur_principal` répond pour
  // les matières ; les PRODUITS VENDUS, eux, n'ont aucun champ fournisseur.
  //
  // ⚠️ ON NE DEVINE PAS. Un bon parti chez le mauvais interlocuteur se
  // découvre à la livraison. Deux sources seulement, toutes deux factuelles,
  // et par ordre de force :
  //   1. une LIGNE DE FACTURE rattachée au produit — c'est une preuve d'achat ;
  //   2. la RÉFÉRENCE fournisseur du produit retrouvée au catalogue — un
  //      identifiant, donc exact (0142). C'est elle qui couvre le bar, dont
  //      aucune facture n'est encore arrivée.
  // Ce qui ne relève ni de l'une ni de l'autre reste SANS fournisseur, et
  // l'écran le montre en dernier plutôt que de l'inventer.
  const [lignesFacture, factures, catalogue, fourns] = await Promise.all([
    lireTout<Record<string, unknown>>(() => sb.from('facture_lignes')
      .select('recette_id, facture_id').not('recette_id', 'is', null).order('id')),
    lireTout<Record<string, unknown>>(() => sb.from('factures_fournisseurs')
      .select('id, fournisseur_id, type_document, date_emission').order('id')),
    lireTout<Record<string, unknown>>(() => sb.from('catalogue_fournisseur')
      .select('id, fournisseur_id, reference, designation, famille, unite, prix_ht, colis_quantite, colis_libelle, contenance_valeur, contenance_unite, cle_comparaison, ingredient_id, recette_id, date_tarif, source, nature')
      .eq('actif', true).order('id')),
    sb.from('fournisseurs').select('id, nom'),
  ])

  const nomF = new Map((fourns.data ?? []).map(f => [f.id as string, f.nom as string]))
  const idFournisseur = new Map((fourns.data ?? []).map(f => [f.nom as string, f.id as string]))
  const parId = new Map((factures).map(f => [f.id as string, f]))

  // ⚠️ Un AVOIR n'est pas un achat : c'est de la marchandise rendue. Il ne
  // désigne pas un fournisseur chez qui recommander.
  const fournisseurDeProduit = new Map<string, { id: string; nom: string; source: 'facture' | 'reference' }>()
  const dateVue = new Map<string, string>()
  for (const l of lignesFacture) {
    const f = parId.get(l.facture_id as string)
    if (!f || f.type_document === 'avoir') continue
    const rid = l.recette_id as string
    const d = (f.date_emission as string) ?? ''
    if ((dateVue.get(rid) ?? '') > d) continue       // on garde la PLUS RÉCENTE
    dateVue.set(rid, d)
    const nom = nomF.get(f.fournisseur_id as string)
    if (nom) fournisseurDeProduit.set(rid, { id: f.fournisseur_id as string, nom, source: 'facture' })
  }

  // ⚠️ LA DERNIÈRE FOIS QU'ON L'A ACHETÉ. Un prix sans date ne dit pas
  // s'il vaut encore : celui du beurre de la semaine dernière et celui
  // d'une facture de mai ne s'engagent pas de la même façon.
  const dernierAchat = new Map<string, string>()
  for (const l of lignesFacture) {
    const fa = parId.get(l.facture_id as string)
    if (!fa || fa.type_document === 'avoir') continue
    const d = (fa.date_emission as string) ?? ''
    const k = l.recette_id as string
    if (!d || (dernierAchat.get(k) ?? '') > d) continue
    dernierAchat.set(k, d)
  }
  const lignesFactureMatiere = await lireTout<Record<string, unknown>>(() => sb
    .from('facture_lignes').select('ingredient_id, facture_id')
    .not('ingredient_id', 'is', null).order('id'))
  for (const l of lignesFactureMatiere) {
    const fa = parId.get(l.facture_id as string)
    if (!fa || fa.type_document === 'avoir') continue
    const d = (fa.date_emission as string) ?? ''
    const k = l.ingredient_id as string
    if (!d || (dernierAchat.get(k) ?? '') > d) continue
    dernierAchat.set(k, d)
  }

  const parReference = new Map<string, string>()
  for (const c of catalogue) {
    const r = c.reference as string | null
    if (r && !parReference.has(r)) parReference.set(r, c.fournisseur_id as string)
  }

  // ── LE MOINS CHER AILLEURS ───────────────────────────────────────────
  //
  // ⚠️ Recalculé par `comparer()`, la MÊME fonction que /admin/achats,
  // /admin/tarifs-fournisseurs et l'agent Stock. Un min/max brut des prix
  // opposerait notre colis de 3 000 serviettes au paquet de 200 de
  // Promocash et annoncerait « −97 % » sur l'écran qui déclenche la
  // commande — c'est-à-dire au pire endroit possible.
  const pourComparer: LigneTarif[] = catalogue.map(c => ({
    ...(c as unknown as LigneTarif),
    prix_ht: c.prix_ht === null ? null : Number(c.prix_ht),
    colis_quantite: c.colis_quantite === null ? null : Number(c.colis_quantite),
    contenance_valeur: c.contenance_valeur === null ? null : Number(c.contenance_valeur),
  }))
  // Le groupe COMPLET par cible ; le tri « moins cher que nous » se fait
  // plus bas, à la construction de la ligne.
  const groupePour = new Map<string, Array<LigneTarif & { ref: { prix: number; unite: string } | null }>>()
  for (const g of comparer(pourComparer)) {
    // Deux fournisseurs distincts, et des unités qui concordent.
    //
    // ⚠️ AUCUN SEUIL D'ÉCART — décision du gérant du 28/09/2026 : « même
    // moins 1 %, un produit se change ». Un seuil de 10 % dormait ici et
    // cachait le Coca-Cola à −9 % chez Euro-Cash ; sur une caisse de 24
    // commandée chaque semaine, ces 9 % font une somme, et surtout ce
    // n'est pas au code de décider ce qui « vaut la peine d'être dit ».
    //
    // ⚠️ Les deux conditions qui RESTENT ne sont pas des seuils, ce sont
    // des garde-fous : `comparable` exige des prix ramenés à la même
    // base — sans lui, notre colis de 3 000 serviettes affrontait le
    // paquet de 200 et annonçait « −97 % » — et `fournisseurs >= 2`
    // empêche de comparer deux de nos propres références chez le même
    // vendeur. Un `ecartPct` nul signale un prix de référence à zéro :
    // aucun pourcentage ne s'y ancre.
    if (!g.comparable || g.fournisseurs < 2 || g.ecartPct == null) continue
    const best = g.lignes.find(l => l.id === g.meilleur)
    if (!best) continue
    const nom = nomF.get(best.fournisseur_id)
    if (!nom) continue

    // ⚠️ TOUTES les offres du groupe, pas seulement la meilleure. Proposer
    // uniquement le moins cher, c'est décider à la place du gérant : le
    // deuxième livre peut-être le lendemain, ou sans minimum de commande.
    const classees = g.lignes.filter(l => l.ref != null).sort((a, b) => a.ref!.prix - b.ref!.prix)

    for (const l of g.lignes) {
      for (const cible of [l.ingredient_id, l.recette_id]) {
        if (!cible) continue
        groupePour.set(cible, classees)
      }
    }
  }

  /**
   * Les offres moins chères QUE LA NÔTRE, pour une cible donnée.
   *
   * ⚠️⚠️ « MOINS CHER » SE MESURE CONTRE NOTRE LIGNE, identifiée par notre
   * fournisseur. Une première version filtrait dans la boucle sur les
   * lignes du groupe : chaque tour écrasait le précédent, et la DERNIÈRE
   * ligne — souvent la moins chère — laissait une liste VIDE. Le beurre
   * doux affichait « −30 % chez Félix Potin » dans la colonne et zéro
   * offre dans le panneau, sans qu'aucune erreur ne le signale.
   *
   * ⚠️ Et si notre fournisseur n'est pas dans le groupe, on ne propose
   * RIEN : on ne saurait pas dire de combien c'est moins cher, et un
   * pourcentage inventé est pire qu'aucun pourcentage.
   */
  const offresMoinsCheres = (cible: string | null, notreFournisseur: string | null): OffreConcurrente[] => {
    if (!cible || !notreFournisseur) return []
    const groupe = groupePour.get(cible)
    if (!groupe) return []
    const mien = groupe.find(o => nomF.get(o.fournisseur_id) === notreFournisseur)?.ref?.prix
    if (mien == null || mien <= 0) return []
    return groupe
      .filter(o => nomF.get(o.fournisseur_id) !== notreFournisseur && o.ref!.prix < mien)
      .map(o => ({
        fournisseur_id: o.fournisseur_id,
        fournisseur: nomF.get(o.fournisseur_id) ?? '—',
        designation: o.designation,
        reference: o.reference ?? null,
        prix_ref: o.ref!.prix,
        unite_ref: o.ref!.unite,
        prix: o.prix_ht,
        unite: o.unite,
        nature: o.nature,
        ecartPct: (1 - o.ref!.prix / mien) * 100,
      }))
  }

  // ⚠️ Le comptage qui fait foi est le PLUS RÉCENT. Les lignes arrivent
  // triées par date décroissante : la première vue gagne.
  const dernier = new Map<string, { q: number; le: string }>()
  for (const i of inventaires) {
    const k = i.cible_id as string
    if (!dernier.has(k)) dernier.set(k, { q: Number(i.quantite), le: i.date_inventaire as string })
  }

  // ══ Entrées depuis le dernier comptage ══════════════════════════════
  // ⚠️ UNE SEULE IMPLÉMENTATION, partagée avec `(ops)/inventaire` : deux
  // écrans qui calculent le stock chacun de leur côté finissent par afficher
  // deux chiffres, et personne ne sait lequel croire.
  const docs = lignesDoc as unknown as DocEntree[]

  const lignes: LigneReassort[] = []

  // ⚠️ On COMPTE la matière, pas le produit vendu : le congélateur contient
  // des pâtons, pas « Pizza Reine » (0132). Le regroupement est ce qui
  // empêche de commander deux fois le même fût sous deux noms de boisson.
  const groupes = new Map<string, Record<string, unknown>[]>()
  // ─── CE QUE L'ARDOISE DE LA SEMAINE RÉCLAME ────────────────────────
  //
  // ⚠️⚠️ POUR LA RESTAURATION, LA CIBLE NE SE STOCKE PAS, ELLE SE CALCULE.
  // Stockée, elle deviendrait fausse le lundi suivant — l'ardoise change et
  // rien ne l'aurait signalé. Même doctrine que le stock théorique (0135) :
  // ce qui dépend d'autre chose se recalcule à la lecture.
  //
  // ⚠️ REPLI : pas d'ardoise posée → on garde `stock_cible`. Ce repli est
  // dimensionné sur la carte ENTIÈRE, donc sur le scénario le plus coûteux
  // en casse (231 €/semaine contre 133 €) — l'écran DOIT le dire, sinon on
  // croit commander juste. Et surtout on ne propose pas zéro : à huit jours
  // de l'ouverture, un réassort muet empêcherait de commander.
  const ardoise = (ardoiseBrute.data ?? []).filter(
    (a: Record<string, unknown>) => !a.date_fin || (a.date_fin as string) >= pour,
  )
  const besoinArdoise = new Map<string, number>()
  if (ardoise.length > 0) {
    const parRecette = new Map<string, LigneComposition[]>()
    for (const l of compoFiches) {
      const k = l.recette_id as string
      if (!parRecette.has(k)) parRecette.set(k, [])
      parRecette.get(k)!.push({
        ingredient_id: l.ingredient_id as string,
        quantite: Number(l.quantite ?? 0),
        unite: (l.unite as string) ?? '',
      })
    }
    // ⚠️ La composition d'un PLAT DU JOUR est attachée à l'OCCURRENCE, pas au
    // produit : `recette_ingredients` n'en porte qu'une par produit et ne
    // saurait pas décrire sept plats différents sur le même `recette_id`.
    const parOccurrence = new Map<string, LigneComposition[]>()
    for (const l of compoPdj) {
      const k = l.plat_du_jour_id as string
      if (!parOccurrence.has(k)) parOccurrence.set(k, [])
      parOccurrence.get(k)!.push({
        ingredient_id: l.ingredient_id as string,
        quantite: Number(l.quantite ?? 0),
        unite: (l.unite as string) ?? '',
      })
    }
    const parProduit = new Map(produits.map(x => [x.id as string, x]))
    const plats: PlatArdoise[] = []
    for (const a of ardoise as Array<Record<string, unknown>>) {
      const prod = parProduit.get(a.recette_id as string)
      const propre = parOccurrence.get(a.id as string)
      // La composition du jour l'emporte ; à défaut, la fiche du produit.
      const composition = propre ?? parRecette.get(a.recette_id as string)
      if (!composition || composition.length === 0) continue
      plats.push({
        id: a.id as string,
        nom: (a.titre as string) ?? (prod?.nom as string) ?? '—',
        carte: prod?.tag_destination === 'PIZZA' ? 'PIZZA' : 'CUISINE',
        composition,
      })
    }
    for (const [id, q] of besoinSemaine(plats, VOLUME_CASATASIA)) besoinArdoise.set(id, q)
  }

  // ⚠️⚠️ CE QUI APPARTIENT À LA RESTAURATION, ET SEULEMENT ELLE.
  //
  // Sans cet ensemble, une ardoise de pizzas laissait les ingrédients de
  // brasserie retomber sur leur `stock_cible` — donc on continuait à les
  // acheter, et tout l'objet de l'ardoise tombait. Un ingrédient dont le
  // plat n'est pas à la carte cette semaine doit valoir ZÉRO, pas « comme
  // avant ».
  //
  // ⚠️ Mais seulement ceux-là : le Fournil et le bar ne passent pas par
  // l'ardoise, leur cible est un niveau décidé. Les mettre à zéro parce
  // qu'aucune pizza ne les utilise viderait le réassort des deux tiers de
  // la maison.
  const matieresResto = new Set<string>()
  {
    const estResto = new Set(
      produits.filter(x => nomE.get(x.etablissement_id as string) === 'Restauration')
        .map(x => x.id as string),
    )
    for (const l of compoFiches) {
      if (estResto.has(l.recette_id as string)) matieresResto.add(l.ingredient_id as string)
    }
    for (const l of compoPdj) matieresResto.add(l.ingredient_id as string)
  }
  const ardoisePosee = ardoise.length > 0
  /**
   * La cible d'une matière, une fois l'ardoise prise en compte.
   *
   * ⚠️ Arrondi AU-DESSUS : on n'achète pas 0,4 kg de roquette, on achète le
   * kilo. Arrondir au plus près ferait manquer la dernière portion.
   */
  const cibleMatiere = (id: string, stockee: number | null): { cible: number | null; origine: 'ardoise' | 'stock' } => {
    if (besoinArdoise.has(id)) return { cible: Math.ceil(besoinArdoise.get(id)! * 100) / 100, origine: 'ardoise' }
    if (ardoisePosee && matieresResto.has(id)) return { cible: 0, origine: 'ardoise' }
    return { cible: stockee, origine: 'stock' }
  }

  for (const p of produits) {
    if (!estStockable({
      nom: p.nom as string,
      categorie: (p.categorie as string) ?? null,
      tag_destination: (p.tag_destination as string) ?? null,
      nom_matiere: (p.nom_matiere as string) ?? null,
    })) continue
    const k = cleMatiere(p as { nom: string; nom_matiere?: string | null; libelle_achat?: string | null })
    if (!groupes.has(k)) groupes.set(k, [])
    groupes.get(k)!.push(p)
  }

  // ⚠️ TOUTES LES CIBLES D'ABORD, UN SEUL CALCUL ENSUITE. Appeler le calcul
  // par groupe ferait scanner chaque ligne autant de fois qu'il y a de
  // groupes — et surtout, chacun gagnerait de son côté : c'est précisément
  // ainsi que les 96 Fanta entraient dans trois stocks. Le plus long gagne,
  // et il ne peut gagner que s'ils concourent ensemble.
  // ⚠️⚠️ CE QUI EST DÉJÀ COMMANDÉ ET PAS ENCORE REÇU. Sans ça l'écran
  // redemande ce qu'on vient de commander : mesuré le 05/10/2026, le
  // gérant venait de commander 150 pâtons et on lui en réclamait 280.
  const bonsLignes = await lireTout<Record<string, unknown>>(() => sb
    .from('bon_commande_lignes')
    .select('ingredient_id, recette_id, quantite_commandee, quantite_recue, bons_commande!inner(statut)')
    .order('id'))
  const { parCle: enRoute, sansCible: enRouteSansCible } = calculerEnCommande(
    bonsLignes.map(l => ({
      statut: ((l.bons_commande as { statut?: string } | null)?.statut) ?? '',
      ingredient_id: (l.ingredient_id as string) ?? null,
      recette_id: (l.recette_id as string) ?? null,
      quantite_commandee: l.quantite_commandee == null ? null : Number(l.quantite_commandee),
      quantite_recue: l.quantite_recue == null ? null : Number(l.quantite_recue),
    })))
  if (enRouteSansCible > 0) {
    // ⚠️ DIT, jamais tu : ces lignes-là ne peuvent rien déduire, et une
    // commande invisible fait arriver un camion qu'on n'attendait pas.
    console.warn(`[reassort] ${enRouteSansCible} ligne(s) de commande en route sans cible identifiée — non déduites.`)
  }

  const cibles: Array<{ cle: string; libelle: string }> = []
  for (const [nom, membres] of groupes) {
    const p = membres.slice().sort((a, b) => ((a.id as string) < (b.id as string) ? -1 : 1))[0]
    cibles.push({ cle: p.id as string, libelle: ((p.libelle_achat as string) ?? '').trim() || nom })
  }
  for (const m of matieres) {
    cibles.push({ cle: `ing:${m.id}`, libelle: ((m.libelle_achat as string) ?? '').trim() || (m.nom as string) })
  }
  // ⚠️ Le comptage de référence diffère par ligne : on calcule les entrées
  // depuis la date la plus ANCIENNE des comptages retenus, puis on ne garde
  // pour chaque cible que ce qui suit SON propre comptage. Un seul passage
  // suffit parce que la date est filtrée cible par cible juste après.
  const parDepuis = new Map<string, Map<string, number>>()
  const entreesDe = (cle: string, depuis: string | null) => {
    if (!depuis) return 0
    if (!parDepuis.has(depuis)) parDepuis.set(depuis, calculerEntrees(docs, cibles, depuis))
    return parDepuis.get(depuis)!.get(cle) ?? 0
  }

  for (const [nom, membres] of groupes) {
    // Un représentant STABLE porte la ligne : le premier par id, comme à
    // l'inventaire. Sans stabilité, la cible saisie change de porteur au
    // rechargement et paraît s'être effacée.
    const p = membres.slice().sort((a, b) => ((a.id as string) < (b.id as string) ? -1 : 1))[0]
    const d = dernier.get(p.id as string)
    const parAchat = Number(p.unites_par_achat ?? 1) || 1
    const cout = p.cout_achat_ht == null ? null : Number(p.cout_achat_ht) * parAchat
    lignes.push({
      cle: p.id as string,
      nom,
      categorie: (p.categorie as string) ?? null,
      etablissement: nomE.get(p.etablissement_id as string) ?? null,
      unite: 'unité d’achat',
      // stock théorique = comptage + entrées. Les SORTIES ne sont pas
      // déduites ici : elles le sont à l'inventaire, où la caisse les donne
      // produit par produit. En surestimer serait moins grave que l'inverse
      // pour une commande — mais c'est une limite, pas un choix de confort.
      tenu: d ? d.q + entreesDe(p.id as string, d.le) : null,
      compte: d ? d.q : null,
      entrees: d ? entreesDe(p.id as string, d.le) : 0,
      compte_le: d ? d.le : null,
      seuil: p.stock_minimum == null ? null : Number(p.stock_minimum),
      // Un PRODUIT revendu ne passe pas par l'ardoise : il n'a pas de
      // composition, c'est lui qu'on achète. Sa cible reste un niveau décidé.
      cible: p.stock_cible == null ? null : Number(p.stock_cible),
      cible_origine: 'stock' as const,
      enCommande: enRoute.get(p.id as string) ?? 0,
      cout_unitaire_ht: cout,
      ...(() => {
        // Le groupe partage une matière : n'importe lequel de ses membres
        // peut porter la preuve d'achat. `find` sur le premier qui répond.
        // ⚠️ `recettes.fournisseur_id` (0164) est une DÉCISION POSÉE, donc
        // plus forte que toute déduction : elle prime. Les deux chemins
        // qui suivent restent pour les produits qu'aucun script n'a
        // encore rattachés.
        const pose = membres.map(m => m.fournisseur_id as string | null).find(Boolean)
        if (pose && nomF.get(pose)) {
          return { fournisseur: nomF.get(pose)!, fournisseur_id: pose, source_fournisseur: 'fiche' as const }
        }
        const parFacture = membres.map(m => fournisseurDeProduit.get(m.id as string)).find(Boolean)
        if (parFacture) return { fournisseur: parFacture.nom, fournisseur_id: parFacture.id, source_fournisseur: 'facture' as const }
        const ref = membres.map(m => m.reference_fournisseur as string | null).find(Boolean)
        const fid = ref ? parReference.get(ref) : undefined
        if (fid && nomF.get(fid)) return { fournisseur: nomF.get(fid)!, fournisseur_id: fid, source_fournisseur: 'reference' as const }
        return { fournisseur: null, fournisseur_id: null, source_fournisseur: null }
      })(),
      cible_id: p.id as string,
      ...(() => {
        const fid = membres.map(m => m.fournisseur_id as string | null).find(Boolean)
        const nomNotre = fid ? nomF.get(fid) ?? null : null
        const o = membres.map(m => offresMoinsCheres(m.id as string, nomNotre)).find(x => x.length) ?? []
        return {
          offres: o,
          ailleurs: o.length
            ? { fournisseur_id: o[0].fournisseur_id, fournisseur: o[0].fournisseur, ecartPct: o[0].ecartPct }
            : null,
        }
      })(),
      // ⚠️ Un seul produit sous ce libellé → on peut afficher son nom de
      // vitrine. Plusieurs → c'est le libellé d'achat qui fait foi.
      nom_vente: membres.length === 1 && (p.nom as string) !== nom ? (p.nom as string) : null,
      reference: (membres.map(m => m.reference_fournisseur as string | null).find(Boolean)) ?? null,
      dernier_achat: membres.map(m => dernierAchat.get(m.id as string)).find(Boolean) ?? null,
    })
  }

  for (const m of matieres) {
    const d = dernier.get(m.id as string)
    const f = lireFournisseur(m.fournisseur_principal as string | null)
    const offresMatiere = offresMoinsCheres(m.id as string, f.nom)
    lignes.push({
      cle: `ing:${m.id as string}`,
      nom: m.nom as string,
      // ⚠️ LA VRAIE CATÉGORIE, pas un fourre-tout. « Matières premières »
      // regroupait les 93 matières en un seul bloc : sur la plateforme
      // d'achat, elles tombaient toutes dans le rayon « Autres » — 93 sur
      // 193, c'est-à-dire la moitié du catalogue invisible au classement.
      // Le fait qu'une ligne SOIT une matière se lit déjà au préfixe
      // `ing:` de sa clé ; l'écrire une seconde fois dans la catégorie
      // coûtait le rangement.
      categorie: (m.categorie as string) ?? 'Matières premières',
      etablissement: null,
      unite: (m.unite as string) ?? null,
      // ⚠️⚠️ `stock_actuel` N'EST PAS UN COMPTAGE, et on ne s'en sert PAS.
      // C'est un compteur entretenu par les mouvements : il dérive au
      // premier oubli, et la doctrine du projet est claire depuis la 0135
      // — « un stock auquel personne ne croit ne sert à rien ». L'afficher
      // ici ferait passer 46 références pour comptées alors que la maison
      // est fermée et que le stock est à zéro. Seul un comptage fait foi.
      // Les entrées s'y ajoutent comme pour les produits : une matière
      // livrée après le comptage est bien en réserve.
      tenu: d ? d.q + entreesDe(`ing:${m.id}`, d.le) : null,
      compte: d ? d.q : null,
      entrees: d ? entreesDe(`ing:${m.id}`, d.le) : 0,
      compte_le: d ? d.le : null,
      seuil: m.stock_minimum == null ? null : Number(m.stock_minimum),
      // ⚠️⚠️ L'ARDOISE L'EMPORTE SUR LA COLONNE — et une matière de la
      // restauration dont le plat n'y est pas tombe à ZÉRO, pas sur son
      // ancienne cible. C'est tout l'objet : on cesse de l'acheter sans que
      // personne ait à y penser.
      cible: cibleMatiere(m.id as string, m.stock_cible == null ? null : Number(m.stock_cible)).cible,
      cible_origine: cibleMatiere(m.id as string, null).origine,
      enCommande: enRoute.get(`ing:${m.id as string}`) ?? 0,
      cout_unitaire_ht: m.prix_achat_ht == null ? null : Number(m.prix_achat_ht),
      fournisseur: f.nom,
      // ⚠️ `prix_estime` (0165) est la SOURCE DE VÉRITÉ. Le marqueur vivait
      // dans le texte libre `fournisseur_principal` (« ESTIMATION … ») et
      // a été effacé le jour où on y a écrit le vrai fournisseur : 24
      // matières dont le prix est une hypothèse se sont mises à ressembler
      // à des prix relevés. Le repli sur le texte reste pour les lignes
      // que la 0165 n'aurait pas couvertes.
      estime: m.prix_estime === undefined ? f.estime : Boolean(m.prix_estime),
      // ⚠️ `fournisseur_principal` est une FICHE saisie à la main, pas une
      // preuve d'achat : la source est dite, pour qu'on sache quoi croire.
      source_fournisseur: f.nom ? ('fiche' as const) : null,
      fournisseur_id: f.nom ? (idFournisseur.get(f.nom) ?? null) : null,
      cible_id: m.id as string,
      // ⚠️ L'ÉCART DE LA COLONNE EST CELUI DE LA MEILLEURE OFFRE, pas
      // l'amplitude du groupe. Les deux se ressemblent et ne disent pas la
      // même chose : le groupe du beurre s'étale de 30 % entre nous et
      // Félix Potin, mais de 43 % entre ses extrêmes. La colonne annonçait
      // donc −43 % quand le panneau proposait −30 %, et c'est le genre
      // d'écart qui fait douter des deux chiffres.
      ailleurs: offresMatiere.length
        ? { fournisseur_id: offresMatiere[0].fournisseur_id, fournisseur: offresMatiere[0].fournisseur, ecartPct: offresMatiere[0].ecartPct }
        : null,
      offres: offresMatiere,
      reference: (m.reference_fournisseur as string) ?? null,
      dernier_achat: dernierAchat.get(m.id as string) ?? null,
    })
  }

  // Une seule ligne par matière achetée : les produits qui partagent un
  // `libelle_achat` se replient, comme à l'inventaire et à la commande
  // conseillée (0131).
  const replie = new Map<string, LigneReassort>()
  for (const l of lignes) {
    const k = `${l.categorie ?? ''}|${l.nom.toLowerCase()}`
    const vu = replie.get(k)
    if (!vu) { replie.set(k, l); continue }
    // ⚠️ `(null ?? 0) + (null ?? 0)` vaut ZÉRO, et transformait « jamais
    // compté » en « compté à zéro » — précisément la confusion que tout
    // cet écran s'applique à éviter. On n'additionne que s'il y a au
    // moins un comptage ; sinon l'inconnu reste inconnu.
    if (vu.tenu !== null || l.tenu !== null) vu.tenu = (vu.tenu ?? 0) + (l.tenu ?? 0)
    if (!vu.compte_le && l.compte_le) vu.compte_le = l.compte_le
  }

  return [...replie.values()]
}
