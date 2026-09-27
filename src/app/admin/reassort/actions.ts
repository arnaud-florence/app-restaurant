'use server'

// Enregistrer les seuils et les cibles de stock.
//
// ⚠️ Une ligne porte SOIT un produit (`recettes`), SOIT une matière
// (`ingredients`, préfixée `ing:`) — même convention que l'inventaire
// (0133), pour qu'un seul écran couvre les deux sans les confondre.

import { z } from 'zod'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { requireManager } from '@/lib/auth'

const Schema = z.array(z.object({
  cle: z.string().min(1).max(60),
  // ⚠️ `null` est une valeur VALIDE : elle efface le paramètre. Zéro ne
  // veut pas dire la même chose — un seuil à zéro déclenche une commande
  // dès qu'il ne reste rien, une absence de seuil n'en déclenche aucune.
  seuil: z.number().min(0).max(100000).nullable(),
  cible: z.number().min(0).max(100000).nullable(),
})).min(1).max(500)

export async function enregistrerParametres(input: z.infer<typeof Schema>) {
  await requireManager()
  const maj = Schema.parse(input)
  const sb = await createClient()

  let n = 0, refus = 0
  for (const m of maj) {
    // ⚠️ Une cible sous le seuil ferait recommander aussitôt livré. La base
    // a la contrainte ; on la fait respecter ici aussi pour rendre un
    // message utile plutôt qu'une erreur SQL.
    if (m.cible != null && m.seuil != null && m.cible < m.seuil) { refus++; continue }
    const matiere = m.cle.startsWith('ing:')
    const id = matiere ? m.cle.slice(4) : m.cle
    const patch: Record<string, number | null> = {}
    if (m.seuil !== null) patch.stock_minimum = m.seuil
    if (m.cible !== null) patch.stock_cible = m.cible
    if (!Object.keys(patch).length) continue
    const { error } = await sb.from(matiere ? 'ingredients' : 'recettes').update(patch).eq('id', id)
    if (!error) n++
  }

  revalidatePath('/admin/reassort')
  return {
    ok: n > 0,
    message: refus
      ? `${n} référence(s) enregistrée(s) · ${refus} refusée(s) : la cible était sous le seuil.`
      : `${n} référence(s) enregistrée(s).`,
  }
}
