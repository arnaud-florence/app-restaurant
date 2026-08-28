'use server'

// Rattacher une ligne de facture à ce qu'elle nourrit réellement.
//
// C'est la moitié manquante de l'apprentissage : une ligne rapprochée par le
// nom apprend sa référence toute seule, mais une ligne que RIEN ne reconnaît
// restait invisible — 127 sur 134 au 28/08/2026. Sans ce geste, le stock
// théorique, la démarque et la commande conseillée ne fonctionnent que pour
// les douze produits déjà appariés à la main.

import { z } from 'zod'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'

const schema = z.object({
  ligneId: z.string().uuid(),
  // `rec:<uuid>` pour un produit vendu, `ing:<uuid>` pour une matière.
  cible: z.string().regex(/^(rec|ing):[0-9a-f-]{36}$/),
  /** Appliquer aussi la référence de la ligne à la cible. */
  apprendreReference: z.boolean().default(true),
})

export async function rattacherLigne(input: z.infer<typeof schema>) {
  const d = schema.parse(input)
  const sb = await createClient()
  const [type, id] = d.cible.split(':')

  const { data: ligne, error: eL } = await sb.from('facture_lignes')
    .select('id, reference, description, prix_unitaire_ht, unite')
    .eq('id', d.ligneId).maybeSingle()
  if (eL || !ligne) return { ok: false as const, error: eL?.message ?? 'Ligne introuvable' }

  const { error } = await sb.from('facture_lignes')
    .update(type === 'rec' ? { recette_id: id, ingredient_id: null }
                           : { ingredient_id: id, recette_id: null })
    .eq('id', d.ligneId)
  if (error) return { ok: false as const, error: error.message }

  // ⚠️ On apprend la référence, mais on n'ÉCRASE jamais celle qui existe :
  // une référence en place a été vérifiée, la remplacer serait un recul.
  // Et une référence fausse passe avant le nom — elle se tromperait en
  // silence et pour toujours.
  let referenceApprise = false
  const ref = ligne.reference?.trim()
  if (d.apprendreReference && ref) {
    const table = type === 'rec' ? 'recettes' : 'ingredients'
    const { data: cible } = await sb.from(table)
      .select('reference_fournisseur').eq('id', id).maybeSingle()
    if (cible && !cible.reference_fournisseur?.trim()) {
      const { error: eRef } = await sb.from(table)
        .update({ reference_fournisseur: ref }).eq('id', id)
      referenceApprise = !eRef
    }
  }

  // ⚠️ Le PRIX n'est volontairement PAS propagé ici. Le calcul du prix à la
  // pièce dépend de l'unité de la ligne et du conditionnement (C=N), et se
  // tromper écrit un coût faux qui détruit une marge en silence — un croissant
  // à 40 € a déjà été vécu. La prochaine facture le fera correctement, avec
  // toutes ses données sous la main.

  revalidatePath('/admin/correspondances')
  revalidatePath('/admin/ingredients')
  return { ok: true as const, referenceApprise }
}

/** Écarter une ligne : ni produit ni matière, et on ne la reproposera plus. */
export async function ignorerLigne(ligneId: string) {
  const sb = await createClient()
  const { error } = await sb.from('facture_lignes')
    .update({ ignoree: true }).eq('id', z.string().uuid().parse(ligneId))
  if (error) return { ok: false as const, error: error.message }
  revalidatePath('/admin/correspondances')
  return { ok: true as const }
}
