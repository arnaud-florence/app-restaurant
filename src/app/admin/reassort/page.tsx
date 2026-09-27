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

export default async function ReassortPage() {
  const sb = await createClient()
  return <ReassortClient lignes={await chargerLignesReassort(sb)} />
}
