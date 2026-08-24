'use server'

// Inventaire hebdomadaire (0130) — même contrat que les invendus :
// upsert par (date, produit), coût figé à la saisie, quantité 0 = suppression.

import { z } from 'zod'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'

const saisieSchema = z.object({
  date_inventaire: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  lignes: z.array(z.object({
    recette_id: z.string().uuid(),
    quantite: z.number().min(0).max(9999),
  })).max(300),
})

export async function enregistrerInventaire(input: unknown) {
  const p = saisieSchema.parse(input)
  const supabase = await createClient()

  const ids = p.lignes.map(l => l.recette_id)
  const { data: recs } = await supabase.from('recettes')
    .select('id, cout_achat_ht').in('id', ids)
  const coutDe = new Map((recs ?? []).map(r => [r.id as string,
    r.cout_achat_ht == null ? null : Number(r.cout_achat_ht)]))

  const aZero = p.lignes.filter(l => l.quantite === 0).map(l => l.recette_id)
  if (aZero.length > 0) {
    await supabase.from('inventaires').delete()
      .eq('date_inventaire', p.date_inventaire).in('recette_id', aZero)
  }

  const aEcrire = p.lignes.filter(l => l.quantite > 0).map(l => ({
    date_inventaire: p.date_inventaire,
    recette_id: l.recette_id,
    quantite: l.quantite,
    cout_unitaire_ht: coutDe.get(l.recette_id) ?? null,
    updated_at: new Date().toISOString(),
  }))
  if (aEcrire.length > 0) {
    const { error } = await supabase.from('inventaires')
      .upsert(aEcrire, { onConflict: 'date_inventaire,recette_id' })
    if (error) throw new Error(error.message)
  }

  revalidatePath('/inventaire')
  const valeur = aEcrire.reduce((s, l) => s + l.quantite * (l.cout_unitaire_ht ?? 0), 0)
  return {
    ok: true as const,
    lignes: aEcrire.length,
    valeur_ht: Math.round(valeur * 100) / 100,
  }
}
