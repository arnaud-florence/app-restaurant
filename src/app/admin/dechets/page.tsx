import { createClient } from '@/lib/supabase/server'
import DechetsClient from './DechetsClient'
import { type Pesee, type Collecte, type TypeDechet, agregerParType, agregerParMois } from '@/lib/dechets'

export const metadata = { title: 'Déchets — Admin' }
export const dynamic = 'force-dynamic'

export type DataDechets = {
  pesees: Pesee[]
  collectes: Collecte[]
  employes: { id: string; prenom: string; nom: string }[]
  // Pré-calculs
  agg_an: ReturnType<typeof agregerParType>
  agg_mois: ReturnType<typeof agregerParType>
  agg_par_mois: ReturnType<typeof agregerParMois>
  total_an_poids: number
  total_an_cout: number
  total_mois_cout: number
}

export default async function DechetsPage() {
  const supabase = await createClient()
  const today = new Date()
  const debutAn = new Date(today.getFullYear() - 1, today.getMonth(), today.getDate()).toISOString().slice(0, 10)
  const debutMois = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-01`

  const [peseesRes, collectesRes, empRes] = await Promise.all([
    supabase.from('suivi_dechets')
      .select('*, employe:employes!employe_id(prenom, nom)')
      .gte('date_pesee', debutAn)
      .order('date_pesee', { ascending: false })
      .limit(500),
    supabase.from('collectes_dechets')
      .select('*')
      .gte('date_collecte', debutAn)
      .order('date_collecte', { ascending: false })
      .limit(200),
    supabase.from('employes').select('id, prenom, nom').eq('actif', true).order('prenom'),
  ])

  type PeseeRow = { id: string; date_pesee: string; type_dechet: string; poids_kg: number | string;
    cout_estime: number | string | null; employe_id: string | null; notes: string | null;
    employe?: { prenom?: string; nom?: string } | null }
  const pesees: Pesee[] = ((peseesRes.data ?? []) as PeseeRow[]).map(p => ({
    id: p.id,
    date_pesee: p.date_pesee,
    type_dechet: p.type_dechet as TypeDechet,
    poids_kg: Number(p.poids_kg ?? 0),
    cout_estime: Number(p.cout_estime ?? 0),
    employe_id: p.employe_id,
    employe_nom: p.employe ? `${p.employe.prenom ?? ''} ${p.employe.nom ?? ''}`.trim() : null,
    notes: p.notes,
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

  const employes = (empRes.data ?? []).map(e => ({ id: e.id as string, prenom: e.prenom as string, nom: e.nom as string }))

  const peseesMois = pesees.filter(p => p.date_pesee >= debutMois)
  const agg_an = agregerParType(pesees)
  const agg_mois = agregerParType(peseesMois)
  const agg_par_mois = agregerParMois(pesees)
  const total_an_poids = pesees.reduce((s, p) => s + p.poids_kg, 0)
  const total_an_cout = pesees.reduce((s, p) => s + p.cout_estime, 0)
  const total_mois_cout = peseesMois.reduce((s, p) => s + p.cout_estime, 0)

  return (
    <DechetsClient
      data={{
        pesees, collectes, employes,
        agg_an, agg_mois, agg_par_mois,
        total_an_poids, total_an_cout, total_mois_cout,
      }}
    />
  )
}
