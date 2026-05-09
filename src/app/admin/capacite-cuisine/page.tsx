// Module Capacité cuisine — limite des commandes ONLINE par créneau (anti-rush).
// Configuré par jour de semaine + plage horaire + max commandes / créneau.

import { createClient } from '@/lib/supabase/server'
import CapaciteClient from './CapaciteClient'

export const metadata = { title: 'Capacité cuisine — Admin' }
export const dynamic = 'force-dynamic'

export type CreneauCapacite = {
  id: string
  tag_destination: 'CUISINE' | 'SNACKING' | 'PIZZA' | 'BAR'
  jour_semaine: number             // 0=dim, 6=sam
  heure_debut: string              // HH:MM
  heure_fin: string
  duree_creneau_min: number
  max_commandes: number
  actif: boolean
  created_at: string
}

export default async function CapacitePage() {
  const sb = await createClient()
  const { data } = await sb.from('capacite_cuisine_par_creneau')
    .select('*')
    .order('tag_destination')
    .order('jour_semaine')
    .order('heure_debut')

  type Row = {
    id: string; tag_destination: string; jour_semaine: number;
    heure_debut: string; heure_fin: string;
    duree_creneau_min: number | string; max_commandes: number | string;
    actif: boolean; created_at: string;
  }
  const creneaux: CreneauCapacite[] = ((data ?? []) as Row[]).map(r => ({
    id: r.id,
    tag_destination: (r.tag_destination as CreneauCapacite['tag_destination']) ?? 'SNACKING',
    jour_semaine: Number(r.jour_semaine),
    heure_debut: r.heure_debut.slice(0, 5),
    heure_fin: r.heure_fin.slice(0, 5),
    duree_creneau_min: Number(r.duree_creneau_min ?? 15),
    max_commandes: Number(r.max_commandes ?? 5),
    actif: r.actif,
    created_at: r.created_at,
  }))

  return <CapaciteClient creneaux={creneaux} />
}
