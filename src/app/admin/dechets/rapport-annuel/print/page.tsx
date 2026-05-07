import { createClient } from '@/lib/supabase/server'
import RapportAnnuelPrintClient from './RapportAnnuelPrintClient'
import { agregerParType, type Pesee, type Collecte, type TypeDechet } from '@/lib/dechets'
import { format } from 'date-fns'

export const metadata = { title: 'Rapport annuel déchets — Impression', robots: { index: false, follow: false } }
export const dynamic = 'force-dynamic'

export type RapportAnnuelData = {
  annee: number
  etablissement: Record<string, string>
  agg: ReturnType<typeof agregerParType>
  collectes: Collecte[]
  total_poids: number
  total_cout: number
}

export default async function RapportAnnuelPrint({ searchParams }: { searchParams: Promise<{ annee?: string }> }) {
  const sp = await searchParams
  const annee = sp.annee && /^\d{4}$/.test(sp.annee) ? Number(sp.annee) : new Date().getFullYear()
  const debut = `${annee}-01-01`
  const fin = `${annee}-12-31`

  const supabase = await createClient()
  const [paramsRes, peseesRes, collectesRes] = await Promise.all([
    supabase.from('parametres').select('cle, valeur').in('cle', ['etablissement_nom','etablissement_adresse','etablissement_siret']),
    supabase.from('suivi_dechets').select('id, date_pesee, type_dechet, poids_kg, cout_estime, employe_id, notes')
      .gte('date_pesee', debut).lte('date_pesee', fin),
    supabase.from('collectes_dechets').select('*')
      .gte('date_collecte', debut).lte('date_collecte', fin)
      .order('date_collecte'),
  ])

  const etab: Record<string, string> = {}
  for (const p of paramsRes.data ?? []) etab[p.cle as string] = (p.valeur as string) ?? ''

  const pesees: Pesee[] = (peseesRes.data ?? []).map(p => ({
    id: p.id as string, date_pesee: p.date_pesee as string,
    type_dechet: p.type_dechet as TypeDechet,
    poids_kg: Number(p.poids_kg ?? 0),
    cout_estime: Number(p.cout_estime ?? 0),
    employe_id: (p.employe_id as string) ?? null, employe_nom: null,
    notes: (p.notes as string) ?? null,
  }))

  const collectes: Collecte[] = (collectesRes.data ?? []).map(c => ({
    id: c.id as string,
    type_dechet: c.type_dechet as TypeDechet,
    date_collecte: c.date_collecte as string,
    prestataire: c.prestataire as string,
    poids_total_kg: c.poids_total_kg != null ? Number(c.poids_total_kg) : null,
    num_bsd: (c.num_bsd as string) ?? null,
    cout_collecte: c.cout_collecte != null ? Number(c.cout_collecte) : null,
    document_url: (c.document_url as string) ?? null,
    notes: (c.notes as string) ?? null,
  }))

  const agg = agregerParType(pesees)
  const total_poids = pesees.reduce((s, p) => s + p.poids_kg, 0)
  const total_cout = pesees.reduce((s, p) => s + p.cout_estime, 0)

  return <RapportAnnuelPrintClient data={{ annee, etablissement: etab, agg, collectes, total_poids, total_cout }} />
}
