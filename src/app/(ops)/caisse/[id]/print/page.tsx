import { createClient } from '@/lib/supabase/server'
import { getResumeSession } from '../../../actions'
import ZReportPrintClient from './ZReportPrintClient'

export const metadata = { title: 'Rapport Z — Impression' }
export const dynamic = 'force-dynamic'

export default async function ZReportPrintPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()

  const [resume, paramsRes] = await Promise.all([
    getResumeSession(id),
    supabase
      .from('parametres')
      .select('cle, valeur')
      .in('cle', ['etablissement_nom', 'etablissement_adresse', 'etablissement_telephone', 'etablissement_email', 'etablissement_siret', 'etablissement_tva_intra']),
  ])

  const etab: Record<string, string> = {}
  for (const p of paramsRes.data ?? []) etab[p.cle as string] = (p.valeur as string) ?? ''

  if (!resume) {
    return (
      <div className="min-h-screen bg-white text-zinc-900 flex items-center justify-center p-8">
        <p className="text-center text-zinc-600">Session introuvable.</p>
      </div>
    )
  }

  return <ZReportPrintClient resume={resume} etablissement={etab} />
}
