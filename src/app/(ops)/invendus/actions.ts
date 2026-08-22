'use server'

// Invendus du soir — comptage par produit à la fermeture (0129).
//
// La saisie est un UPSERT par (date, produit) : repasser corrige, ne
// duplique pas. Le coût unitaire est figé au moment de la saisie : la casse
// d'un jour reste valorisée au tarif fournisseur de ce jour-là.

import { z } from 'zod'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'

const saisieSchema = z.object({
  date_invendu: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  lignes: z.array(z.object({
    recette_id: z.string().uuid(),
    quantite: z.number().min(0).max(999),
  })).max(200),
})

export async function enregistrerInvendus(input: unknown) {
  const p = saisieSchema.parse(input)
  const supabase = await createClient()

  // Coûts du jour, figés dans la ligne
  const ids = p.lignes.map(l => l.recette_id)
  const { data: recs } = await supabase.from('recettes')
    .select('id, cout_achat_ht').in('id', ids)
  const coutDe = new Map((recs ?? []).map(r => [r.id as string,
    r.cout_achat_ht == null ? null : Number(r.cout_achat_ht)]))

  // Quantité 0 = « rien à jeter aujourd'hui pour ce produit » : on supprime
  // la ligne éventuelle plutôt que de stocker des zéros par centaines.
  const aZero = p.lignes.filter(l => l.quantite === 0).map(l => l.recette_id)
  if (aZero.length > 0) {
    await supabase.from('invendus').delete()
      .eq('date_invendu', p.date_invendu).in('recette_id', aZero)
  }

  const aEcrire = p.lignes.filter(l => l.quantite > 0).map(l => ({
    date_invendu: p.date_invendu,
    recette_id: l.recette_id,
    quantite: l.quantite,
    cout_unitaire_ht: coutDe.get(l.recette_id) ?? null,
    updated_at: new Date().toISOString(),
  }))
  if (aEcrire.length > 0) {
    const { error } = await supabase.from('invendus')
      .upsert(aEcrire, { onConflict: 'date_invendu,recette_id' })
    if (error) throw new Error(error.message)
  }

  revalidatePath('/invendus')
  const total = aEcrire.reduce((s, l) => s + l.quantite * (l.cout_unitaire_ht ?? 0), 0)
  return { ok: true as const, lignes: aEcrire.length, cout_total_ht: Math.round(total * 100) / 100 }
}
