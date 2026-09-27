'use server'

// La commande conseillée devient un vrai bon de commande.
//
// ⚠️ Avant, cet écran ne savait produire qu'une LISTE À RECOPIER : une
// ligne de bon ne pouvait porter qu'un `ingredient_id`, et le Fournil
// commande des PRODUITS VENDUS (croissants, pâtons). La 0160 ouvre
// `recette_id`, donc la suggestion peut enfin devenir un document.
//
// ⚠️ Créer un bon N'ENVOIE RIEN. Il naît en brouillon ; l'envoi est un
// second geste, explicite, dans /admin/fournisseurs.

import { z } from 'zod'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { requireManager } from '@/lib/auth'
import { referenceBon } from '@/lib/bon-commande'

const Schema = z.object({
  fournisseur_id: z.string().uuid(),
  lignes: z.array(z.object({
    recette_id: z.string().uuid(),
    libelle: z.string().min(1).max(160),
    quantite: z.number().positive(),
    unite: z.string().max(24).nullable(),
  })).min(1).max(200),
})

export async function creerBonDepuisSuggestion(input: z.infer<typeof Schema>) {
  await requireManager()
  const { fournisseur_id, lignes } = Schema.parse(input)
  const sb = await createClient()

  // Le prix de l'unité ACHETÉE : `cout_achat_ht` est par unité VENDUE, et
  // on commande des unités d'achat (un carton de croissants, un flan
  // entier). ⚠️ Inconnu reste NULL, jamais 0 — un zéro sous-estimerait le
  // total annoncé au fournisseur.
  const { data: produits } = await sb.from('recettes')
    .select('id, cout_achat_ht, unites_par_achat')
    .in('id', lignes.map(l => l.recette_id))
  const cout = new Map((produits ?? []).map(p => {
    const c = p.cout_achat_ht == null ? null : Number(p.cout_achat_ht)
    const n = Number(p.unites_par_achat ?? 1) || 1
    return [p.id as string, c == null ? null : Number((c * n).toFixed(4))]
  }))

  const reference = referenceBon()
  const { data: bon, error } = await sb.from('bons_commande').insert({
    fournisseur_id,
    statut: 'brouillon',
    reference,
    notes: 'Créé depuis la commande conseillée du Fournil.',
  }).select('id').single()
  if (error || !bon) throw new Error(error?.message ?? 'Création impossible.')

  const payload = lignes.map(l => ({
    bon_commande_id: bon.id,
    recette_id: l.recette_id,
    libelle: l.libelle,
    quantite_commandee: l.quantite,
    unite: l.unite,
    prix_unitaire_ht: cout.get(l.recette_id) ?? null,
  }))
  const { error: e2 } = await sb.from('bon_commande_lignes').insert(payload)
  if (e2) {
    // ⚠️ Un bon sans ligne serait un document vide qu'on pourrait envoyer.
    await sb.from('bons_commande').delete().eq('id', bon.id)
    throw new Error(e2.message)
  }

  const total = payload.reduce((a, l) => a + (l.prix_unitaire_ht ?? 0) * l.quantite_commandee, 0)
  await sb.from('bons_commande').update({ montant_total_ht: Number(total.toFixed(2)) }).eq('id', bon.id)

  revalidatePath('/admin/fournisseurs')
  revalidatePath('/admin/commande-fournil')
  const sansPrix = payload.filter(l => l.prix_unitaire_ht == null).length
  return {
    ok: true as const,
    bon_id: bon.id as string,
    reference,
    message: `Bon ${reference} créé en brouillon — ${payload.length} ligne(s)`
      + (sansPrix ? `, dont ${sansPrix} sans prix connu.` : `.`)
      + ' Il ne partira que lorsque vous l\'enverrez.',
  }
}
