// Réassort — le stock, les seuils, et ce qu'il faut commander.
//
// L'écran qui manquait entre `(ops)/inventaire` (ce qu'on a compté),
// `/admin/achats` (chez qui, à quel prix) et les bons de commande. Sans
// lui, les trois existaient sans se parler.
//
// ⚠️ La construction des lignes vit dans `src/lib/reassort-donnees.ts`, et
// PAS ici : l'agent Stock lit exactement les mêmes. Deux constructions
// pour la même question finissent par donner deux chiffres, et c'est celui
// qu'on lit le matin qui décide.

import { createClient } from '@/lib/supabase/server'
import { chargerLignesReassort } from '@/lib/reassort-donnees'
import ReassortClient from './ReassortClient'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Réassort' }

/**
 * ⚠️⚠️ ON DIMENSIONNE SUR LA SEMAINE QU'ON VA SERVIR, PAS SUR AUJOURD'HUI.
 * `?pour=AAAA-MM-JJ` choisit la date de référence — c'est elle qui
 * sélectionne l'ardoise. Mesuré le 05/10/2026, à sept jours de
 * l'ouverture : l'ardoise du 12 au 18 octobre était saisie, et les 223
 * cibles tombaient quand même sur le repli `stock_cible`, c'est-à-dire
 * sur la carte ENTIÈRE. On aurait commandé toute la carte pour servir une
 * ardoise réduite, sans que rien ne le signale.
 *
 * Une commande se passe plusieurs jours avant la livraison : la date du
 * jour est presque toujours la mauvaise borne.
 */
export default async function ReassortPage({
  searchParams,
}: { searchParams: { pour?: string } }) {
  const sb = await createClient()
  // ⚠️ Une date illisible retombe sur aujourd'hui plutôt que de casser
  // l'écran : un réassort muet empêcherait de commander.
  const brut = searchParams?.pour ?? ''
  const pour = /^\d{4}-\d{2}-\d{2}$/.test(brut) ? brut : new Date().toISOString().slice(0, 10)
  return <ReassortClient lignes={await chargerLignesReassort(sb, pour)} pour={pour} />
}
