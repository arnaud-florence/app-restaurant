// Inventaire hebdomadaire — comptage du stock produit par produit (0130).
//
// Fournit à la saisie le dernier inventaire (pré-remplissage des repères) et
// la valeur du stock précédent, pour afficher l'évolution.

import { createClient } from '@/lib/supabase/server'
import InventaireClient from './InventaireClient'

export const metadata = { title: 'Inventaire — Fournil' }
export const dynamic = 'force-dynamic'

export default async function InventairePage() {
  const supabase = await createClient()
  const aujourdhui = new Intl.DateTimeFormat('fr-CA', {
    timeZone: 'Europe/Paris', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date())

  // Tous les produits actifs, boissons comprises (le frigo à canettes se
  // compte aussi) — seules les formules, qui ne sont pas un stock, sortent.
  const [prodRes, jourRes, dernierRes] = await Promise.all([
    supabase.from('recettes')
      .select('id, nom, categorie, cout_achat_ht, libelle_achat, unites_par_achat')
      .eq('tag_destination', 'FOURNIL').eq('actif', true)
      .neq('categorie', 'Formule')
      .order('categorie').order('nom'),
    supabase.from('inventaires')
      .select('recette_id, quantite')
      .eq('date_inventaire', aujourdhui),
    // Dernier inventaire AVANT aujourd'hui : repère par produit + valeur totale
    supabase.from('inventaires')
      .select('date_inventaire, recette_id, quantite, cout_unitaire_ht')
      .lt('date_inventaire', aujourdhui)
      .order('date_inventaire', { ascending: false })
      .limit(400),
  ])

  // ── On compte des MATIÈRES, pas des produits vendus ─────────────────
  // Dans le congélateur il y a des pâtons, pas « Pizza ronde Reine », « Pizza
  // ronde chèvre-miel », « Pizza ronde poulet-pesto » ET « Panuozzi ». Dans la
  // réserve il y a une boîte de capsules, pas quatre cafés. Les produits qui
  // partagent un `libelle_achat` (0131) se replient donc en UNE ligne à
  // compter, portée par un représentant stable (le premier par id).
  //
  // Coût de la matière = cout_achat_ht × unites_par_achat : le coût stocké est
  // celui de l'unité VENDUE (1/10 de flan) ; on compte des flans entiers.
  type Ligne = { id: string; nom: string; categorie: string; cout: number | null }
  const groupes = new Map<string, Ligne>()
  for (const r of (prodRes.data ?? []).slice().sort((a, b) => String(a.id).localeCompare(String(b.id)))) {
    const cle = ((r.libelle_achat as string) ?? '').trim() || (r.nom as string)
    if (groupes.has(cle)) continue
    const coutVendu = r.cout_achat_ht == null ? null : Number(r.cout_achat_ht)
    const parAchat = Number(r.unites_par_achat ?? 1) || 1
    groupes.set(cle, {
      id: r.id as string,
      nom: cle,
      categorie: (r.categorie as string) ?? 'Autre',
      cout: coutVendu == null ? null : Math.round(coutVendu * parAchat * 10000) / 10000,
    })
  }
  const produits = Array.from(groupes.values())
    .sort((a, b) => a.categorie.localeCompare(b.categorie, 'fr') || a.nom.localeCompare(b.nom, 'fr'))

  const dejaSaisi: Record<string, number> = {}
  for (const l of jourRes.data ?? []) dejaSaisi[l.recette_id as string] = Number(l.quantite)

  // Ne garder que le dernier inventaire (une seule date)
  const datePrecedente = (dernierRes.data ?? [])[0]?.date_inventaire as string | undefined
  const precedent: Record<string, number> = {}
  let valeurPrecedente = 0
  for (const l of dernierRes.data ?? []) {
    if (l.date_inventaire !== datePrecedente) continue
    precedent[l.recette_id as string] = Number(l.quantite)
    valeurPrecedente += Number(l.quantite) * Number(l.cout_unitaire_ht ?? 0)
  }

  return (
    <InventaireClient
      produits={produits}
      dejaSaisi={dejaSaisi}
      precedent={precedent}
      datePrecedente={datePrecedente ?? null}
      valeurPrecedente={Math.round(valeurPrecedente * 100) / 100}
      dateJour={aujourdhui}
    />
  )
}
