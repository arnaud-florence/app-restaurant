// Invendus du soir — comptage à la fermeture (0129).
//
// Le food cost des factures ignore la casse ; cette page la mesure en
// 30 secondes : on compte ce qui reste, on tape, c'est valorisé au coût
// d'achat du jour. La synthèse 7 jours dit où ajuster la commande Gineys.

import { createClient } from '@/lib/supabase/server'
import InvendusClient from './InvendusClient'

export const metadata = { title: 'Invendus du soir — Fournil' }
export const dynamic = 'force-dynamic'

export default async function InvendusPage() {
  const supabase = await createClient()
  const aujourdhui = new Intl.DateTimeFormat('fr-CA', {
    timeZone: 'Europe/Paris', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date())

  const il7j = new Date(Date.now() - 7 * 86400_000).toISOString().slice(0, 10)

  const [prodRes, jourRes, histRes] = await Promise.all([
    // Les produits comptables le soir : le frais qui se jette. Les boissons
    // industrielles et le café en dosettes ne se périment pas à J+1 —
    // catégories exclues pour garder une liste courte au comptage.
    supabase.from('recettes')
      .select('id, nom, categorie, cout_achat_ht')
      .eq('tag_destination', 'FOURNIL').eq('actif', true)
      .not('categorie', 'in', '("Boisson fraîche","Boisson chaude","Formule","À classer")')
      .order('categorie').order('nom'),
    supabase.from('invendus')
      .select('recette_id, quantite')
      .eq('date_invendu', aujourdhui),
    supabase.from('invendus')
      .select('date_invendu, quantite, cout_unitaire_ht, recette:recettes(nom)')
      .gte('date_invendu', il7j)
      .order('date_invendu', { ascending: false }),
  ])

  const produits = (prodRes.data ?? []).map(r => ({
    id: r.id as string,
    nom: r.nom as string,
    categorie: (r.categorie as string) ?? 'Autre',
    cout: r.cout_achat_ht == null ? null : Number(r.cout_achat_ht),
  }))

  const dejaSaisi: Record<string, number> = {}
  for (const l of jourRes.data ?? []) dejaSaisi[l.recette_id as string] = Number(l.quantite)

  const historique = (histRes.data ?? []).map(h => ({
    date: h.date_invendu as string,
    nom: (h.recette as { nom?: string } | null)?.nom ?? '—',
    quantite: Number(h.quantite),
    cout: h.cout_unitaire_ht == null ? null : Number(h.cout_unitaire_ht),
  }))

  return (
    <InvendusClient
      produits={produits}
      dejaSaisi={dejaSaisi}
      dateJour={aujourdhui}
      historique={historique}
    />
  )
}
