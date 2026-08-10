import { createClient } from '@/lib/supabase/server'
import RegistreMaintenancePrintClient from './RegistreMaintenancePrintClient'

export const metadata = { title: 'Registre maintenance — Impression', robots: { index: false, follow: false } }
export const dynamic = 'force-dynamic'

export type RegistreMaintenanceData = {
  etablissement: Record<string, string>
  equipements: Array<{ nom: string; marque: string | null; prestataire: string | null; prochaine: string | null; garantie: string | null }>
  controles: Array<{ equipement: string; type: string; derniere: string | null; prochaine: string | null; organisme: string | null }>
  interventions: Array<{ equipement: string | null; type: string | null; date: string | null; description: string | null; prestataire: string | null; cout: number }>
}

function nomEquip(j: { nom?: string | null } | { nom?: string | null }[] | null): string | null {
  const r = Array.isArray(j) ? j[0] : j
  return r?.nom ?? null
}

export default async function RegistreMaintenancePrintPage() {
  const supabase = await createClient()
  const debutIso = new Date(Date.now() - 365 * 86400000).toISOString().slice(0, 10)

  const [paramsRes, equipRes, ctrlRes, interRes] = await Promise.all([
    supabase.from('parametres').select('cle, valeur').in('cle', ['etablissement_nom', 'etablissement_adresse', 'etablissement_siret']),
    supabase.from('equipements')
      .select('nom, marque, modele, prestataire_maintenance, prochaine_maintenance, garantie_fin')
      .eq('actif', true)
      .order('nom'),
    supabase.from('equipements')
      .select('nom, type_controle_obligatoire, derniere_controle_obligatoire, prochain_controle_obligatoire, organisme_certifie')
      .eq('actif', true)
      .not('type_controle_obligatoire', 'is', null)
      .order('prochain_controle_obligatoire', { nullsFirst: false }),
    supabase.from('interventions_maintenance')
      .select('type, date_intervention, description, prestataire, cout, equipement:equipements!equipement_id(nom)')
      .gte('date_intervention', debutIso)
      .order('date_intervention', { ascending: false })
      .limit(200),
  ])

  const etab: Record<string, string> = {}
  for (const p of paramsRes.data ?? []) etab[p.cle as string] = (p.valeur as string) ?? ''

  const data: RegistreMaintenanceData = {
    etablissement: etab,
    equipements: (equipRes.data ?? []).map(e => ({
      nom: e.nom as string,
      marque: [e.marque, e.modele].filter(Boolean).join(' ') || null,
      prestataire: (e.prestataire_maintenance as string) ?? null,
      prochaine: (e.prochaine_maintenance as string) ?? null,
      garantie: (e.garantie_fin as string) ?? null,
    })),
    controles: (ctrlRes.data ?? []).map(c => ({
      equipement: c.nom as string,
      type: (c.type_controle_obligatoire as string) ?? '—',
      derniere: (c.derniere_controle_obligatoire as string) ?? null,
      prochaine: (c.prochain_controle_obligatoire as string) ?? null,
      organisme: (c.organisme_certifie as string) ?? null,
    })),
    interventions: (interRes.data ?? []).map(i => ({
      equipement: nomEquip(i.equipement as never),
      type: (i.type as string) ?? null,
      date: (i.date_intervention as string) ?? null,
      description: (i.description as string) ?? null,
      prestataire: (i.prestataire as string) ?? null,
      cout: Number(i.cout ?? 0),
    })),
  }

  return <RegistreMaintenancePrintClient data={data} />
}
