import { createClient } from '@/lib/supabase/server'
import DevisPrintClient from './DevisPrintClient'

export const metadata = { title: 'Devis événementiel — Impression', robots: { index: false, follow: false } }
export const dynamic = 'force-dynamic'

export default async function DevisPrintPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()

  const [evtRes, paramsRes] = await Promise.all([
    supabase.from('evenements').select('*').eq('id', id).maybeSingle(),
    supabase.from('parametres').select('cle, valeur').in('cle', ['etablissement_nom','etablissement_adresse','etablissement_telephone','etablissement_email','etablissement_siret','etablissement_tva_intra']),
  ])

  if (!evtRes.data) return <div className="p-8 text-center">Événement introuvable.</div>

  const etab: Record<string, string> = {}
  for (const p of paramsRes.data ?? []) etab[p.cle as string] = (p.valeur as string) ?? ''

  const e = evtRes.data
  const numero = `DEV-${(e.date_evenement as string).replace(/-/g, '')}-${(e.id as string).slice(0, 4).toUpperCase()}`

  return <DevisPrintClient
    evt={{
      id: e.id as string,
      titre: e.titre as string,
      type: (e.type_evenement as string) ?? null,
      date_evenement: e.date_evenement as string,
      heure_debut: (e.heure_debut as string) ?? null,
      heure_fin: (e.heure_fin as string) ?? null,
      nb_personnes: Number(e.nb_personnes ?? 0),
      prix_par_personne_ht: e.prix_par_personne_ht != null ? Number(e.prix_par_personne_ht) : null,
      taux_tva: Number(e.taux_tva ?? 10),
      montant_devis: Number(e.montant_devis ?? 0),
      acompte_verse: Number(e.acompte_verse ?? 0),
      client_nom: (e.client_nom as string) ?? null,
      client_email: (e.client_email as string) ?? null,
      client_telephone: (e.client_telephone as string) ?? null,
      lieu: (e.lieu as string) ?? null,
      privatisation: Boolean(e.privatisation),
      materiel_demande: (e.materiel_demande as string) ?? null,
      besoins_techniques: (e.besoins_techniques as string) ?? null,
    }}
    etablissement={etab}
    numero_devis={numero}
  />
}
