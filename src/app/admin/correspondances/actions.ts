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
  let libelleAppris = false
  const table = type === 'rec' ? 'recettes' : 'ingredients'
  const { data: cible } = await sb.from(table)
    .select('reference_fournisseur, libelle_achat').eq('id', id).maybeSingle()

  const ref = ligne.reference?.trim()
  if (d.apprendreReference && ref && cible && !cible.reference_fournisseur?.trim()) {
    const { error: eRef } = await sb.from(table)
      .update({ reference_fournisseur: ref }).eq('id', id)
    referenceApprise = !eRef
  }

  // ─── Le libellé d'achat, sans quoi ce geste ne sert qu'à vider une liste ──
  // `libelle_achat` est ce qui pilote le stock théorique, la démarque et la
  // commande conseillée : c'est LA clé de regroupement. Un rattachement qui ne
  // l'écrivait pas laissait ces trois fonctions à 12 produits sur 120 — la
  // liste se vidait, rien ne se débloquait.
  //
  // Ici on peut se le permettre là où l'apprentissage automatique ne le
  // pouvait pas : ce n'est pas une déduction sur un nom, c'est un HUMAIN qui
  // a désigné la cible. On n'écrase jamais un libellé déjà en place.
  // ⚠️ Certaines lignes Gineys sont préfixées par un en-tête de bon de
  // livraison : « BORMES LES MIMOSAS B.L. 3447302 du 20/08/26 CROISSANT … ».
  // Écrit tel quel, ce libellé ne correspondrait JAMAIS à une autre facture —
  // il porte un numéro de BL et une date. On ne garde que ce qui suit.
  const libelle = (ligne.description ?? '')
    .replace(/^.*?\bdu \d{2}\/\d{2}\/\d{2}\s*/i, '').trim()
  if (cible && !cible.libelle_achat?.trim() && libelle) {
    const { error: eLib } = await sb.from(table)
      .update({ libelle_achat: libelle }).eq('id', id)
    libelleAppris = !eLib
  }

  // ⚠️ Le PRIX n'est volontairement PAS propagé ici. Le calcul du prix à la
  // pièce dépend de l'unité de la ligne et du conditionnement (C=N), et se
  // tromper écrit un coût faux qui détruit une marge en silence — un croissant
  // à 40 € a déjà été vécu. La prochaine facture le fera correctement, avec
  // toutes ses données sous la main.

  revalidatePath('/admin/correspondances')
  revalidatePath('/admin/ingredients')
  return { ok: true as const, referenceApprise, libelleAppris }
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
