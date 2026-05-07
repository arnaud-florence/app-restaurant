import { createClient } from '@/lib/supabase/server'
import LegalClient from './LegalClient'
import {
  type Obligation, type Accident, type Affichage,
  type Gravite, type StatutObligation,
} from '@/lib/legal'

export const metadata = { title: 'Obligations légales — Admin' }
export const dynamic = 'force-dynamic'

export type DataLegal = {
  obligations: Obligation[]
  accidents: Accident[]
  affichages: Affichage[]
  employes: { id: string; prenom: string; nom: string; poste: string }[]
}

export default async function LegalPage() {
  const supabase = await createClient()

  const [oblRes, accRes, affRes, empRes] = await Promise.all([
    supabase.from('obligations_legales')
      .select('id, titre, categorie, description, date_echeance, frequence, statut, prestataire, document_url, notes')
      .order('date_echeance', { nullsFirst: false }),
    supabase.from('accidents_travail')
      .select('*, employe:employes!employe_id(prenom, nom)')
      .order('date_accident', { ascending: false })
      .limit(100),
    supabase.from('affichages_verifications')
      .select('*')
      .order('ordre'),
    supabase.from('employes').select('id, prenom, nom, poste').eq('actif', true).order('prenom'),
  ])

  const obligations: Obligation[] = (oblRes.data ?? []).map(o => ({
    id: o.id as string, titre: o.titre as string,
    categorie: (o.categorie as string) ?? 'autre',
    description: (o.description as string) ?? null,
    date_echeance: (o.date_echeance as string) ?? null,
    frequence: (o.frequence as string) ?? null,
    statut: (o.statut as StatutObligation) ?? 'a_faire',
    prestataire: (o.prestataire as string) ?? null,
    document_url: (o.document_url as string) ?? null,
    notes: (o.notes as string) ?? null,
  }))

  type AccRow = {
    id: string; employe_id: string | null; date_accident: string;
    heure_accident: string | null; lieu: string | null; description: string;
    gravite: string; jours_arret: number | string;
    declaration_cpam: boolean; declaration_cpam_date: string | null;
    declaration_cpam_url: string | null; temoin: string | null;
    suites: string | null; created_at: string;
    employe?: { prenom?: string; nom?: string } | null;
  }
  const accidents: Accident[] = ((accRes.data ?? []) as AccRow[]).map(a => ({
    id: a.id, employe_id: a.employe_id,
    employe_nom: a.employe ? `${a.employe.prenom ?? ''} ${a.employe.nom ?? ''}`.trim() : null,
    date_accident: a.date_accident, heure_accident: a.heure_accident,
    lieu: a.lieu, description: a.description,
    gravite: a.gravite as Gravite, jours_arret: Number(a.jours_arret ?? 0),
    declaration_cpam: a.declaration_cpam,
    declaration_cpam_date: a.declaration_cpam_date,
    declaration_cpam_url: a.declaration_cpam_url,
    temoin: a.temoin, suites: a.suites, created_at: a.created_at,
  }))

  const affichages: Affichage[] = (affRes.data ?? []).map(a => ({
    id: a.id as string,
    titre: a.titre as string,
    description: (a.description as string) ?? null,
    reference_legale: (a.reference_legale as string) ?? null,
    obligatoire: Boolean(a.obligatoire),
    present: Boolean(a.present),
    date_verification: (a.date_verification as string) ?? null,
    photo_url: (a.photo_url as string) ?? null,
    ordre: Number(a.ordre ?? 0),
    notes: (a.notes as string) ?? null,
  }))

  const employes = (empRes.data ?? []).map(e => ({
    id: e.id as string, prenom: e.prenom as string, nom: e.nom as string, poste: e.poste as string,
  }))

  return <LegalClient data={{ obligations, accidents, affichages, employes }} />
}
