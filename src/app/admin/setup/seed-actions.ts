'use server'

// Server action pour installer le pack catalogue démarrage
// (5 fournisseurs + 50 ingrédients + 20 recettes).
// Idempotent : skip les éléments existants par nom.
// Manager only.

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { requireManager } from '@/lib/auth'
import { FOURNISSEURS_SEED, INGREDIENTS_SEED, RECETTES_SEED } from '@/lib/catalogue-seed'

export async function installerCatalogueDemarrage(): Promise<{
  ok: true
  fournisseurs: { crees: number; existants: number }
  ingredients: { crees: number; existants: number }
  recettes: { crees: number; existants: number }
  details: string[]
}> {
  await requireManager()
  const sb = await createClient()
  const details: string[] = []

  // 1. Fournisseurs
  let fCrees = 0, fExistants = 0
  const { data: fExist } = await sb.from('fournisseurs').select('nom')
  const fournNoms = new Set((fExist ?? []).map(r => r.nom as string))
  for (const f of FOURNISSEURS_SEED) {
    if (fournNoms.has(f.nom)) { fExistants++; continue }
    const { error } = await sb.from('fournisseurs').insert({ ...f, actif: true })
    if (error) {
      details.push(`❌ Fournisseur ${f.nom} : ${error.message}`)
    } else {
      fCrees++
      details.push(`✓ Fournisseur ${f.nom}`)
    }
  }

  // 2. Ingrédients
  let iCrees = 0, iExistants = 0
  const { data: iExist } = await sb.from('ingredients').select('nom')
  const ingNoms = new Set((iExist ?? []).map(r => r.nom as string))
  for (const i of INGREDIENTS_SEED) {
    if (ingNoms.has(i.nom)) { iExistants++; continue }
    const { error } = await sb.from('ingredients').insert({
      nom: i.nom,
      categorie: i.categorie,
      unite: i.unite,
      prix_achat_ht: i.prix,
      fournisseur_principal: i.fournisseur,
      stock_actuel: 0,
      stock_minimum: 1,
      stock_maximum: 10,
      dlc_moyenne_jours: i.categorie === 'Légume' || i.categorie === 'Poisson' ? 3 : i.categorie === 'Viande' ? 5 : 30,
      allergenes: i.allergenes,
      actif: true,
    })
    if (error) {
      details.push(`❌ Ingrédient ${i.nom} : ${error.message}`)
    } else {
      iCrees++
      ingNoms.add(i.nom)
    }
  }
  details.push(`📦 ${iCrees} ingrédients créés, ${iExistants} déjà existants`)

  // 3. Recettes (avec ingrédients liés)
  let rCrees = 0, rExistants = 0
  const { data: rExist } = await sb.from('recettes').select('nom')
  const recNoms = new Set((rExist ?? []).map(r => r.nom as string))
  // Re-fetch IDs ingrédients après insertion
  const { data: ingsAll } = await sb.from('ingredients').select('id, nom, unite, prix_achat_ht')
  const ingByNom = new Map<string, { id: string; unite: string; prix: number }>()
  for (const i of (ingsAll ?? [])) {
    ingByNom.set(i.nom as string, { id: i.id as string, unite: i.unite as string, prix: Number(i.prix_achat_ht ?? 0) })
  }

  for (const r of RECETTES_SEED) {
    if (recNoms.has(r.nom)) { rExistants++; continue }

    // Insert recette
    const { data: recCree, error: errR } = await sb.from('recettes').insert({
      nom:                         r.nom,
      categorie:                   r.categorie,
      tag_destination:             r.tag,
      description:                 r.description,
      temps_preparation:           r.temps_prep,
      nb_portions:                 r.nb_portions,
      prix_vente_ht:               r.prix,
      tva:                         r.contient_alcool ? 20 : 10,
      contient_alcool:             r.contient_alcool,
      actif:                       true,
    }).select('id').single()
    if (errR || !recCree) {
      details.push(`❌ Recette ${r.nom} : ${errR?.message ?? 'erreur'}`)
      continue
    }

    // Insert ingrédients liés
    const recIngRows: Array<{ recette_id: string; ingredient_id: string; quantite: number; unite: string }> = []
    for (const ri of r.ingredients) {
      const ing = ingByNom.get(ri.nom)
      if (!ing) {
        details.push(`  ⚠ Ingrédient '${ri.nom}' introuvable pour ${r.nom}`)
        continue
      }
      recIngRows.push({
        recette_id: recCree.id as string,
        ingredient_id: ing.id,
        quantite: ri.q,
        unite: ri.u,
      })
    }
    if (recIngRows.length > 0) {
      const { error: errRi } = await sb.from('recette_ingredients').insert(recIngRows)
      if (errRi) details.push(`  ⚠ Lien ingrédients ${r.nom} : ${errRi.message}`)
    }
    rCrees++
  }
  details.push(`👨‍🍳 ${rCrees} recettes créées, ${rExistants} déjà existantes`)

  revalidatePath('/admin/recettes')
  revalidatePath('/admin/ingredients')
  revalidatePath('/admin/fournisseurs')
  revalidatePath('/admin/setup')

  return {
    ok: true as const,
    fournisseurs: { crees: fCrees, existants: fExistants },
    ingredients:  { crees: iCrees, existants: iExistants },
    recettes:     { crees: rCrees, existants: rExistants },
    details,
  }
}
