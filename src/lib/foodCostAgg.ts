// Agrégat food cost — calcule le food cost moyen + nb alertes depuis
// recette_ingredients × prix ingrédients (le food cost N'EST PAS stocké
// sur recettes ; il se calcule au runtime, cf. foodCost.ts).
//
// Utilisé par pilotage.ts (KPI) et assistant/snapshot.ts.

import { foodCostPct, SEUIL_ALERTE, SEUIL_ORANGE_MAX } from './foodCost'

type SB = { from: (t: string) => any }

export type FoodCostAgg = {
  moyen: number       // food cost % moyen des recettes actives ayant un prix
  nbAlerte: number    // recettes > 30%
  nbRouge: number     // recettes > 32%
  nbRecettes: number  // recettes prises en compte
}

export async function foodCostMoyenEtAlertes(supabase: SB): Promise<FoodCostAgg> {
  const [recettesRes, riRes, ingRes] = await Promise.all([
    supabase.from('recettes').select('id, prix_vente_ht, nb_portions').eq('actif', true),
    supabase.from('recette_ingredients').select('recette_id, ingredient_id, quantite'),
    supabase.from('ingredients').select('id, prix_achat_ht'),
  ])

  const prixIng = new Map<string, number>(
    (ingRes.data ?? []).map((i: any) => [i.id as string, Number(i.prix_achat_ht ?? 0)]),
  )
  const riParRecette = new Map<string, Array<{ ingredient_id: string; quantite: number }>>()
  for (const r of (riRes.data ?? []) as any[]) {
    const arr = riParRecette.get(r.recette_id) ?? []
    arr.push({ ingredient_id: r.ingredient_id, quantite: Number(r.quantite ?? 0) })
    riParRecette.set(r.recette_id, arr)
  }

  const pcts: number[] = []
  for (const rec of (recettesRes.data ?? []) as any[]) {
    const lignes = riParRecette.get(rec.id) ?? []
    const total = lignes.reduce((s, l) => s + l.quantite * (prixIng.get(l.ingredient_id) ?? 0), 0)
    const nbP = Number(rec.nb_portions ?? 1) > 0 ? Number(rec.nb_portions) : 1
    const coutPortion = total / nbP
    const pct = foodCostPct(coutPortion, Number(rec.prix_vente_ht ?? 0))
    if (pct > 0) pcts.push(pct)
  }

  const moyen = pcts.length > 0 ? pcts.reduce((a, b) => a + b, 0) / pcts.length : 0
  return {
    moyen,
    nbAlerte: pcts.filter(p => p > SEUIL_ALERTE).length,
    nbRouge: pcts.filter(p => p > SEUIL_ORANGE_MAX).length,
    nbRecettes: pcts.length,
  }
}
