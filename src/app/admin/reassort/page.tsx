// Réassort — le stock, les seuils, et ce qu'il faut commander.
//
// L'écran qui manquait entre `(ops)/inventaire` (ce qu'on a compté),
// `/admin/achats` (chez qui, à quel prix) et les bons de commande. Sans
// lui, les trois existaient sans se parler.

import { createClient } from '@/lib/supabase/server'
import { lireTout } from '@/lib/supabase/pagine'
import { estStockable, cleMatiere, lireFournisseur, type LigneReassort } from '@/lib/reassort'
import { comparer, type LigneTarif } from '@/lib/tarifs-fournisseurs'
import ReassortClient from './ReassortClient'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Réassort' }

export default async function ReassortPage() {
  const sb = await createClient()

  const [produits, matieres, inventaires, etabs] = await Promise.all([
    // ⚠️ Les catégories qui ne se stockent PAS sont exclues — un sandwich
    // ou un panini s'assemble, il ne se compte pas (règle de la 0133).
    lireTout<Record<string, unknown>>(() => sb.from('recettes')
      .select('id, nom, categorie, tag_destination, etablissement_id, cout_achat_ht, unites_par_achat, nom_matiere, libelle_achat, reference_fournisseur, fournisseur_id, stock_minimum, stock_cible')
      .eq('actif', true).order('nom').order('id')),
    lireTout<Record<string, unknown>>(() => sb.from('ingredients')
      .select('id, nom, unite, prix_achat_ht, fournisseur_principal, stock_minimum, stock_cible')
      .eq('actif', true).eq('stocke', true).order('nom').order('id')),
    lireTout<Record<string, unknown>>(() => sb.from('inventaires')
      .select('cible_id, date_inventaire, quantite').order('date_inventaire', { ascending: false }).order('cible_id')),
    sb.from('etablissements').select('id, nom'),
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
  const meilleurPour = new Map<string, { fournisseur_id: string; fournisseur: string; ecartPct: number }>()
  for (const g of comparer(pourComparer)) {
    // Deux fournisseurs distincts, des unités qui concordent, et un écart
    // qui vaut la peine d'être dit. Sous 10 %, c'est du bruit d'emballage.
    if (!g.comparable || g.fournisseurs < 2 || g.ecartPct == null || g.ecartPct < 10) continue
    const best = g.lignes.find(l => l.id === g.meilleur)
    if (!best) continue
    const nom = nomF.get(best.fournisseur_id)
    if (!nom) continue
    for (const l of g.lignes) {
      for (const cible of [l.ingredient_id, l.recette_id]) {
        if (cible) meilleurPour.set(cible, { fournisseur_id: best.fournisseur_id, fournisseur: nom, ecartPct: g.ecartPct })
      }
    }
  }

  // ⚠️ Le comptage qui fait foi est le PLUS RÉCENT. Les lignes arrivent
  // triées par date décroissante : la première vue gagne.
  const dernier = new Map<string, { q: number; le: string }>()
  for (const i of inventaires) {
    const k = i.cible_id as string
    if (!dernier.has(k)) dernier.set(k, { q: Number(i.quantite), le: i.date_inventaire as string })
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
      tenu: d ? d.q : null,
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
      ailleurs: membres.map(m => meilleurPour.get(m.id as string)).find(Boolean) ?? null,
    })
  }

  for (const m of matieres) {
    const d = dernier.get(m.id as string)
    const f = lireFournisseur(m.fournisseur_principal as string | null)
    lignes.push({
      cle: `ing:${m.id as string}`,
      nom: m.nom as string,
      categorie: 'Matières premières',
      etablissement: null,
      unite: (m.unite as string) ?? null,
      // ⚠️⚠️ `stock_actuel` N'EST PAS UN COMPTAGE, et on ne s'en sert PAS.
      // C'est un compteur entretenu par les mouvements : il dérive au
      // premier oubli, et la doctrine du projet est claire depuis la 0135
      // — « un stock auquel personne ne croit ne sert à rien ». L'afficher
      // ici ferait passer 46 références pour comptées alors que la maison
      // est fermée et que le stock est à zéro. Seul un comptage fait foi.
      tenu: d ? d.q : null,
      compte_le: d ? d.le : null,
      seuil: m.stock_minimum == null ? null : Number(m.stock_minimum),
      cible: m.stock_cible == null ? null : Number(m.stock_cible),
      cout_unitaire_ht: m.prix_achat_ht == null ? null : Number(m.prix_achat_ht),
      fournisseur: f.nom,
      estime: f.estime,
      // ⚠️ `fournisseur_principal` est une FICHE saisie à la main, pas une
      // preuve d'achat : la source est dite, pour qu'on sache quoi croire.
      source_fournisseur: f.nom ? ('fiche' as const) : null,
      fournisseur_id: f.nom ? (idFournisseur.get(f.nom) ?? null) : null,
      cible_id: m.id as string,
      ailleurs: meilleurPour.get(m.id as string) ?? null,
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

  return <ReassortClient lignes={[...replie.values()]} />
}
