import { chargerCRMois } from '../../actions'
import { createClient } from '@/lib/supabase/server'
import RapportPrintClient from './RapportPrintClient'
import { format } from 'date-fns'

export const metadata = { title: 'Rapport mensuel — Impression', robots: { index: false, follow: false } }
export const dynamic = 'force-dynamic'

export default async function RapportPrintPage({ searchParams }: { searchParams: Promise<{ mois?: string }> }) {
  const sp = await searchParams
  const moisIso = sp.mois && /^\d{4}-\d{2}$/.test(sp.mois) ? sp.mois : format(new Date(), 'yyyy-MM')

  const supabase = await createClient()
  const [crData, paramsRes, chargesRes] = await Promise.all([
    chargerCRMois(moisIso),
    supabase.from('parametres').select('cle, valeur').in('cle', ['etablissement_nom','etablissement_adresse','etablissement_siret','etablissement_tva_intra']),
    supabase.from('charges_fixes').select('libelle, categorie, montant_ttc, frequence').eq('actif', true).order('montant_ttc', { ascending: false }),
  ])

  const etab: Record<string, string> = {}
  for (const p of paramsRes.data ?? []) etab[p.cle as string] = (p.valeur as string) ?? ''

  type ChargeRow = { libelle: string; categorie: string; montant_ttc: number | string; frequence: string }
  const charges = ((chargesRes.data ?? []) as ChargeRow[]).map(c => ({
    libelle: c.libelle, categorie: c.categorie,
    montant_ttc: Number(c.montant_ttc ?? 0),
    frequence: c.frequence,
  }))

  return <RapportPrintClient cr={crData.cr} tva={crData.tva} libelleMois={crData.libelle} moisIso={moisIso} etablissement={etab} charges={charges} />
}
