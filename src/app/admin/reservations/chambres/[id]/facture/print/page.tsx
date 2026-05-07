import { createClient } from '@/lib/supabase/server'
import FactureChambrePrintClient from './FactureChambrePrintClient'

export const metadata = { title: 'Facture séjour — Impression', robots: { index: false, follow: false } }
export const dynamic = 'force-dynamic'

export default async function FactureChambrePrintPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()

  const [resaRes, paramsRes] = await Promise.all([
    supabase.from('reservations_chambres').select('*, chambre:chambres(*)').eq('id', id).maybeSingle(),
    supabase.from('parametres').select('cle, valeur').in('cle', ['etablissement_nom','etablissement_adresse','etablissement_telephone','etablissement_email','etablissement_siret','etablissement_tva_intra']),
  ])

  if (!resaRes.data) return <div className="p-8 text-center">Réservation introuvable.</div>

  const etab: Record<string, string> = {}
  for (const p of paramsRes.data ?? []) etab[p.cle as string] = (p.valeur as string) ?? ''

  type ChambreJoin = { nom?: string; numero?: string; prix_nuit_ht?: number | string } | null
  const chambre = resaRes.data.chambre as ChambreJoin
  const numero = `SEJ-${resaRes.data.date_arrivee.replace(/-/g, '')}-${(resaRes.data.id as string).slice(0, 4).toUpperCase()}`

  return <FactureChambrePrintClient
    resa={{
      id: resaRes.data.id as string,
      client_nom: resaRes.data.client_nom as string,
      client_email: (resaRes.data.client_email as string) ?? null,
      client_telephone: (resaRes.data.client_telephone as string) ?? null,
      date_arrivee: resaRes.data.date_arrivee as string,
      date_depart: resaRes.data.date_depart as string,
      nb_personnes: Number(resaRes.data.nb_personnes ?? 1),
      montant_total: Number(resaRes.data.montant_total ?? 0),
      acompte_verse: Number(resaRes.data.acompte_verse ?? 0),
      notes: (resaRes.data.notes as string) ?? null,
    }}
    chambre={chambre ? { nom: chambre.nom ?? '—', numero: chambre.numero ?? '—', prix_nuit_ht: Number(chambre.prix_nuit_ht ?? 0) } : null}
    etablissement={etab}
    numero_facture={numero}
  />
}
