import { createClient } from '@/lib/supabase/server'
import MaintenanceClient from './MaintenanceClient'
import {
  type Equipement, type Intervention,
  type CategorieEquip, type TypeControle, type TypeIntervention,
} from '@/lib/maintenance'

export const metadata = { title: 'Maintenance — Admin' }
export const dynamic = 'force-dynamic'

export type DataMaintenance = {
  equipements: Equipement[]
  interventions: Intervention[]
}

export default async function MaintenancePage() {
  const supabase = await createClient()

  const [equipRes, interRes] = await Promise.all([
    supabase.from('equipements')
      .select('*')
      .order('actif', { ascending: false })
      .order('nom'),
    supabase.from('interventions_maintenance')
      .select('id, equipement_id, type, date_intervention, description, prestataire, cout, prochaine_intervention, documents_url, equipement:equipements(nom)')
      .order('date_intervention', { ascending: false })
      .limit(200),
  ])

  const equipements: Equipement[] = (equipRes.data ?? []).map(e => ({
    id: e.id as string,
    nom: e.nom as string,
    marque: (e.marque as string) ?? null,
    modele: (e.modele as string) ?? null,
    numero_serie: (e.numero_serie as string) ?? null,
    date_achat: (e.date_achat as string) ?? null,
    valeur_achat: e.valeur_achat != null ? Number(e.valeur_achat) : null,
    garantie_fin: (e.garantie_fin as string) ?? null,
    prestataire_maintenance: (e.prestataire_maintenance as string) ?? null,
    contact_prestataire: (e.contact_prestataire as string) ?? null,
    frequence_maintenance: (e.frequence_maintenance as string) ?? null,
    prochaine_maintenance: (e.prochaine_maintenance as string) ?? null,
    categorie: (e.categorie as CategorieEquip) ?? null,
    type_controle_obligatoire: (e.type_controle_obligatoire as TypeControle) ?? null,
    prochain_controle_obligatoire: (e.prochain_controle_obligatoire as string) ?? null,
    derniere_controle_obligatoire: (e.derniere_controle_obligatoire as string) ?? null,
    organisme_certifie: (e.organisme_certifie as string) ?? null,
    actif: Boolean(e.actif),
  }))

  type InterRow = {
    id: string; equipement_id: string | null; type: string;
    date_intervention: string | null; description: string | null; prestataire: string | null;
    cout: number | string; prochaine_intervention: string | null; documents_url: string[] | null;
    equipement?: { nom?: string } | null;
  }
  const interventions: Intervention[] = ((interRes.data ?? []) as InterRow[]).map(i => ({
    id: i.id,
    equipement_id: i.equipement_id,
    equipement_nom: i.equipement?.nom ?? null,
    type: i.type as TypeIntervention,
    date_intervention: i.date_intervention,
    description: i.description,
    prestataire: i.prestataire,
    cout: Number(i.cout ?? 0),
    prochaine_intervention: i.prochaine_intervention,
    documents_url: i.documents_url ?? [],
  }))

  return <MaintenanceClient data={{ equipements, interventions }} />
}
