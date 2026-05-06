'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { type Boisson } from '@/lib/boissons'

// ─── Validation ──────────────────────────────────────────────────────
const TYPES = ['vin','champagne','biere_pression','biere_bouteille','soft','eau','spiritueux','cafe_the','cocktail','autre'] as const
const COULEURS = ['rouge','blanc','rose','champagne','liquoreux','autre'] as const

const boissonSchema = z.object({
  nom: z.string().trim().min(1, 'Nom obligatoire').max(160),
  type: z.enum(TYPES),
  appellation: z.string().max(120).optional().nullable(),
  millesime: z.number().int().min(1900).max(2100).optional().nullable(),
  region: z.string().max(120).optional().nullable(),
  cepage: z.string().max(160).optional().nullable(),
  couleur: z.enum(COULEURS).optional().nullable(),

  fournisseur_principal: z.string().max(160).optional().nullable(),
  fournisseur_secondaire: z.string().max(160).optional().nullable(),

  prix_achat_ht_bouteille: z.number().min(0).max(99999),
  contenance_bouteille_cl: z.number().int().min(0).max(10000),
  prix_achat_ht_fut: z.number().min(0).max(99999),
  contenance_fut_cl: z.number().int().min(0).max(100000),

  prix_vente_ht_verre: z.number().min(0).max(9999),
  contenance_verre_cl: z.number().int().min(0).max(1000),
  prix_vente_ht_bouteille: z.number().min(0).max(99999),
  prix_vente_ht_pinte: z.number().min(0).max(9999),
  contenance_pinte_cl: z.number().int().min(0).max(1000),
  tva: z.number().min(0).max(100),

  stock_actuel_bouteilles: z.number().min(0),
  stock_minimum_bouteilles: z.number().min(0),
  stock_actuel_futs: z.number().min(0),
  stock_minimum_futs: z.number().min(0),

  description: z.string().max(2000).optional().nullable(),
  photo_url: z.string().max(2000).optional().nullable(),
  actif: z.boolean(),
  ordre: z.number().int().min(0).max(9999),
})

// ─── Mapping ─────────────────────────────────────────────────────────
function mapBoisson(r: Record<string, unknown>): Boisson {
  return {
    id: r.id as string,
    nom: r.nom as string,
    type: r.type as Boisson['type'],
    appellation: (r.appellation as string) ?? null,
    millesime: r.millesime as number | null,
    region: (r.region as string) ?? null,
    cepage: (r.cepage as string) ?? null,
    couleur: r.couleur as Boisson['couleur'],

    fournisseur_principal:  (r.fournisseur_principal as string)  ?? null,
    fournisseur_secondaire: (r.fournisseur_secondaire as string) ?? null,

    prix_achat_ht_bouteille: Number(r.prix_achat_ht_bouteille ?? 0),
    contenance_bouteille_cl: Number(r.contenance_bouteille_cl ?? 0),
    prix_achat_ht_fut:       Number(r.prix_achat_ht_fut ?? 0),
    contenance_fut_cl:       Number(r.contenance_fut_cl ?? 0),

    prix_vente_ht_verre:     Number(r.prix_vente_ht_verre ?? 0),
    contenance_verre_cl:     Number(r.contenance_verre_cl ?? 0),
    prix_vente_ht_bouteille: Number(r.prix_vente_ht_bouteille ?? 0),
    prix_vente_ht_pinte:     Number(r.prix_vente_ht_pinte ?? 0),
    contenance_pinte_cl:     Number(r.contenance_pinte_cl ?? 0),
    tva:                     Number(r.tva ?? 20),

    stock_actuel_bouteilles:  Number(r.stock_actuel_bouteilles ?? 0),
    stock_minimum_bouteilles: Number(r.stock_minimum_bouteilles ?? 0),
    stock_actuel_futs:        Number(r.stock_actuel_futs ?? 0),
    stock_minimum_futs:       Number(r.stock_minimum_futs ?? 0),

    description: (r.description as string) ?? null,
    photo_url:   (r.photo_url as string)   ?? null,
    actif: r.actif as boolean,
    ordre: Number(r.ordre ?? 0),
    created_at: r.created_at as string,
    updated_at: r.updated_at as string,
  }
}

// ─── Lecture ─────────────────────────────────────────────────────────
export async function listBoissons(): Promise<Boisson[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('boissons')
    .select('*')
    .order('actif', { ascending: false })
    .order('type')
    .order('ordre')
    .order('nom')
  if (error) throw new Error(error.message)
  return (data ?? []).map(mapBoisson)
}

// Recettes actives (pour l'algo d'accords) + accords explicites par boisson
export async function listAccordsExplicites(boisson_id: string): Promise<{ recette_id: string; note: string | null }[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('accords_mets_boissons')
    .select('recette_id, note')
    .eq('boisson_id', boisson_id)
  if (error) throw new Error(error.message)
  return (data ?? []).map(r => ({ recette_id: r.recette_id as string, note: (r.note as string) ?? null }))
}

// ─── CRUD ────────────────────────────────────────────────────────────
export async function createBoisson(input: unknown): Promise<{ id: string }> {
  const parsed = boissonSchema.parse(input)
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('boissons')
    .insert(toRow(parsed))
    .select('id')
    .single()
  if (error || !data) throw new Error(error?.message ?? 'Erreur création')
  revalidatePath('/admin/boissons')
  return { id: data.id as string }
}

export async function updateBoisson(id: string, input: unknown) {
  if (!id) throw new Error('id manquant')
  const parsed = boissonSchema.parse(input)
  const supabase = await createClient()
  const { error } = await supabase.from('boissons').update(toRow(parsed)).eq('id', id)
  if (error) throw new Error(error.message)
  revalidatePath('/admin/boissons')
  return { ok: true as const }
}

export async function toggleBoissonActif(id: string, actif: boolean) {
  if (!id) throw new Error('id manquant')
  const supabase = await createClient()
  const { error } = await supabase.from('boissons').update({ actif }).eq('id', id)
  if (error) throw new Error(error.message)
  revalidatePath('/admin/boissons')
  return { ok: true as const }
}

export async function deleteBoisson(id: string) {
  if (!id) throw new Error('id manquant')
  const supabase = await createClient()
  const { error } = await supabase.from('boissons').delete().eq('id', id)
  if (error) throw new Error(error.message)
  revalidatePath('/admin/boissons')
  return { ok: true as const }
}

// ─── Accords explicites ──────────────────────────────────────────────
export async function ajouterAccord(boisson_id: string, recette_id: string, note?: string) {
  const supabase = await createClient()
  const { error } = await supabase
    .from('accords_mets_boissons')
    .upsert({ boisson_id, recette_id, note: note ?? null }, { onConflict: 'recette_id,boisson_id' })
  if (error) throw new Error(error.message)
  revalidatePath('/admin/boissons')
  return { ok: true as const }
}

export async function retirerAccord(boisson_id: string, recette_id: string) {
  const supabase = await createClient()
  const { error } = await supabase
    .from('accords_mets_boissons')
    .delete()
    .eq('boisson_id', boisson_id)
    .eq('recette_id', recette_id)
  if (error) throw new Error(error.message)
  revalidatePath('/admin/boissons')
  return { ok: true as const }
}

// ─── Helper ──────────────────────────────────────────────────────────
function toRow(p: z.infer<typeof boissonSchema>) {
  return {
    nom: p.nom,
    type: p.type,
    appellation: p.appellation || null,
    millesime: p.millesime ?? null,
    region: p.region || null,
    cepage: p.cepage || null,
    couleur: p.couleur || null,
    fournisseur_principal: p.fournisseur_principal || null,
    fournisseur_secondaire: p.fournisseur_secondaire || null,
    prix_achat_ht_bouteille: p.prix_achat_ht_bouteille,
    contenance_bouteille_cl: p.contenance_bouteille_cl,
    prix_achat_ht_fut: p.prix_achat_ht_fut,
    contenance_fut_cl: p.contenance_fut_cl,
    prix_vente_ht_verre: p.prix_vente_ht_verre,
    contenance_verre_cl: p.contenance_verre_cl,
    prix_vente_ht_bouteille: p.prix_vente_ht_bouteille,
    prix_vente_ht_pinte: p.prix_vente_ht_pinte,
    contenance_pinte_cl: p.contenance_pinte_cl,
    tva: p.tva,
    stock_actuel_bouteilles: p.stock_actuel_bouteilles,
    stock_minimum_bouteilles: p.stock_minimum_bouteilles,
    stock_actuel_futs: p.stock_actuel_futs,
    stock_minimum_futs: p.stock_minimum_futs,
    description: p.description || null,
    photo_url: p.photo_url || null,
    actif: p.actif,
    ordre: p.ordre,
  }
}
