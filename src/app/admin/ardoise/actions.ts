'use server'

import { z } from 'zod'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { requireManager } from '@/lib/auth'

const ISO = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'date attendue au format AAAA-MM-JJ')

/**
 * POSER L'ARDOISE DE LA SEMAINE.
 *
 * ⚠️⚠️ ON REMPLACE LA SEMAINE, ON NE CUMULE PAS. Sans ça, décocher un plat
 * ne le retirerait jamais : il resterait à l'ardoise, le réassort
 * continuerait à commander ses ingrédients, et personne ne comprendrait
 * pourquoi. Le geste du gérant est « voilà la carte de la semaine », pas
 * « ajoute ces plats ».
 *
 * ⚠️ Les lignes d'un JOUR précis (les plats du jour, `date_debut =
 * date_fin`) ne sont PAS touchées : elles appartiennent à l'autre geste.
 * Les emporter effacerait la semaine de plats du jour déjà planifiée.
 */
export async function poserArdoise(input: { debut: string; fin: string; recetteIds: string[] }) {
  await requireManager()
  const { debut, fin, recetteIds } = z.object({
    debut: ISO, fin: ISO, recetteIds: z.array(z.string().uuid()),
  }).parse(input)
  if (fin < debut) return { ok: false as const, erreur: 'La fin de semaine précède son début.' }

  const sb = await createClient()
  const { data: existantes, error: eLect } = await sb
    .from('plats_du_jour')
    .select('id, recette_id, date_debut, date_fin')
    .eq('date_debut', debut).eq('date_fin', fin)
  if (eLect) return { ok: false as const, erreur: eLect.message }

  const avant = new Set((existantes ?? []).map(x => x.recette_id as string))
  const apres = new Set(recetteIds)
  const aRetirer = (existantes ?? []).filter(x => !apres.has(x.recette_id as string))
  const aPoser = recetteIds.filter(id => !avant.has(id))

  if (aRetirer.length > 0) {
    const ids = aRetirer.map(x => x.id as string)
    // ⚠️ La composition d'abord : `on delete cascade` s'en chargerait, mais
    // un échec à mi-chemin laisserait des lignes orphelines invisibles.
    await sb.from('plat_du_jour_ingredients').delete().in('plat_du_jour_id', ids)
    const { error } = await sb.from('plats_du_jour').delete().in('id', ids)
    if (error) return { ok: false as const, erreur: error.message }
  }
  if (aPoser.length > 0) {
    const { error } = await sb.from('plats_du_jour').insert(
      aPoser.map((recette_id, i) => ({ recette_id, date_debut: debut, date_fin: fin, ordre: i, actif: true })),
    )
    if (error) return { ok: false as const, erreur: error.message }
  }
  revalidatePath('/admin/ardoise')
  revalidatePath('/admin/reassort')
  return { ok: true as const, poses: aPoser.length, retires: aRetirer.length }
}

/**
 * LE PLAT DU JOUR D'UNE DATE, avec sa composition.
 *
 * ⚠️ Il n'est PAS de la carte (décision du gérant, 04/10/2026) : il n'a donc
 * aucune fiche, et sa composition est attachée à l'OCCURRENCE. Sans elle,
 * les 140 couverts du midi se commandent à l'aveugle — c'est le plus gros
 * volume de la semaine.
 */
export async function poserPlatDuJour(input: {
  date: string
  platDuJourId: string
  titre: string
  composition: Array<{ ingredient_id: string; quantite: number; unite: string }>
}) {
  await requireManager()
  const { date, platDuJourId, titre, composition } = z.object({
    date: ISO,
    platDuJourId: z.string().uuid(),
    titre: z.string().trim().max(120),
    composition: z.array(z.object({
      ingredient_id: z.string().uuid(),
      // ⚠️ Une quantité nulle ou négative n'est pas une composition : elle
      // ferait entrer une ligne qui ne consomme rien, ou qui rend du stock.
      quantite: z.number().positive(),
      unite: z.string().trim().min(1),
    })).max(40),
  }).parse(input)

  const sb = await createClient()
  const { data: deja } = await sb.from('plats_du_jour')
    .select('id').eq('recette_id', platDuJourId)
    .eq('date_debut', date).eq('date_fin', date).maybeSingle()

  // ⚠️ Un titre vide EFFACE le plat du jour de cette date. C'est le geste
  // naturel pour « finalement, pas de plat du jour lundi » — et sans lui on
  // commanderait pour un plat qu'on ne sert pas.
  if (!titre) {
    if (deja) {
      await sb.from('plat_du_jour_ingredients').delete().eq('plat_du_jour_id', deja.id)
      await sb.from('plats_du_jour').delete().eq('id', deja.id)
    }
    revalidatePath('/admin/ardoise'); revalidatePath('/admin/reassort')
    return { ok: true as const, efface: true }
  }

  let id = deja?.id as string | undefined
  if (!id) {
    const { data, error } = await sb.from('plats_du_jour')
      .insert({ recette_id: platDuJourId, titre, date_debut: date, date_fin: date, actif: true })
      .select('id').single()
    if (error) return { ok: false as const, erreur: error.message }
    id = data.id as string
  } else {
    const { error } = await sb.from('plats_du_jour').update({ titre }).eq('id', id)
    if (error) return { ok: false as const, erreur: error.message }
  }

  // ⚠️ On REMPLACE la composition : la modifier ligne à ligne laisserait les
  // ingrédients retirés en base, et le réassort les commanderait encore.
  await sb.from('plat_du_jour_ingredients').delete().eq('plat_du_jour_id', id)
  if (composition.length > 0) {
    const { error } = await sb.from('plat_du_jour_ingredients')
      .insert(composition.map(c => ({ plat_du_jour_id: id, ...c })))
    if (error) return { ok: false as const, erreur: error.message }
  }
  revalidatePath('/admin/ardoise'); revalidatePath('/admin/reassort')
  return { ok: true as const, lignes: composition.length }
}
