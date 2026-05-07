import { createClient } from '@/lib/supabase/server'
import RegistrePrintClient from './RegistrePrintClient'

export const metadata = { title: 'Registre du personnel — Impression', robots: { index: false, follow: false } }
export const dynamic = 'force-dynamic'

export type RegistreEntry = {
  numero: number
  nom: string
  prenom: string
  poste: string
  type_contrat: string
  date_embauche: string | null
  date_sortie: string | null
  heures_contrat: number
  email: string | null
  telephone: string | null
}

export default async function RegistrePrintPage() {
  const supabase = await createClient()
  const [empRes, paramsRes] = await Promise.all([
    supabase.from('employes')
      .select('id, prenom, nom, poste, type_contrat, email, telephone, heures_contrat, date_embauche, date_sortie, created_at')
      .order('created_at'),
    supabase.from('parametres')
      .select('cle, valeur')
      .in('cle', ['etablissement_nom','etablissement_adresse','etablissement_siret']),
  ])

  const entries: RegistreEntry[] = (empRes.data ?? []).map((e, i) => ({
    numero: i + 1,
    nom: e.nom as string,
    prenom: e.prenom as string,
    poste: e.poste as string,
    type_contrat: e.type_contrat as string,
    date_embauche: (e.date_embauche as string) ?? null,
    date_sortie: (e.date_sortie as string) ?? null,
    heures_contrat: Number(e.heures_contrat ?? 0),
    email: (e.email as string) ?? null,
    telephone: (e.telephone as string) ?? null,
  }))

  const etab: Record<string, string> = {}
  for (const p of paramsRes.data ?? []) etab[p.cle as string] = (p.valeur as string) ?? ''

  return <RegistrePrintClient entries={entries} etablissement={etab} />
}
