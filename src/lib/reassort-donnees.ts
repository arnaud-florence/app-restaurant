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
  estStockable, cleMatiere, lireFournisseur,
  type LigneReassort, type OffreConcurrente,
} from '@/lib/reassort'
import { comparer, type LigneTarif } from '@/lib/tarifs-fournisseurs'
import { extraireConditionnement } from '@/lib/commande-fournisseur'

export async function chargerLignesReassort(sb: SupabaseClient): Promise<LigneReassort[]> {
  const [produits, matieres, inventaires, etabs, lignesDoc] = await Promise.all([
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
  // Même règle que `(ops)/inventaire`, au mot près : on cherche le libellé
  // du fournisseur DANS la description de la ligne, le BL fait foi sur la
  // facture qui lui est rattachée (0166), un avoir compte en négatif, et une
  // ligne au colis se multiplie par son conditionnement.
  const norm = (x: string) => x.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim()
  type Doc = { date_emission?: string; type_document?: string; facture_liee_id?: string | null }
  const docs = lignesDoc as unknown as Array<{
    description: string; quantite: number | string | null; unite: string | null; facture: Doc | null }>
  const entreesDepuis = (cible: string, depuis: string | null) => {
    // ⚠️ Pas de comptage, pas d'entrées : une livraison seule ne dit pas un
    // stock, elle dit un mouvement. « Jamais compté » doit le rester (0163).
    if (!depuis) return 0
    const c = norm(cible)
    if (c.length < 4) return 0
    let recu = 0
    for (const l of docs) {
      const f = l.facture
      if (!f?.date_emission || f.date_emission <= depuis) continue
      if (f.type_document === 'facture' && f.facture_liee_id) continue
      if (!norm(l.description).includes(c)) continue
      const q = Number(l.quantite ?? 0)
      const cond = extraireConditionnement(l.description)
      const estPiece = /^(pce|pi[eè]ce|piece|p|u)s?$/.test(String(l.unite ?? '').toLowerCase())
      recu += (f.type_document === 'avoir' ? -1 : 1) * (estPiece || cond == null ? q : q * cond)
    }
    return Math.round(recu * 100) / 100
  }

  const lignes: LigneReassort[] = []

  // ⚠️ On COMPTE la matière, pas le produit vendu : le congélateur contient
  // des pâtons, pas « Pizza Reine » (0132). Le regroupement est ce qui
  // empêche de commander deux fois le même fût sous deux noms de boisson.
  const groupes = new Map<string, Record<string, unknown>[]>()
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
      tenu: d ? d.q + entreesDepuis((p.libelle_achat as string) ?? nom, d.le) : null,
      compte: d ? d.q : null,
      entrees: d ? entreesDepuis((p.libelle_achat as string) ?? nom, d.le) : 0,
      compte_le: d ? d.le : null,
      seuil: p.stock_minimum == null ? null : Number(p.stock_minimum),
      cible: p.stock_cible == null ? null : Number(p.stock_cible),
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
      tenu: d ? d.q + entreesDepuis((m.libelle_achat as string) ?? (m.nom as string), d.le) : null,
      compte: d ? d.q : null,
      entrees: d ? entreesDepuis((m.libelle_achat as string) ?? (m.nom as string), d.le) : 0,
      compte_le: d ? d.le : null,
      seuil: m.stock_minimum == null ? null : Number(m.stock_minimum),
      cible: m.stock_cible == null ? null : Number(m.stock_cible),
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
