import { createClient } from '@/lib/supabase/server'
import RegistrePrintClient from './RegistrePrintClient'

export const metadata = { title: 'Registre sécurité — Impression', robots: { index: false, follow: false } }
export const dynamic = 'force-dynamic'

export type RegistreData = {
  etablissement: Record<string, string>
  controles: Array<{ equipement: string; type: string; derniere: string | null; prochaine: string | null; organisme: string | null }>
  accidents: Array<{ date: string; employe: string | null; gravite: string; description: string; jours_arret: number; declaration_cpam: boolean }>
  obligations_actives: Array<{ titre: string; categorie: string; date_echeance: string | null; statut: string }>
  affichages_manquants: Array<{ titre: string; reference: string | null }>
}

export default async function RegistreSecuritePrintPage() {
  const supabase = await createClient()
  const [paramsRes, equipRes, accRes, oblRes, affRes] = await Promise.all([
    supabase.from('parametres').select('cle, valeur').in('cle', ['etablissement_nom','etablissement_adresse','etablissement_siret']),
    supabase.from('equipements')
      .select('nom, type_controle_obligatoire, derniere_controle_obligatoire, prochain_controle_obligatoire, organisme_certifie')
      .eq('actif', true)
      .not('type_controle_obligatoire', 'is', null)
      .order('nom'),
    supabase.from('accidents_travail')
      .select('date_accident, gravite, description, jours_arret, declaration_cpam, employe:employes!employe_id(prenom, nom)')
      .order('date_accident', { ascending: false }),
    supabase.from('obligations_legales')
      .select('titre, categorie, date_echeance, statut')
      .neq('statut', 'fait')
      .order('date_echeance', { nullsFirst: false }),
    supabase.from('affichages_verifications')
      .select('titre, reference_legale')
      .eq('obligatoire', true)
      .eq('present', false),
  ])

  const etab: Record<string, string> = {}
  for (const p of paramsRes.data ?? []) etab[p.cle as string] = (p.valeur as string) ?? ''

  const controles = (equipRes.data ?? []).map(e => ({
    equipement: e.nom as string,
    type: e.type_controle_obligatoire as string,
    derniere: (e.derniere_controle_obligatoire as string) ?? null,
    prochaine: (e.prochain_controle_obligatoire as string) ?? null,
    organisme: (e.organisme_certifie as string) ?? null,
  }))

  type AccRow = { date_accident: string; gravite: string; description: string; jours_arret: number | string; declaration_cpam: boolean; employe?: { prenom?: string; nom?: string } | null }
  const accidents = ((accRes.data ?? []) as AccRow[]).map(a => ({
    date: a.date_accident,
    employe: a.employe ? `${a.employe.prenom ?? ''} ${a.employe.nom ?? ''}`.trim() : null,
    gravite: a.gravite,
    description: a.description,
    jours_arret: Number(a.jours_arret ?? 0),
    declaration_cpam: a.declaration_cpam,
  }))

  const obligations_actives = (oblRes.data ?? []).map(o => ({
    titre: o.titre as string,
    categorie: o.categorie as string,
    date_echeance: (o.date_echeance as string) ?? null,
    statut: o.statut as string,
  }))

  const affichages_manquants = (affRes.data ?? []).map(a => ({
    titre: a.titre as string,
    reference: (a.reference_legale as string) ?? null,
  }))

  return <RegistrePrintClient data={{ etablissement: etab, controles, accidents, obligations_actives, affichages_manquants }} />
}
