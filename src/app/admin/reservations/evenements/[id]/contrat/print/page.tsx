import { createClient } from '@/lib/supabase/server'
import ContratPrintClient from './ContratPrintClient'

export const metadata = { title: 'Contrat privatisation — Impression', robots: { index: false, follow: false } }
export const dynamic = 'force-dynamic'

export default async function ContratPrintPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()

  const [evtRes, paramsRes] = await Promise.all([
    supabase.from('evenements').select('*').eq('id', id).maybeSingle(),
    supabase.from('parametres').select('cle, valeur').in('cle', ['etablissement_nom','etablissement_adresse','etablissement_telephone','etablissement_siret','etablissement_tva_intra']),
  ])

  if (!evtRes.data) return <div className="p-8 text-center">Événement introuvable.</div>

  const etab: Record<string, string> = {}
  for (const p of paramsRes.data ?? []) etab[p.cle as string] = (p.valeur as string) ?? ''

  const e = evtRes.data
  const numero = `CONTR-${(e.date_evenement as string).replace(/-/g, '')}-${(e.id as string).slice(0, 4).toUpperCase()}`

  return <ContratPrintClient
    evt={{
      id: e.id as string,
      titre: e.titre as string,
      date_evenement: e.date_evenement as string,
      heure_debut: (e.heure_debut as string) ?? null,
      heure_fin: (e.heure_fin as string) ?? null,
      nb_personnes: Number(e.nb_personnes ?? 0),
      taux_tva: Number(e.taux_tva ?? 10),
      montant_devis: Number(e.montant_devis ?? 0),
      acompte_verse: Number(e.acompte_verse ?? 0),
      client_nom: (e.client_nom as string) ?? null,
      client_email: (e.client_email as string) ?? null,
      client_telephone: (e.client_telephone as string) ?? null,
      lieu: (e.lieu as string) ?? null,
      materiel_demande: (e.materiel_demande as string) ?? null,
      besoins_techniques: (e.besoins_techniques as string) ?? null,
    }}
    etablissement={etab}
    numero_contrat={numero}
  />
}
