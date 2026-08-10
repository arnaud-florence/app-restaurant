'use server'

// Co-gérant « Arnaud » — actions de l'écran (Phase 1.2/1.3, domaine carte).
// Mode C : Arnaud propose, le gérant valide d'un tap → la recette est créée.

import { requireManager } from '@/lib/auth'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { genererPropositionsPlats, affinerProposition, genererFamille, ajusterPrixProposition, type LignePlat } from '@/lib/co-gerant/proposer-plats'
import { auditerChantiers, lancerChantier } from '@/lib/co-gerant/chantiers'
import { appliquerPrixRecette } from '@/lib/co-gerant/optimiser-carte'
import { preparerBrouillon, posterMessageEquipe } from '@/lib/co-gerant/messages'
import { type BrouillonMessage } from '@/lib/co-gerant/types'
import { genererBriefDuJour, type BriefDuJour } from '@/lib/co-gerant/brief'
import { chatAvecArnaud, type ChatMsg } from '@/lib/co-gerant/chat'
import { getProposition, marquerFaite, changerStatut, setContexteParam } from '@/lib/co-gerant/propositions'
import { createRecette } from '@/app/admin/recettes/actions'
import { createIngredient } from '@/app/admin/ingredients/actions'
import { createBoisson } from '@/app/admin/boissons/actions'
import { CONTEXTE_CLES, FAMILLES, type FamilleId } from '@/lib/co-gerant/types'

/** Arnaud génère une proposition de carte (plats + food cost). */
export async function genererCarteAction(nb: number): Promise<{ propositionsCreees: number }> {
  await requireManager()
  const res = await genererPropositionsPlats({ nb: Math.min(Math.max(Math.round(nb) || 6, 1), 10), persister: true })
  revalidatePath('/admin/co-gerant')
  return { propositionsCreees: res.propositionsCreees }
}

/** Arnaud génère UNE famille de la carte (le client les enchaîne pour la carte complète). */
export async function genererFamilleAction(famId: string): Promise<{ items: number }> {
  await requireManager()
  if (!FAMILLES.some(f => f.id === famId)) throw new Error('Famille inconnue')
  const r = await genererFamille(famId as FamilleId, true)
  revalidatePath('/admin/co-gerant')
  return r
}

/** Retravaille le prix d'une proposition (à la hausse / à la baisse) → food cost recalculé. */
export async function ajusterPrixAction(id: string, prix: number): Promise<{ prix: number; foodCost: number }> {
  await requireManager()
  const r = await ajusterPrixProposition(id, prix)
  revalidatePath('/admin/co-gerant')
  return { prix: r.prix, foodCost: r.foodCost }
}

/** Le gérant valide → ingrédients manquants créés, puis recette + proposition faite. */
export async function validerPropositionAction(id: string): Promise<{ ok: true }> {
  const profil = await requireManager()
  const prop = await getProposition(id)
  if (!prop) throw new Error('Proposition introuvable')
  if (prop.action_type === 'create_recette' && prop.action_payload) {
    const pl = prop.action_payload as { recette: unknown; ingredients?: LignePlat[] }
    const sb = await createClient()
    const lignesFinales: Array<{ id: string; ingredient_id: string; quantite: number; unite: string }> = []
    let i = 0
    for (const l of pl.ingredients ?? []) {
      let ingId = l.ingredient_id
      if (!ingId) {
        // Dédoublonnage : si un ingrédient du même nom existe déjà, on le réutilise.
        const { data: existing } = await sb.from('ingredients').select('id').ilike('nom', l.nom).limit(1).maybeSingle()
        if (existing?.id) {
          ingId = existing.id as string
        } else {
          const created = await createIngredient({
            nom: l.nom, categorie: l.categorie || 'Divers', unite: l.unite || 'pièce',
            prix_achat_ht: l.prix_achat_ht ?? 0,
            stock_actuel: 0, stock_minimum: 0, stock_maximum: 0, dlc_moyenne_jours: 0, allergenes: [],
          })
          ingId = created.id
        }
      }
      lignesFinales.push({ id: `cg-${i++}`, ingredient_id: ingId, quantite: l.quantite, unite: l.unite })
    }
    await createRecette({ recette: pl.recette, ingredients: lignesFinales })
  } else if (prop.action_type === 'create_boisson' && prop.action_payload) {
    const pl = prop.action_payload as {
      boisson: { nom: string; type: string; description?: string; prix_achat_ht_verre: number; prix_vente_ht_verre: number; contenance_verre_cl: number; tva: number }
    }
    const b = pl.boisson
    // On mappe une boisson « au verre » sur le schéma boissons : la bouteille = un verre,
    // pour que le coût/verre calculé par l'app corresponde au coût matière estimé.
    await createBoisson({
      nom: b.nom, type: b.type,
      appellation: null, millesime: null, region: null, cepage: null, couleur: null,
      fournisseur_principal: null, fournisseur_secondaire: null,
      prix_achat_ht_bouteille: b.prix_achat_ht_verre, contenance_bouteille_cl: b.contenance_verre_cl,
      prix_achat_ht_fut: 0, contenance_fut_cl: 0,
      prix_vente_ht_verre: b.prix_vente_ht_verre, contenance_verre_cl: b.contenance_verre_cl,
      prix_vente_ht_bouteille: 0, prix_vente_ht_pinte: 0, contenance_pinte_cl: 0, tva: b.tva,
      stock_actuel_bouteilles: 0, stock_minimum_bouteilles: 0, stock_actuel_futs: 0, stock_minimum_futs: 0,
      description: b.description ?? null, photo_url: null, actif: true, ordre: 0,
    })
  }
  await marquerFaite(id, `Validé par ${profil?.email ?? 'le gérant'}`)
  revalidatePath('/admin/co-gerant')
  revalidatePath('/admin/recettes')
  revalidatePath('/admin/ingredients')
  revalidatePath('/admin/boissons')
  return { ok: true }
}

/** Le gérant demande un ajustement → Arnaud réajuste le plat (le peaufinage). */
export async function affinerPropositionAction(id: string, instruction: string): Promise<{ explication: string }> {
  await requireManager()
  const inst = (instruction || '').trim()
  if (!inst) throw new Error('Dis à Arnaud ce que tu veux ajuster.')
  const r = await affinerProposition(id, inst.slice(0, 300))
  revalidatePath('/admin/co-gerant')
  return { explication: r.explication }
}

/** Arnaud fait le tour du resto et soumet ses chantiers. */
export async function auditerChantiersAction(): Promise<{ crees: number; total: number }> {
  await requireManager()
  const r = await auditerChantiers(true)
  revalidatePath('/admin/co-gerant')
  return r
}

/** Le gérant lance un chantier → Arnaud fait le boulot et rend compte. */
export async function lancerChantierAction(id: string): Promise<{ message: string }> {
  await requireManager()
  const r = await lancerChantier(id)
  revalidatePath('/admin/co-gerant')
  revalidatePath('/admin/fournisseurs')
  revalidatePath('/admin/ingredients')
  revalidatePath('/admin/recettes')
  revalidatePath('/admin/boissons')
  return r
}

/** Arnaud applique un nouveau prix à un plat EXISTANT (il agit sur la vraie carte). */
export async function appliquerPrixRecetteAction(id: string, prix: number): Promise<{ ok: true }> {
  await requireManager()
  await appliquerPrixRecette(id, prix)
  revalidatePath('/admin/co-gerant')
  revalidatePath('/admin/recettes')
  revalidatePath('/admin/recettes/engineering')
  return { ok: true }
}

/** Arnaud prépare un brouillon de message (mode C : il prépare, tu valides). */
export async function preparerBrouillonAction(demande: string): Promise<BrouillonMessage> {
  await requireManager()
  const d = (demande || '').trim()
  if (!d) throw new Error('Dis à Arnaud quel message préparer.')
  return preparerBrouillon(d.slice(0, 400))
}

/** Le gérant valide → le message part à l'équipe (action explicite du patron). */
export async function envoyerMessageEquipeAction(texte: string, canal: string): Promise<{ ok: true }> {
  await requireManager()
  await posterMessageEquipe(canal, texte)
  revalidatePath('/equipes')
  return { ok: true }
}

/** Le gérant rejette une proposition. */
export async function rejeterPropositionAction(id: string): Promise<{ ok: true }> {
  const profil = await requireManager()
  await changerStatut(id, 'rejetee', profil?.email ?? 'le gérant')
  revalidatePath('/admin/co-gerant')
  return { ok: true }
}

/** Tu parles à Arnaud → il interprète et agit (puis confirme). */
export async function chatArnaudAction(history: ChatMsg[]): Promise<{ reponse: string; aAgi: boolean }> {
  await requireManager()
  const r = await chatAvecArnaud(history)
  if (r.aAgi) revalidatePath('/admin/co-gerant')
  return r
}

/** Génère (ou rafraîchit) le mot du matin d'Arnaud. */
export async function genererBriefAction(): Promise<BriefDuJour> {
  await requireManager()
  const brief = await genererBriefDuJour()
  revalidatePath('/admin/co-gerant')
  return brief
}

/** Enregistre le contexte resto (l'ADN qui guide Arnaud). */
export async function setContexteAction(data: Record<string, string>): Promise<{ ok: true }> {
  await requireManager()
  for (const cle of CONTEXTE_CLES) {
    if (cle in data) await setContexteParam(cle, data[cle]?.trim() || null)
  }
  revalidatePath('/admin/co-gerant')
  return { ok: true }
}
