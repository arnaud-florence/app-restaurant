'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import {
  type Recette, type RecetteIngredient, type RecetteWithIngredients,
  TAGS_DESTINATION, isNewId,
} from './types'
import { type Ingredient } from '../ingredients/types'

// ─── Validation ──────────────────────────────────────────────────────
const recetteSchema = z.object({
  nom: z.string().trim().min(1, 'Nom obligatoire').max(120),
  categorie: z.string().trim().min(1, 'Catégorie obligatoire').max(60),
  tag_destination: z.enum(TAGS_DESTINATION),
  description: z.string().max(2000).optional().nullable(),
  temps_preparation: z.coerce.number().int().min(0).max(720),
  nb_portions: z.coerce.number().int().min(1, 'Au moins 1 portion').max(200),
  prix_vente_ht: z.coerce.number().min(0).max(99999),
  tva: z.coerce.number().min(0).max(100),
  photo_url: z.string().max(2000).optional().nullable(),
  actif: z.boolean().default(true),
})

const ingredientLigneSchema = z.object({
  id: z.string(),
  ingredient_id: z.string().uuid(),
  quantite: z.coerce.number().min(0).max(99999),
  unite: z.string().min(1).max(20),
})

const recetteFullSchema = z.object({
  recette: recetteSchema,
  ingredients: z.array(ingredientLigneSchema),
})

export type RecetteInput = z.infer<typeof recetteSchema>
export type RecetteIngredientInput = z.infer<typeof ingredientLigneSchema>

// ─── Mappings DB → app ───────────────────────────────────────────────
function mapRecette(r: Record<string, unknown>): Recette {
  return {
    id: r.id as string,
    nom: r.nom as string,
    categorie: r.categorie as string,
    tag_destination: r.tag_destination as Recette['tag_destination'],
    description: (r.description as string) ?? null,
    temps_preparation: Number(r.temps_preparation ?? 0),
    nb_portions: Number(r.nb_portions ?? 1),
    prix_vente_ht: Number(r.prix_vente_ht ?? 0),
    tva: Number(r.tva ?? 10),
    actif: r.actif as boolean,
    photo_url: (r.photo_url as string) ?? null,
    created_at: r.created_at as string,
    updated_at: r.updated_at as string,
  }
}

// ─── Liste avec ingrédients (fetch côté server component) ────────────
// filterTags : si fourni, filtre par tag_destination (utilisé par les
// pages admin qui restreignent l'affichage selon le poste — ex pizzaiolo
// ne voit que les recettes PIZZA).
export async function listRecettesAvecIngredients(filterTags?: string[]): Promise<RecetteWithIngredients[]> {
  const supabase = await createClient()
  let query = supabase
    .from('recettes')
    .select(`
      *,
      recette_ingredients(
        id, ingredient_id, quantite, unite,
        ingredient:ingredients(id, nom, categorie, unite, prix_achat_ht, allergenes, actif)
      )
    `)
  if (filterTags && filterTags.length > 0) {
    query = query.in('tag_destination', filterTags)
  }
  const { data, error } = await query
    .order('actif', { ascending: false })
    .order('tag_destination')
    .order('nom')
  if (error) throw new Error(error.message)

  return (data ?? []).map(r => {
    const lignes = (r.recette_ingredients ?? []) as Array<{
      id: string; ingredient_id: string; quantite: number | string; unite: string;
      ingredient: { id: string; nom: string; categorie: string; unite: string; prix_achat_ht: number | string; allergenes: string[] | null; actif: boolean } | null
    }>
    return {
      ...mapRecette(r),
      ingredients: lignes.map(l => ({
        id: l.id,
        ingredient_id: l.ingredient_id,
        quantite: Number(l.quantite ?? 0),
        unite: l.unite,
        ingredient_nom:           l.ingredient?.nom            ?? '(ingrédient supprimé)',
        ingredient_categorie:     l.ingredient?.categorie      ?? '',
        ingredient_unite:         l.ingredient?.unite          ?? l.unite,
        ingredient_prix_achat_ht: Number(l.ingredient?.prix_achat_ht ?? 0),
        ingredient_allergenes:    l.ingredient?.allergenes     ?? [],
        ingredient_actif:         l.ingredient?.actif          ?? true,
      } satisfies RecetteIngredient)),
    }
  })
}

// ─── Liste des ingrédients dispo pour le picker du formulaire ────────
export async function listIngredientsForPicker(): Promise<Ingredient[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('ingredients')
    .select('*')
    .eq('actif', true)
    .order('categorie')
    .order('nom')
  if (error) throw new Error(error.message)
  return (data ?? []).map(r => ({
    id: r.id as string,
    nom: r.nom as string,
    categorie: r.categorie as string,
    unite: r.unite as string,
    prix_achat_ht: Number(r.prix_achat_ht ?? 0),
    fournisseur_principal: (r.fournisseur_principal as string) ?? null,
    fournisseur_secondaire: (r.fournisseur_secondaire as string) ?? null,
    stock_actuel:  Number(r.stock_actuel  ?? 0),
    stock_minimum: Number(r.stock_minimum ?? 0),
    stock_maximum: Number(r.stock_maximum ?? 0),
    dlc_moyenne_jours: Number(r.dlc_moyenne_jours ?? 0),
    allergenes: (r.allergenes as string[]) ?? [],
    actif: r.actif as boolean,
    created_at: r.created_at as string,
    updated_at: r.updated_at as string,
  }))
}

// ─── Création + ingrédients en une transaction logique ───────────────
export async function createRecette(payload: unknown): Promise<{ id: string }> {
  const { recette, ingredients } = recetteFullSchema.parse(payload)
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('recettes')
    .insert({
      nom: recette.nom,
      categorie: recette.categorie,
      tag_destination: recette.tag_destination,
      description: recette.description || null,
      temps_preparation: recette.temps_preparation,
      nb_portions: recette.nb_portions,
      prix_vente_ht: recette.prix_vente_ht,
      tva: recette.tva,
      photo_url: recette.photo_url || null,
      actif: recette.actif,
    })
    .select('id')
    .single()
  if (error || !data) throw new Error(error?.message ?? 'Erreur création recette')

  if (ingredients.length > 0) {
    const { error: iErr } = await supabase.from('recette_ingredients').insert(
      ingredients.map(li => ({
        recette_id: data.id,
        ingredient_id: li.ingredient_id,
        quantite: li.quantite,
        unite: li.unite,
      }))
    )
    if (iErr) {
      // Rollback manuel : on supprime la recette si l'insertion d'ingrédients échoue
      await supabase.from('recettes').delete().eq('id', data.id)
      throw new Error(`Erreur ingrédients : ${iErr.message}`)
    }
  }

  revalidatePath('/admin/recettes')
  return { id: data.id as string }
}

// ─── Mise à jour avec diff sur les ingrédients ───────────────────────
export async function updateRecette(id: string, payload: unknown) {
  if (!id) throw new Error('id manquant')
  const { recette, ingredients } = recetteFullSchema.parse(payload)
  const supabase = await createClient()

  const { error: rErr } = await supabase
    .from('recettes')
    .update({
      nom: recette.nom,
      categorie: recette.categorie,
      tag_destination: recette.tag_destination,
      description: recette.description || null,
      temps_preparation: recette.temps_preparation,
      nb_portions: recette.nb_portions,
      prix_vente_ht: recette.prix_vente_ht,
      tva: recette.tva,
      photo_url: recette.photo_url || null,
      actif: recette.actif,
    })
    .eq('id', id)
  if (rErr) throw new Error(rErr.message)

  // Diff ingrédients
  const { data: existants, error: lErr } = await supabase
    .from('recette_ingredients')
    .select('id')
    .eq('recette_id', id)
  if (lErr) throw new Error(lErr.message)

  const idsEnDB    = new Set((existants ?? []).map(r => r.id as string))
  const idsEnFront = new Set(ingredients.filter(li => !isNewId(li.id)).map(li => li.id))
  const aSupprimer = Array.from(idsEnDB).filter(x => !idsEnFront.has(x))

  if (aSupprimer.length > 0) {
    const { error } = await supabase.from('recette_ingredients').delete().in('id', aSupprimer)
    if (error) throw new Error(error.message)
  }

  const aInserer = ingredients.filter(li => isNewId(li.id))
  if (aInserer.length > 0) {
    const { error } = await supabase.from('recette_ingredients').insert(
      aInserer.map(li => ({
        recette_id: id,
        ingredient_id: li.ingredient_id,
        quantite: li.quantite,
        unite: li.unite,
      }))
    )
    if (error) throw new Error(error.message)
  }

  const aMettreAJour = ingredients.filter(li => !isNewId(li.id))
  for (const li of aMettreAJour) {
    const { error } = await supabase
      .from('recette_ingredients')
      .update({ ingredient_id: li.ingredient_id, quantite: li.quantite, unite: li.unite })
      .eq('id', li.id)
    if (error) throw new Error(error.message)
  }

  revalidatePath('/admin/recettes')
  return { ok: true as const }
}

// ─── Toggle actif / inactif ──────────────────────────────────────────
export async function toggleRecetteActif(id: string, actif: boolean) {
  if (!id) throw new Error('id manquant')
  const supabase = await createClient()
  const { error } = await supabase.from('recettes').update({ actif }).eq('id', id)
  if (error) throw new Error(error.message)
  revalidatePath('/admin/recettes')
  return { ok: true as const }
}

// ─── Suppression définitive (cascade sur recette_ingredients) ────────
export async function deleteRecette(id: string) {
  if (!id) throw new Error('id manquant')
  const supabase = await createClient()
  const { error } = await supabase.from('recettes').delete().eq('id', id)
  if (error) throw new Error(error.message)
  revalidatePath('/admin/recettes')
  return { ok: true as const }
}
