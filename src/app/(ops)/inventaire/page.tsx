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
      .select('id, nom, categorie, cout_achat_ht')
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

  const produits = (prodRes.data ?? []).map(r => ({
    id: r.id as string,
    nom: r.nom as string,
    categorie: (r.categorie as string) ?? 'Autre',
    cout: r.cout_achat_ht == null ? null : Number(r.cout_achat_ht),
  }))

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
