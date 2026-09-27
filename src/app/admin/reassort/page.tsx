// Réassort — le stock, les seuils, et ce qu'il faut commander.
//
// L'écran qui manquait entre `(ops)/inventaire` (ce qu'on a compté),
// `/admin/achats` (chez qui, à quel prix) et les bons de commande. Sans
// lui, les trois existaient sans se parler.

import { createClient } from '@/lib/supabase/server'
import { lireTout } from '@/lib/supabase/pagine'
import { estStockable, cleMatiere, lireFournisseur, type LigneReassort } from '@/lib/reassort'
import ReassortClient from './ReassortClient'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Réassort' }

export default async function ReassortPage() {
  const sb = await createClient()

  const [produits, matieres, inventaires, etabs] = await Promise.all([
    // ⚠️ Les catégories qui ne se stockent PAS sont exclues — un sandwich
    // ou un panini s'assemble, il ne se compte pas (règle de la 0133).
    lireTout<Record<string, unknown>>(() => sb.from('recettes')
      .select('id, nom, categorie, tag_destination, etablissement_id, cout_achat_ht, unites_par_achat, nom_matiere, libelle_achat, stock_minimum, stock_cible')
      .eq('actif', true).order('nom').order('id')),
    lireTout<Record<string, unknown>>(() => sb.from('ingredients')
      .select('id, nom, unite, prix_achat_ht, fournisseur_principal, stock_minimum, stock_cible')
      .eq('actif', true).eq('stocke', true).order('nom').order('id')),
    lireTout<Record<string, unknown>>(() => sb.from('inventaires')
      .select('cible_id, date_inventaire, quantite').order('date_inventaire', { ascending: false }).order('cible_id')),
    sb.from('etablissements').select('id, nom'),
  ])

  const nomE = new Map((etabs.data ?? []).map(e => [e.id as string, e.nom as string]))

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
      fournisseur: null,
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
