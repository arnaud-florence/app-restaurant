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
import { referenceBon } from '@/lib/bon-commande'

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

/**
 * Crée UN BON DE COMMANDE EN BROUILLON par fournisseur, depuis le réassort.
 *
 * C'est le chaînon qui manquait : l'écran savait dire « il faut 10 kg de
 * beurre chez Gineys » et il fallait tout retaper ailleurs. Entre deux
 * saisies, on se trompe de quantité — et personne ne s'en aperçoit avant la
 * livraison.
 *
 * ⚠️ CRÉER N'ENVOIE RIEN. Le bon naît en `brouillon` ; l'envoi reste un
 * second geste explicite dans /admin/fournisseurs (0160). Un bouton qui
 * commanderait depuis un écran de calcul ferait partir des commandes qu'on
 * croyait simuler.
 */
const SchemaBons = z.object({
  lignes: z.array(z.object({
    fournisseur_id: z.string().uuid(),
    // ⚠️ SOIT un produit, SOIT une matière — la table impose au moins une
    // identification (0160), et un libellé seul ne se retrouve pas.
    recette_id: z.string().uuid().nullable(),
    ingredient_id: z.string().uuid().nullable(),
    libelle: z.string().min(1),
    quantite: z.number().positive(),
    unite: z.string().min(1),
    prix_unitaire_ht: z.number().nullable(),
  })).min(1),
})

export async function creerBonsDepuisReassort(input: z.infer<typeof SchemaBons>) {
  await requireManager()
  const { lignes } = SchemaBons.parse(input)
  const sb = await createClient()

  const parFournisseur = new Map<string, typeof lignes>()
  for (const l of lignes) {
    if (!parFournisseur.has(l.fournisseur_id)) parFournisseur.set(l.fournisseur_id, [])
    parFournisseur.get(l.fournisseur_id)!.push(l)
  }

  const crees: Array<{ fournisseur_id: string; bon_id: string; lignes: number; sansPrix: number }> = []
  const dejaEnCours: string[] = []

  // ⚠️⚠️ L'AGENT STOCK CRÉE LES MÊMES BROUILLONS, toutes les deux heures et
  // depuis les mêmes lignes. Sans garde-fou, l'écran et l'agent produisent
  // chacun leur bon pour le même besoin : deux documents identiques, et si
  // les deux partent, la marchandise arrive en double. L'agent a son propre
  // anti-doublon (6 h) ; voici le pendant, côté écran.
  const sixHeures = new Date(Date.now() - 6 * 3600_000).toISOString()
  const { data: enCours } = await sb.from('bons_commande')
    .select('fournisseur_id, fournisseurs(nom)')
    .eq('statut', 'brouillon')
    .gte('created_at', sixHeures)
    .in('fournisseur_id', [...parFournisseur.keys()])
  const bloques = new Set((enCours ?? []).map(b => b.fournisseur_id as string))

  for (const [fournisseur_id, siennes] of parFournisseur) {
    if (bloques.has(fournisseur_id)) {
      const nom = (enCours ?? []).find(b => b.fournisseur_id === fournisseur_id)
      const f = nom?.fournisseurs as { nom?: string } | { nom?: string }[] | null
      dejaEnCours.push((Array.isArray(f) ? f[0]?.nom : f?.nom) ?? 'fournisseur')
      continue
    }
    const { data: bon, error } = await sb.from('bons_commande').insert({
      fournisseur_id,
      statut: 'brouillon',
      reference: referenceBon(),
      notes: 'Créé depuis le réassort — quantités = cible − stock compté.',
    }).select('id').single()
    if (error || !bon) throw new Error(error?.message ?? 'Création impossible.')

    const payload = siennes.map(l => ({
      bon_commande_id: bon.id,
      recette_id: l.recette_id,
      ingredient_id: l.ingredient_id,
      libelle: l.libelle,
      quantite_commandee: l.quantite,
      unite: l.unite,
      // ⚠️ Un prix inconnu reste NULL, jamais 0 : un zéro sous-estimerait
      // le total annoncé au fournisseur, et personne ne le verrait.
      prix_unitaire_ht: l.prix_unitaire_ht,
    }))
    const { error: e2 } = await sb.from('bon_commande_lignes').insert(payload)
    if (e2) {
      // ⚠️ Un bon SANS ligne est un document vide qu'on pourrait envoyer.
      await sb.from('bons_commande').delete().eq('id', bon.id)
      throw new Error(e2.message)
    }

    // ⚠️⚠️ UN TOTAL À ZÉRO SE LIT « GRATUIT ». Quand la commande bascule
    // chez le moins cher, aucune ligne ne porte de prix — notre
    // conditionnement n'est pas le leur. Sommer des NULL donnerait 0,00 €
    // sur un bon de 12 lignes, et un zéro affiché est cru : c'est la faute
    // de `statutFoodCost(0)` (0150) et du tableau d'allergènes vide (0138).
    // Un montant inconnu reste NULL, et l'écran dit « tarif à confirmer ».
    const connus = payload.filter(l => l.prix_unitaire_ht != null)
    const total = connus.length
      ? Number(connus.reduce((a, l) => a + (l.prix_unitaire_ht ?? 0) * l.quantite_commandee, 0).toFixed(2))
      : null
    await sb.from('bons_commande').update({ montant_total_ht: total }).eq('id', bon.id)

    crees.push({
      fournisseur_id, bon_id: bon.id, lignes: payload.length,
      sansPrix: payload.filter(l => l.prix_unitaire_ht == null).length,
    })
  }

  revalidatePath('/admin/fournisseurs')
  revalidatePath('/admin/reassort')
  // ⚠️ Un doublon évité est DIT, pas tu : sans ça le gérant croirait avoir
  // créé cinq bons et n'en trouverait que trois, sans savoir pourquoi.
  return { ok: true as const, crees, dejaEnCours }
}
