'use server'

// Inventaire hebdomadaire (0130) — même contrat que les invendus :
// upsert par (date, produit), coût figé à la saisie, quantité 0 = suppression.

import { z } from 'zod'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'

const saisieSchema = z.object({
  date_inventaire: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  // `cible` : un uuid de recette, ou « ing:<uuid> » pour une matière (0133).
  lignes: z.array(z.object({
    cible: z.string().min(36).max(64),
    quantite: z.number().min(0).max(9999),
  })).max(400),
})

export async function enregistrerInventaire(input: unknown) {
  const p = saisieSchema.parse(input)
  const supabase = await createClient()

  const estMatiere = (c: string) => c.startsWith('ing:')
  const nu = (c: string) => c.replace(/^ing:/, '')

  const idsRec = p.lignes.filter(l => !estMatiere(l.cible)).map(l => l.cible)
  const idsIng = p.lignes.filter(l => estMatiere(l.cible)).map(l => nu(l.cible))

  // Coût figé au jour du comptage : produit revendu → cout_achat_ht ×
  // unites_par_achat (on compte des flans entiers, pas des parts) ;
  // matière première → son prix d'achat.
  const coutDe = new Map<string, number | null>()
  if (idsRec.length > 0) {
    const { data } = await supabase.from('recettes')
      .select('id, cout_achat_ht, unites_par_achat').in('id', idsRec)
    for (const r of data ?? []) {
      const c = r.cout_achat_ht == null ? null : Number(r.cout_achat_ht)
      const par = Number(r.unites_par_achat ?? 1) || 1
      coutDe.set(r.id as string, c == null ? null : Math.round(c * par * 10000) / 10000)
    }
  }
  if (idsIng.length > 0) {
    const { data } = await supabase.from('ingredients')
      .select('id, prix_achat_ht').in('id', idsIng)
    for (const r of data ?? []) {
      coutDe.set(`ing:${r.id}`, r.prix_achat_ht == null ? null : Number(r.prix_achat_ht))
    }
  }

  const zeroRec = p.lignes.filter(l => l.quantite === 0 && !estMatiere(l.cible)).map(l => l.cible)
  const zeroIng = p.lignes.filter(l => l.quantite === 0 && estMatiere(l.cible)).map(l => nu(l.cible))
  if (zeroRec.length > 0) {
    await supabase.from('inventaires').delete()
      .eq('date_inventaire', p.date_inventaire).in('recette_id', zeroRec)
  }
  if (zeroIng.length > 0) {
    await supabase.from('inventaires').delete()
      .eq('date_inventaire', p.date_inventaire).in('ingredient_id', zeroIng)
  }

  // Un seul index unique porte sur (date, cible_id) — colonne générée
  // coalesce(recette_id, ingredient_id), 0134 — donc un seul `onConflict`
  // pour les deux types de lignes.
  const pleines = p.lignes.filter(l => l.quantite > 0)
  const ligneRec = pleines.filter(l => !estMatiere(l.cible)).map(l => ({
    date_inventaire: p.date_inventaire, recette_id: l.cible, ingredient_id: null,
    quantite: l.quantite, cout_unitaire_ht: coutDe.get(l.cible) ?? null,
    updated_at: new Date().toISOString(),
  }))
  const ligneIng = pleines.filter(l => estMatiere(l.cible)).map(l => ({
    date_inventaire: p.date_inventaire, recette_id: null, ingredient_id: nu(l.cible),
    quantite: l.quantite, cout_unitaire_ht: coutDe.get(l.cible) ?? null,
    updated_at: new Date().toISOString(),
  }))
  if (ligneRec.length > 0) {
    const { error } = await supabase.from('inventaires')
      .upsert(ligneRec, { onConflict: 'date_inventaire,cible_id' })
    if (error) throw new Error(error.message)
  }
  if (ligneIng.length > 0) {
    const { error } = await supabase.from('inventaires')
      .upsert(ligneIng, { onConflict: 'date_inventaire,cible_id' })
    if (error) throw new Error(error.message)
  }
  const aEcrire = [...ligneRec, ...ligneIng]

  revalidatePath('/inventaire')
  const valeur = aEcrire.reduce((s, l) => s + l.quantite * (l.cout_unitaire_ht ?? 0), 0)
  return {
    ok: true as const,
    lignes: aEcrire.length,
    valeur_ht: Math.round(valeur * 100) / 100,
  }
}
