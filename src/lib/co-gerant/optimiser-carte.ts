// Co-gérant « Arnaud » · il agit sur ta VRAIE carte.
// Repère les plats existants au food cost trop élevé, calcule le prix juste
// pour viser une cible (28 %), et applique le prix d'un tap. « Sur les DONNÉES,
// il agit. » Côté serveur uniquement.

import { createClient } from '@/lib/supabase/server'
import { coutPortion, foodCostPct, prixSuggerePourMarge, round2 } from '@/lib/foodCost'
import { type PlatAOptimiser } from './types'

// Les vins/boissons ont leur propre logique de marge (module Boissons) → exclus
// de l'optimisation food cost, qui ne vise que les vrais plats.
const HORS_FOOD = /vin|champagne|boisson|bi[èe]re|spiritueux|\bsoft\b|cocktail|caf[ée]|th[ée]|\beau\b|ap[ée]ritif|digestif|alcool|whisky|rhum|gin|vodka/i

/** Les plats existants dont le food cost dépasse le seuil, avec le prix conseillé. */
export async function analyserPlatsAOptimiser(opts?: { seuil?: number; cibleFc?: number; max?: number }): Promise<PlatAOptimiser[]> {
  const seuil = opts?.seuil ?? 32
  const cibleFc = opts?.cibleFc ?? 28
  const max = opts?.max ?? 20
  const sb = await createClient()

  const { data: recs } = await sb.from('recettes').select('id, nom, categorie, prix_vente_ht, nb_portions, actif').eq('actif', true)
  const { data: ris } = await sb.from('recette_ingredients').select('recette_id, ingredient_id, quantite')
  const { data: ings } = await sb.from('ingredients').select('id, prix_achat_ht')

  const prixById = new Map((ings ?? []).map(i => [i.id as string, Number(i.prix_achat_ht) || 0]))
  const coutByRec = new Map<string, number>()
  for (const r of ris ?? []) {
    const p = prixById.get(r.ingredient_id as string) ?? 0
    coutByRec.set(r.recette_id as string, (coutByRec.get(r.recette_id as string) ?? 0) + Number(r.quantite) * p)
  }

  const out: PlatAOptimiser[] = []
  for (const rec of recs ?? []) {
    if (HORS_FOOD.test(String(rec.categorie ?? ''))) continue   // pas les vins/boissons
    const cout = coutByRec.get(rec.id as string)
    const pv = Number(rec.prix_vente_ht)
    if (cout == null || cout <= 0 || !pv) continue
    const cp = coutPortion(cout, Number(rec.nb_portions) || 1)
    const fc = round2(foodCostPct(cp, pv))
    if (fc <= seuil) continue
    const prixSuggere = round2(prixSuggerePourMarge(cp, 100 - cibleFc))
    const fcSuggere = round2(foodCostPct(cp, prixSuggere))
    out.push({
      id: rec.id as string, nom: rec.nom as string, categorie: String(rec.categorie ?? ''),
      prixActuel: round2(pv), coutPortion: round2(cp), fcActuel: fc, prixSuggere, fcSuggere,
    })
  }
  out.sort((a, b) => b.fcActuel - a.fcActuel)
  return out.slice(0, max)
}

/** Applique un nouveau prix de vente HT à un plat existant. */
export async function appliquerPrixRecette(id: string, nouveauPrix: number): Promise<{ ok: boolean }> {
  const sb = await createClient()
  const prix = round2(Math.max(0, Number(nouveauPrix) || 0))
  if (!id || prix <= 0) throw new Error('Prix invalide')
  const { error } = await sb.from('recettes').update({ prix_vente_ht: prix, updated_at: new Date().toISOString() }).eq('id', id)
  if (error) throw new Error(error.message)
  return { ok: true }
}
