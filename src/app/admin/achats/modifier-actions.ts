'use server'

// Modifier une ligne de NOTRE catalogue d'achat.
//
// Changer de fournisseur, corriger un prix, saisir le code article : trois
// gestes qu'on faisait jusqu'ici dans trois écrans différents — ou pas du
// tout. Le plus courant est le premier : « on prend ça ailleurs
// maintenant ».
//
// ⚠️ Une ligne porte SOIT un produit vendu (`recettes`), SOIT une matière
// (`ingredients`, préfixée `ing:`) — même convention que l'inventaire
// (0133) et que le réassort.

import { z } from 'zod'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { requireManager } from '@/lib/auth'

const Schema = z.object({
  cle: z.string().min(1),
  /** `null` détache le fournisseur — c'est une valeur valide. */
  fournisseur_id: z.string().uuid().nullable(),
  reference: z.string().trim().max(60).nullable(),
  /** Prix de l'unité ACHETÉE (le carton, le fût), pas de l'unité vendue. */
  prix: z.number().min(0).max(100000).nullable(),
  /**
   * ⚠️ C'EST L'HUMAIN QUI DIT SI LE PRIX EST RELEVÉ. Un prix tapé à la
   * main peut venir d'une facture sous les yeux comme d'une estimation de
   * coin de table. Le déduire serait inventer : par défaut il reste
   * ESTIMÉ, et c'est une case à cocher qui le promeut (0165).
   */
  prix_releve: z.boolean(),
})

export type ResultatModification =
  | { ok: true; message: string }
  | { ok: false; message: string }

export async function modifierArticleAchat(
  input: z.infer<typeof Schema>,
): Promise<ResultatModification> {
  await requireManager()
  const { cle, fournisseur_id, reference, prix, prix_releve } = Schema.parse(input)
  const sb = await createClient()

  const ref = reference && reference.length ? reference : null

  if (cle.startsWith('ing:')) {
    const id = cle.slice(4)
    let nomF: string | null = null
    if (fournisseur_id) {
      const { data } = await sb.from('fournisseurs').select('nom').eq('id', fournisseur_id).single()
      if (!data) return { ok: false, message: 'Fournisseur introuvable.' }
      nomF = data.nom as string
    }
    // ⚠️ `ingredients.fournisseur_principal` est du TEXTE (module 3), pas
    // une clé étrangère : on y écrit le NOM. Y coller un uuid rendrait la
    // ligne illisible partout ailleurs.
    const { error } = await sb.from('ingredients').update({
      fournisseur_principal: nomF,
      reference_fournisseur: ref,
      prix_achat_ht: prix,
      // Un prix effacé redevient inconnu, donc présumé estimé.
      prix_estime: prix == null ? true : !prix_releve,
    }).eq('id', id)
    if (error) return { ok: false, message: error.message }
  } else {
    const { data: p } = await sb.from('recettes')
      .select('nom, prix_vente_ht, unites_par_achat').eq('id', cle).single()
    if (!p) return { ok: false, message: 'Produit introuvable.' }

    // ⚠️ LE PRIX SAISI EST CELUI DE L'UNITÉ ACHETÉE, `cout_achat_ht` celui
    // de l'unité VENDUE (0131) : une part de flan coûte le dixième du flan.
    // Écrire le prix du carton tel quel a déjà produit un croissant à 40 €
    // (22/08), et une marge fausse ne se signale pas.
    const parAchat = Number(p.unites_par_achat ?? 1) || 1
    const coutVendu = prix == null ? null : Number((prix / parAchat).toFixed(4))

    // ⚠️ Le même garde-fou que la propagation des factures : un coût qui
    // atteint 95 % du prix de vente est une erreur de saisie, pas une
    // marge écrasée.
    const vente = p.prix_vente_ht == null ? null : Number(p.prix_vente_ht)
    if (coutVendu != null && vente != null && vente > 0 && coutVendu >= vente * 0.95) {
      return {
        ok: false,
        message: `Refusé : ${coutVendu.toFixed(4)} € par unité vendue atteindrait 95 % du prix de vente `
          + `(${vente.toFixed(4)} € HT). Vérifiez si le prix saisi est celui du colis — `
          + `il est divisé par ${parAchat} unité(s) vendue(s).`,
      }
    }

    const { error } = await sb.from('recettes').update({
      fournisseur_id,
      reference_fournisseur: ref,
      cout_achat_ht: coutVendu,
    }).eq('id', cle)
    if (error) return { ok: false, message: error.message }
  }

  revalidatePath('/admin/achats')
  revalidatePath('/admin/reassort')
  return { ok: true, message: 'Enregistré.' }
}
