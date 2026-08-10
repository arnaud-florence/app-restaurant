// Registre multi-établissement — gère la table `etablissements` (créée en 0074,
// étendue en 0088 avec `type`). Permet de configurer le restaurant + le fournil
// (nom, type, adresse, SIRET, TVA, actif). Fondation du futur sélecteur d'établissement.
//
// NB : aujourd'hui le « nom d'établissement » historique vit aussi dans `parametres`
// (setup wizard). La réconciliation parametres ↔ etablissements est un chantier ultérieur.

import { createClient } from '@/lib/supabase/server'
import EtablissementsClient from './EtablissementsClient'

export const metadata = { title: 'Points de vente — Admin' }
export const dynamic = 'force-dynamic'

export type Etablissement = {
  id: string
  nom: string
  slug: string
  type: string
  categorie: string | null
  inclus_ca_principal: boolean
  mode_fiscal: string | null
  adresse: string | null
  telephone: string | null
  email: string | null
  siret: string | null
  tva_intra: string | null
  actif: boolean
  is_principal: boolean
  created_at: string | null
}

export default async function EtablissementsPage() {
  const supabase = await createClient()
  const { data } = await supabase
    .from('etablissements')
    .select('id, nom, slug, type, categorie, inclus_ca_principal, mode_fiscal, adresse, telephone, email, siret, tva_intra, actif, is_principal, created_at')
    .order('ordre', { ascending: true })
    .order('is_principal', { ascending: false })

  return <EtablissementsClient initial={(data ?? []) as Etablissement[]} />
}
