// Commissions services tiers (FDJ / Tabac / Relais colis).
// Saisie manuelle des commissions (= notre revenu) pour les points de vente
// marqués « hors CA principal ». Module opérationnel, indépendant de toute caisse.

import { createClient } from '@/lib/supabase/server'
import CommissionsClient from './CommissionsClient'

export const metadata = { title: 'Commissions tiers — Admin' }
export const dynamic = 'force-dynamic'

export type ServiceTiers = {
  id: string
  nom: string
  categorie: string | null
  couleur: string | null
}

export type Commission = {
  id: string
  etablissement_id: string
  periode_debut: string
  periode_fin: string
  montant_commission: number
  montant_brut_transite: number | null
  nb_operations: number | null
  notes: string | null
  service_nom: string
}

export default async function CommissionsPage() {
  const supabase = await createClient()

  // Tous les établissements (pour la table de noms) + ceux « hors CA » = services tiers
  const { data: etabData } = await supabase
    .from('etablissements')
    .select('id, nom, categorie, couleur, inclus_ca_principal, actif, ordre')
    .order('ordre', { ascending: true })

  const etabs = (etabData ?? []) as Array<{
    id: string; nom: string; categorie: string | null; couleur: string | null
    inclus_ca_principal: boolean; actif: boolean
  }>
  const nameMap = new Map(etabs.map(e => [e.id, e.nom]))
  const services: ServiceTiers[] = etabs
    .filter(e => e.inclus_ca_principal === false && e.actif)
    .map(e => ({ id: e.id, nom: e.nom, categorie: e.categorie, couleur: e.couleur }))

  // Historique des commissions — SANS join imbriqué (noms résolus via nameMap).
  // Si la table n'existe pas encore (0093 non lancé) → liste vide, sans crash.
  const { data: commData } = await supabase
    .from('commissions_tiers')
    .select('id, etablissement_id, periode_debut, periode_fin, montant_commission, montant_brut_transite, nb_operations, notes')
    .order('periode_debut', { ascending: false })
    .limit(200)

  const commissions: Commission[] = ((commData ?? []) as Array<Record<string, unknown>>).map(c => ({
    id: String(c.id),
    etablissement_id: String(c.etablissement_id),
    periode_debut: String(c.periode_debut),
    periode_fin: String(c.periode_fin),
    montant_commission: Number(c.montant_commission ?? 0),
    montant_brut_transite: c.montant_brut_transite == null ? null : Number(c.montant_brut_transite),
    nb_operations: c.nb_operations == null ? null : Number(c.nb_operations),
    notes: (c.notes as string | null) ?? null,
    service_nom: nameMap.get(String(c.etablissement_id)) ?? '—',
  }))

  return <CommissionsClient services={services} commissions={commissions} />
}
