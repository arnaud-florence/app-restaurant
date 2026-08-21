import { createClient } from '@/lib/supabase/server'
import RegistreHygienePrintClient from './RegistreHygienePrintClient'

export const metadata = { title: 'Registre HACCP — Impression', robots: { index: false, follow: false } }
export const dynamic = 'force-dynamic'

export type RegistreHygieneData = {
  etablissement: Record<string, string>
  periodeDebut: string
  temperatures: Array<{ equipement: string; type: string | null; temperature: number; conforme: boolean | null; date: string; employe: string | null }>
  checklists: Array<{ procedure: string; date: string; heure: string | null; valide: boolean; employe: string | null }>
  nonConformites: Array<{ date: string; type: string; gravite: string; description: string; action: string | null; statut: string }>
}

function nom(j: { prenom?: string | null; nom?: string | null } | { prenom?: string | null; nom?: string | null }[] | null): string | null {
  const r = Array.isArray(j) ? j[0] : j
  if (!r) return null
  return `${r.prenom ?? ''} ${r.nom ?? ''}`.trim() || null
}

export default async function RegistreHygienePrintPage() {
  const supabase = await createClient()
  const debutIso = new Date(Date.now() - 30 * 86400000).toISOString()
  const debutDate = debutIso.slice(0, 10)

  const [paramsRes, tempRes, checkRes, ncRes] = await Promise.all([
    supabase.from('parametres').select('cle, valeur').in('cle', ['etablissement_nom', 'etablissement_adresse', 'etablissement_siret']),
    supabase.from('releves_temperatures')
      .select('equipement, type_equipement, temperature, conforme, date_releve, created_at, employe:employes!employe_id(prenom, nom)')
      .gte('date_releve', debutDate)
      .order('date_releve', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(300),
    supabase.from('checklists_hygiene')
      .select('date_realisation, heure_realisation, valide, employe:employes!employe_id(prenom, nom), procedure:procedures_hygiene!procedure_id(nom)')
      .gte('date_realisation', debutDate)
      .order('date_realisation', { ascending: false })
      .limit(300),
    supabase.from('non_conformites')
      .select('date_constat, type, gravite, description, action_corrective, statut')
      .gte('date_constat', debutDate)
      .order('date_constat', { ascending: false })
      .limit(100),
  ])

  const etab: Record<string, string> = {}
  for (const p of paramsRes.data ?? []) etab[p.cle as string] = (p.valeur as string) ?? ''

  const data: RegistreHygieneData = {
    etablissement: etab,
    periodeDebut: debutDate,
    temperatures: (tempRes.data ?? []).map(t => ({
      equipement: t.equipement as string,
      type: (t.type_equipement as string) ?? null,
      temperature: Number(t.temperature ?? 0),
      conforme: (t.conforme as boolean) ?? null,
      date: (t.date_releve ?? t.created_at) as string,
      employe: nom(t.employe as never),
    })),
    checklists: (checkRes.data ?? []).map(c => ({
      procedure: nom(c.procedure as never) ?? ((Array.isArray(c.procedure) ? c.procedure[0]?.nom : (c.procedure as { nom?: string } | null)?.nom) ?? '—'),
      date: c.date_realisation as string,
      heure: (c.heure_realisation as string) ?? null,
      valide: !!c.valide,
      employe: nom(c.employe as never),
    })),
    nonConformites: (ncRes.data ?? []).map(n => ({
      date: n.date_constat as string,
      type: n.type as string,
      gravite: n.gravite as string,
      description: n.description as string,
      action: (n.action_corrective as string) ?? null,
      statut: n.statut as string,
    })),
  }

  return <RegistreHygienePrintClient data={data} />
}
