'use server'

// Rapprocher deux tarifs, et rien de plus.
//
// Ce que ces actions N'ONT PAS le droit de faire, et pourquoi :
//
//   · écrire dans `ingredients.prix_achat_ht` — un devis est une proposition,
//     une facture est une preuve. Faire entrer un tarif dans le prix payé
//     ferait dériver tout le food cost sur de la marchandise jamais reçue ;
//
//   · deviner un rapprochement — « JAMBON CUIT SUP AC 8K » (pièce entière à
//     trancher) et « Jambon blanc tranché » partagent presque tous leurs
//     mots et ne sont pas le même produit. Un faux rapprochement désigne un
//     moins-disant qui n'existe pas, et personne ne remonte jamais de la
//     marge au tableau qui l'a fait croire.

import { z } from 'zod'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { requireManager } from '@/lib/auth'

const cleSchema = z.object({
  ligneId: z.string().uuid(),
  /** Vide = on défait le rapprochement. */
  cle: z.string().trim().max(80),
  /** Matière de notre stock que cette ligne alimenterait. */
  ingredientId: z.string().uuid().nullable().default(null),
})

export async function rapprocherTarif(input: z.infer<typeof cleSchema>) {
  await requireManager()
  const d = cleSchema.parse(input)
  const sb = await createClient()
  const { error } = await sb.from('catalogue_fournisseur')
    .update({
      cle_comparaison: d.cle || null,
      ingredient_id: d.ingredientId,
      updated_at: new Date().toISOString(),
    })
    .eq('id', d.ligneId)
  if (error) return { ok: false as const, error: error.message }
  revalidatePath('/admin/tarifs-fournisseurs')
  return { ok: true as const }
}

const contenanceSchema = z.object({
  ligneId: z.string().uuid(),
  valeur: z.number().positive().nullable(),
  unite: z.enum(['kg', 'L', 'piece']).nullable(),
})

/**
 * La contenance saisie à la main l'emporte sur celle lue dans le libellé.
 *
 * C'est le rattrapage des douze lignes que l'extracteur refuse de trancher —
 * « RACLETTE TR 22G 400G » porte le poids de la tranche ET celui de la
 * barquette. Quelqu'un lit l'étiquette une fois, et le prix au kilo devient
 * comparable pour de bon.
 */
export async function preciserContenance(input: z.infer<typeof contenanceSchema>) {
  await requireManager()
  const d = contenanceSchema.parse(input)
  if ((d.valeur === null) !== (d.unite === null)) {
    return { ok: false as const, error: 'Donnez la valeur ET son unité, ou effacez les deux.' }
  }
  const sb = await createClient()
  const { error } = await sb.from('catalogue_fournisseur')
    .update({ contenance_valeur: d.valeur, contenance_unite: d.unite, updated_at: new Date().toISOString() })
    .eq('id', d.ligneId)
  if (error) return { ok: false as const, error: error.message }
  revalidatePath('/admin/tarifs-fournisseurs')
  return { ok: true as const }
}
