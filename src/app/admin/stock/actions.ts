'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { type Mouvement } from '@/lib/stock'

// ─── Schémas ─────────────────────────────────────────────────────────
const entreeSchema = z.object({
  ingredient_id: z.string().uuid(),
  quantite: z.number().min(0.0001).max(999999),
  prix_unitaire_ht: z.number().min(0).max(99999),
  fournisseur: z.string().max(200).optional().nullable(),
  date_peremption: z.string().optional().nullable(),  // YYYY-MM-DD
  motif: z.string().max(500).optional().nullable(),
  // Si true : on met à jour ingredients.prix_achat_ht avec ce prix d'achat
  reset_prix_reference: z.boolean().default(true),
})

const perteSchema = z.object({
  ingredient_id: z.string().uuid(),
  quantite: z.number().min(0.0001).max(999999),
  motif: z.string().min(1, 'Motif obligatoire').max(500),
})

const sortieManuelleSchema = z.object({
  ingredient_id: z.string().uuid(),
  quantite: z.number().min(0.0001).max(999999),
  motif: z.string().min(1, 'Motif obligatoire').max(500),
})

const inventaireSchema = z.object({
  ingredient_id: z.string().uuid(),
  stock_reel: z.number().min(0).max(9999999),
})

// ─── Helpers ─────────────────────────────────────────────────────────
async function refreshStockActuel(ingredient_id: string, delta: number) {
  const supabase = await createClient()
  // PostgreSQL n'a pas d'opération atomique simple via le SDK ; on lit et on écrit
  // (c'est OK pour usage admin, pas de concurrence forte ici)
  const { data, error } = await supabase
    .from('ingredients')
    .select('stock_actuel')
    .eq('id', ingredient_id)
    .single()
  if (error || !data) throw new Error(`lecture stock: ${error?.message ?? 'introuvable'}`)
  const newStock = Math.max(-999999, Number(data.stock_actuel) + delta)
  const { error: uErr } = await supabase
    .from('ingredients')
    .update({ stock_actuel: newStock })
    .eq('id', ingredient_id)
  if (uErr) throw new Error(`maj stock: ${uErr.message}`)
  return newStock
}

// ─── Actions ─────────────────────────────────────────────────────────

/**
 * Entrée de livraison fournisseur.
 * Augmente le stock + insère un mouvement type='entree'.
 * Optionnel : met à jour le prix de référence de l'ingrédient (qui logge
 * automatiquement dans historique_prix_ingredients via le trigger 0003).
 */
export async function entreeStock(input: unknown) {
  const p = entreeSchema.parse(input)
  const supabase = await createClient()

  // 1. Insère le mouvement
  const { error: mErr } = await supabase.from('mouvements_stock').insert({
    ingredient_id:    p.ingredient_id,
    type:             'entree',
    quantite:         p.quantite,
    prix_unitaire_ht: p.prix_unitaire_ht,
    fournisseur:      p.fournisseur || null,
    date_peremption:  p.date_peremption || null,
    motif:            p.motif || 'Livraison fournisseur',
  })
  if (mErr) throw new Error(`insert mouvement: ${mErr.message}`)

  // 2. Met à jour le stock_actuel
  await refreshStockActuel(p.ingredient_id, p.quantite)

  // 3. Met à jour le prix de référence (déclenche trigger historique_prix_ingredients)
  if (p.reset_prix_reference && p.prix_unitaire_ht > 0) {
    const { error: pErr } = await supabase
      .from('ingredients')
      .update({ prix_achat_ht: p.prix_unitaire_ht })
      .eq('id', p.ingredient_id)
    if (pErr) throw new Error(`maj prix réf: ${pErr.message}`)
  }

  revalidatePath('/admin/stock')
  revalidatePath('/admin/ingredients')
  return { ok: true as const }
}

/**
 * Perte ou casse — motif obligatoire.
 * Décrémente le stock + insère mouvement type='perte' valorisé au prix d'achat.
 */
export async function perteStock(input: unknown) {
  const p = perteSchema.parse(input)
  const supabase = await createClient()

  // Récupère le prix actuel pour valoriser la perte
  const { data: ing } = await supabase
    .from('ingredients')
    .select('prix_achat_ht')
    .eq('id', p.ingredient_id)
    .single()
  const prix = Number(ing?.prix_achat_ht ?? 0)

  const { error: mErr } = await supabase.from('mouvements_stock').insert({
    ingredient_id:    p.ingredient_id,
    type:             'perte',
    quantite:         p.quantite,
    prix_unitaire_ht: prix,
    motif:            p.motif,
  })
  if (mErr) throw new Error(`insert perte: ${mErr.message}`)

  await refreshStockActuel(p.ingredient_id, -p.quantite)
  revalidatePath('/admin/stock')
  revalidatePath('/admin/ingredients')
  return { ok: true as const }
}

/**
 * Sortie manuelle (bouton "-1 portion" ou similaire).
 * Crée un mouvement type='sortie' avec motif libre.
 */
export async function sortieManuelle(input: unknown) {
  const p = sortieManuelleSchema.parse(input)
  const supabase = await createClient()

  const { data: ing } = await supabase
    .from('ingredients')
    .select('prix_achat_ht')
    .eq('id', p.ingredient_id)
    .single()
  const prix = Number(ing?.prix_achat_ht ?? 0)

  const { error: mErr } = await supabase.from('mouvements_stock').insert({
    ingredient_id:    p.ingredient_id,
    type:             'sortie',
    quantite:         p.quantite,
    prix_unitaire_ht: prix,
    motif:            p.motif,
  })
  if (mErr) throw new Error(`insert sortie: ${mErr.message}`)

  await refreshStockActuel(p.ingredient_id, -p.quantite)
  revalidatePath('/admin/stock')
  revalidatePath('/admin/ingredients')
  return { ok: true as const }
}

/**
 * Saisie d'inventaire physique pour un ingrédient.
 * Calcule l'écart, ajuste stock_actuel à la valeur réelle, et insère un
 * mouvement type='inventaire' avec quantite = écart (peut être négatif
 * si stock réel < stock théorique → perte cachée).
 */
export async function ajusterInventaire(input: unknown) {
  const p = inventaireSchema.parse(input)
  const supabase = await createClient()

  const { data: ing, error } = await supabase
    .from('ingredients')
    .select('stock_actuel, prix_achat_ht')
    .eq('id', p.ingredient_id)
    .single()
  if (error || !ing) throw new Error('ingrédient introuvable')

  const stockTheorique = Number(ing.stock_actuel)
  const ecart = p.stock_reel - stockTheorique  // négatif = manque, positif = surplus
  const prix = Number(ing.prix_achat_ht)

  if (Math.abs(ecart) < 0.0001) {
    // Aucun écart → on ne crée pas de mouvement bruité
    return { ok: true as const, ecart: 0 }
  }

  const { error: mErr } = await supabase.from('mouvements_stock').insert({
    ingredient_id:    p.ingredient_id,
    type:             'inventaire',
    quantite:         Math.abs(ecart),
    prix_unitaire_ht: prix,
    motif:            ecart < 0
      ? `Inventaire physique : ${Math.abs(ecart).toFixed(3)} en moins (théorique ${stockTheorique})`
      : `Inventaire physique : ${ecart.toFixed(3)} en plus (théorique ${stockTheorique})`,
  })
  if (mErr) throw new Error(`insert inventaire: ${mErr.message}`)

  // Force le stock à la valeur réelle saisie
  const { error: uErr } = await supabase
    .from('ingredients')
    .update({ stock_actuel: p.stock_reel })
    .eq('id', p.ingredient_id)
  if (uErr) throw new Error(`maj stock inventaire: ${uErr.message}`)

  revalidatePath('/admin/stock')
  revalidatePath('/admin/ingredients')
  return { ok: true as const, ecart }
}

// ─── Lecture historique (pour la page) ───────────────────────────────
export async function listMouvements(limit = 200): Promise<Mouvement[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('mouvements_stock')
    .select(`
      id, ingredient_id, type, quantite, prix_unitaire_ht, motif,
      fournisseur, date_peremption, commande_id, employe_id, created_at,
      ingredient:ingredients(nom, unite)
    `)
    .order('created_at', { ascending: false })
    .limit(limit)
  if (error) throw new Error(error.message)
  return (data ?? []).map(r => {
    const ing = r.ingredient as { nom?: string; unite?: string } | null
    return {
      id: r.id as string,
      ingredient_id: r.ingredient_id as string,
      ingredient_nom: ing?.nom,
      ingredient_unite: ing?.unite,
      type: r.type as Mouvement['type'],
      quantite: Number(r.quantite ?? 0),
      prix_unitaire_ht: Number(r.prix_unitaire_ht ?? 0),
      motif: (r.motif as string) ?? null,
      fournisseur: (r.fournisseur as string) ?? null,
      date_peremption: (r.date_peremption as string) ?? null,
      commande_id: (r.commande_id as string) ?? null,
      employe_id: (r.employe_id as string) ?? null,
      created_at: r.created_at as string,
    }
  })
}
