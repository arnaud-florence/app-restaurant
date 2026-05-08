'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { ALLERGENES_KEYS, type Ingredient, type HistoriquePrix } from './types'

// ─── Validation Zod ──────────────────────────────────────────────────
// Note : .coerce.number() gère les valeurs venues de form (string).
const ingredientSchema = z.object({
  nom: z.string().trim().min(1, 'Nom obligatoire').max(120),
  categorie: z.string().trim().min(1, 'Catégorie obligatoire').max(60),
  unite: z.string().trim().min(1, 'Unité obligatoire').max(20),
  prix_achat_ht: z.coerce.number().min(0, 'Prix ≥ 0').max(99999),
  fournisseur_principal: z.string().trim().max(120).optional().nullable(),
  fournisseur_secondaire: z.string().trim().max(120).optional().nullable(),
  stock_actuel:  z.coerce.number().min(0),
  stock_minimum: z.coerce.number().min(0),
  stock_maximum: z.coerce.number().min(0),
  dlc_moyenne_jours: z.coerce.number().int().min(0).max(3650),
  allergenes: z.array(z.string()).default([]).transform(arr =>
    arr.filter(a => (ALLERGENES_KEYS as readonly string[]).includes(a))
  ),
  actif: z.boolean().default(true),
}).refine(d => d.stock_minimum <= (d.stock_maximum || Infinity) || d.stock_maximum === 0, {
  message: 'Le stock minimum ne peut pas être supérieur au stock maximum.',
  path: ['stock_minimum'],
})

export type IngredientInput = z.infer<typeof ingredientSchema>

// ─── Mapping DB → app ────────────────────────────────────────────────
type IngredientRow = {
  id: string
  nom: string
  categorie: string
  unite: string
  prix_achat_ht: number | string
  fournisseur_principal: string | null
  fournisseur_secondaire: string | null
  stock_actuel: number | string | null
  stock_minimum: number | string | null
  stock_maximum: number | string | null
  dlc_moyenne_jours: number | null
  allergenes: string[] | null
  actif: boolean
  created_at: string
  updated_at: string
}

function mapIngredient(r: IngredientRow): Ingredient {
  return {
    id: r.id,
    nom: r.nom,
    categorie: r.categorie,
    unite: r.unite,
    prix_achat_ht: Number(r.prix_achat_ht ?? 0),
    fournisseur_principal: r.fournisseur_principal,
    fournisseur_secondaire: r.fournisseur_secondaire,
    stock_actuel:  Number(r.stock_actuel  ?? 0),
    stock_minimum: Number(r.stock_minimum ?? 0),
    stock_maximum: Number(r.stock_maximum ?? 0),
    dlc_moyenne_jours: Number(r.dlc_moyenne_jours ?? 0),
    allergenes: r.allergenes ?? [],
    actif: r.actif,
    created_at: r.created_at,
    updated_at: r.updated_at,
  }
}

// ─── Lecture (utilisée par la page server component) ─────────────────
export async function listIngredients(filterRecetteTags?: string[]): Promise<Ingredient[]> {
  const supabase = await createClient()

  // Si filtre par tags : ne renvoyer que les ingrédients utilisés par les
  // recettes dont tag_destination ∈ tags. Pizzaiolo ne voit que les
  // ingrédients de pizzas, barman que ceux des recettes BAR (cocktails).
  let allowedIds: string[] | null = null
  if (filterRecetteTags && filterRecetteTags.length > 0) {
    const { data: links } = await supabase
      .from('recette_ingredients')
      .select('ingredient_id, recette:recettes!inner(tag_destination)')
      .in('recette.tag_destination', filterRecetteTags)
    allowedIds = Array.from(new Set((links ?? []).map((l: { ingredient_id: string }) => l.ingredient_id)))
    if (allowedIds.length === 0) return []
  }

  let query = supabase.from('ingredients').select('*')
  if (allowedIds) query = query.in('id', allowedIds)
  const { data, error } = await query.order('actif', { ascending: false }).order('nom')
  if (error) throw new Error(error.message)
  return (data ?? []).map(mapIngredient)
}

// ─── Création ────────────────────────────────────────────────────────
export async function createIngredient(input: unknown): Promise<Ingredient> {
  const parsed = ingredientSchema.parse(input)
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('ingredients')
    .insert({
      nom: parsed.nom,
      categorie: parsed.categorie,
      unite: parsed.unite,
      prix_achat_ht: parsed.prix_achat_ht,
      fournisseur_principal: parsed.fournisseur_principal || null,
      fournisseur_secondaire: parsed.fournisseur_secondaire || null,
      stock_actuel: parsed.stock_actuel,
      stock_minimum: parsed.stock_minimum,
      stock_maximum: parsed.stock_maximum,
      dlc_moyenne_jours: parsed.dlc_moyenne_jours,
      allergenes: parsed.allergenes,
      actif: parsed.actif,
    })
    .select('*')
    .single()
  if (error || !data) throw new Error(error?.message ?? 'Erreur création')

  revalidatePath('/admin/ingredients')
  return mapIngredient(data)
}

// ─── Mise à jour ─────────────────────────────────────────────────────
export async function updateIngredient(id: string, input: unknown): Promise<Ingredient> {
  if (!id) throw new Error('id manquant')
  const parsed = ingredientSchema.parse(input)
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('ingredients')
    .update({
      nom: parsed.nom,
      categorie: parsed.categorie,
      unite: parsed.unite,
      prix_achat_ht: parsed.prix_achat_ht,
      fournisseur_principal: parsed.fournisseur_principal || null,
      fournisseur_secondaire: parsed.fournisseur_secondaire || null,
      stock_actuel: parsed.stock_actuel,
      stock_minimum: parsed.stock_minimum,
      stock_maximum: parsed.stock_maximum,
      dlc_moyenne_jours: parsed.dlc_moyenne_jours,
      allergenes: parsed.allergenes,
      actif: parsed.actif,
    })
    .eq('id', id)
    .select('*')
    .single()
  if (error || !data) throw new Error(error?.message ?? 'Erreur maj')

  revalidatePath('/admin/ingredients')
  return mapIngredient(data)
}

// ─── Activer / désactiver ────────────────────────────────────────────
export async function toggleIngredientActif(id: string, actif: boolean) {
  if (!id) throw new Error('id manquant')
  const supabase = await createClient()
  const { error } = await supabase.from('ingredients').update({ actif }).eq('id', id)
  if (error) throw new Error(error.message)
  revalidatePath('/admin/ingredients')
  return { ok: true as const }
}

// ─── Suppression définitive ──────────────────────────────────────────
export async function deleteIngredient(id: string) {
  if (!id) throw new Error('id manquant')
  const supabase = await createClient()
  const { error } = await supabase.from('ingredients').delete().eq('id', id)
  if (error) {
    // Cas typique : ingrédient référencé par recette_ingredients
    throw new Error(
      error.message.includes('foreign key')
        ? 'Cet ingrédient est utilisé dans une recette — désactive-le plutôt que de le supprimer.'
        : error.message
    )
  }
  revalidatePath('/admin/ingredients')
  return { ok: true as const }
}

// ─── Historique des prix (lu à la demande dans la modal) ─────────────
export async function getHistoriquePrix(ingredient_id: string): Promise<HistoriquePrix[]> {
  if (!ingredient_id) throw new Error('ingredient_id manquant')
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('historique_prix_ingredients')
    .select('*')
    .eq('ingredient_id', ingredient_id)
    .order('created_at', { ascending: true })
  if (error) throw new Error(error.message)
  return (data ?? []).map(r => ({
    id: r.id as string,
    ingredient_id: r.ingredient_id as string,
    prix_achat_ht: Number(r.prix_achat_ht),
    source: r.source as HistoriquePrix['source'],
    note: (r.note as string) ?? null,
    created_at: r.created_at as string,
  }))
}
